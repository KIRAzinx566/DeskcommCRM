/**
 * A REGRA de gerar, consultar e cancelar cobrança — fora da rota, de propósito.
 *
 * ⚠️ UMA FERRAMENTA MCP NÃO CHAMA ROTA NEXT. Mesmo padrão do `_handler` de
 * agenda (`app/api/v1/agenda/agendamentos/_handler.ts`): a regra mora aqui, a
 * ROTA e a TOOL chamam a mesma função.
 *
 * ⚠️ A ORGANIZAÇÃO ENTRA POR PARÂMETRO (`ctx.organization_id`), nunca resolvida
 * aqui — e vai em TODA query, porque `supabase` chega como service role (a
 * tool bypassa RLS) e sem o filtro explícito o agente enxergaria cobrança de
 * outra organização.
 *
 * A recusa sai como `ApiError`: a rota traduz em `fail()`, a tool traduz para
 * o modelo — nenhum dos dois reimplementa a decisão.
 */
import {
  buscarLinhaDigitavelBoleto,
  buscarPixQrCode,
  cancelarCobranca,
  criarCobranca,
  resolverClienteAsaas,
  type AsaasEnvironment,
  type AsaasMethod,
} from "@/lib/billing/asaas/client";
import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import { audit } from "@/lib/audit";
import { byteaToBuffer, decryptKey } from "@/lib/crypto/aes_gcm";
import { resolveActiveLeadForContact, type LeadCandidate } from "@/lib/leads/active-lead";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { registraFalhaDeAtividade } from "@/lib/leads/activity-write-failure";
import { ALVO_DE_VINCULO_DA_COBRANCA, VINCULO_DE_COBRANCA } from "@/lib/billing/tipos";
import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

type SB = SupabaseClient;

export interface CriarCobrancaInput {
  contact_id: string;
  lead_id?: string;
  method: AsaasMethod;
  amount_cents: number;
  /** ISO `YYYY-MM-DD`. Ausente = vence hoje (boleto/pix à vista). */
  due_date?: string;
  description?: string;
  /** Exigido pela ASAAS para cadastrar o "customer" — sem CPF/CNPJ não há cobrança. */
  cpf_cnpj: string;
}

export interface CancelarCobrancaInput {
  id: string;
  reason: string;
}

export interface ConsultarCobrancaInput {
  id: string;
}

export interface ListarCobrancasInput {
  contact_id?: string;
  lead_id?: string;
  status?: string;
  limite?: number;
}

/**
 * ⚠️ `GenericStringError`: o `.select()` do postgrest-js falha em extrair o
 * tipo por coluna aqui (mesma pegadinha documentada em
 * `app/api/v1/contacts/[id]/timeline/route.ts`). Quem chama faz o cast em
 * DUAS etapas via `unknown` — é o molde já aceito neste repo, não um bug
 * a perseguir.
 */
const COLUNAS_COBRANCA =
  "id, organization_id, contact_id, lead_id, external_id, method, status, amount_cents, currency, " +
  "due_date, description, boleto_url, boleto_barcode, pix_qr_code, pix_copy_paste, invoice_url, " +
  "paid_at, created_at, updated_at";

export async function criarCobrancaHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: CriarCobrancaInput,
): Promise<Record<string, unknown>> {
  if (input.amount_cents <= 0) {
    throw new ApiError(422, "billing_valor_invalido", undefined, ctx.requestId, "O valor da cobrança precisa ser maior que zero.");
  }

  // O contato É INPUT EXTERNO e precisa ser RESOLVIDO contra a organização,
  // nunca repassado cru — mesmo cuidado de `agenda/agendamentos/_handler.ts`.
  const { data: contato, error: erroContato } = await supabase
    .from("contacts")
    .select("id, name, display_name, email, phone_number")
    .eq("id", input.contact_id)
    .eq("organization_id", ctx.organization_id)
    .maybeSingle();
  if (erroContato) throw new ApiError(500, "internal_error", undefined, ctx.requestId, erroContato.message);
  if (!contato) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Contato não encontrado.");

  const credencial = await exigeCredencialAtiva(supabase, ctx);

  const asaasCustomerId = await resolverClienteAsaas(
    credencial.asaas,
    {
      externalReference: contato.id as string,
      nome: (contato.name as string | null) ?? (contato.display_name as string | null) ?? "Cliente",
      cpfCnpj: input.cpf_cnpj,
      email: (contato.email as string | null) ?? undefined,
      telefone: (contato.phone_number as string | null) ?? undefined,
    },
    ctx.requestId,
  );

  // Uma linha LOCAL nasce ANTES de chamar a ASAAS: é o `id` dela que carimbamos
  // em `externalReference` no pedido — o webhook, quando chegar, casa por ESSE
  // valor sem depender de `external_id` (que só existe depois da resposta).
  const dueDate = input.due_date ?? new Date().toISOString().slice(0, 10);
  const { data: rascunho, error: erroRascunho } = await supabase
    .from("billing_charges")
    .insert({
      organization_id: ctx.organization_id,
      gateway_credential_id: credencial.id,
      contact_id: contato.id,
      lead_id: input.lead_id ?? null,
      method: input.method,
      status: "pending",
      amount_cents: input.amount_cents,
      due_date: dueDate,
      description: input.description ?? null,
      created_by_user_id: ctx.actor.type === "user" ? ctx.actor.id : null,
      created_by_api_token_id: ctx.actor.type === "ai_agent" ? (ctx.actor.api_token_id ?? null) : null,
    })
    .select("id")
    .single();
  if (erroRascunho || !rascunho) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, erroRascunho?.message);
  }

  let cobranca;
  try {
    cobranca = await criarCobranca(
      credencial.asaas,
      {
        asaasCustomerId,
        method: input.method,
        amountCents: input.amount_cents,
        dueDate,
        description: input.description,
        externalReference: rascunho.id as string,
      },
      ctx.requestId,
    );
  } catch (err) {
    // A ASAAS recusou (ou caiu): a linha local fica como testemunho da
    // tentativa, marcada `failed` — nunca apagada, para o operador ver O QUE
    // foi tentado e por quê não saiu.
    await supabase
      .from("billing_charges")
      .update({ status: "failed" })
      .eq("id", rascunho.id as string)
      .eq("organization_id", ctx.organization_id);
    throw err;
  }

  let pix: { qr_code: string; copy_paste: string } | null = null;
  if (input.method === "pix") {
    try {
      const qr = await buscarPixQrCode(credencial.asaas, cobranca.id, ctx.requestId);
      pix = { qr_code: qr.encodedImage, copy_paste: qr.payload };
    } catch (err) {
      // O Pix foi CRIADO (a ASAAS já confirmou) — só o QR falhou ao buscar.
      // Não desfaz a cobrança por isso: ela existe, e o QR pode ser buscado
      // de novo depois. Loga para investigar, não derruba a resposta.
      logger.error("[billing] cobrança Pix criada mas QR falhou", {
        organization_id: ctx.organization_id,
        charge_id: rascunho.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // `identificationField` ("linha digitável") é o que a pessoa COPIA pra
  // pagar sem escanear nada — testado contra a API real, o `barCode` sozinho
  // não serve pra isso (formato diferente). Mesmo tratamento de erro do Pix:
  // o boleto já existe, só a busca da linha falhou.
  let boletoBarcode: string | null = null;
  if (input.method === "boleto") {
    try {
      const linha = await buscarLinhaDigitavelBoleto(credencial.asaas, cobranca.id, ctx.requestId);
      boletoBarcode = linha.identificationField;
    } catch (err) {
      logger.error("[billing] cobrança boleto criada mas linha digitável falhou", {
        organization_id: ctx.organization_id,
        charge_id: rascunho.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const { data: salvo, error: erroUpdate } = await supabase
    .from("billing_charges")
    .update({
      external_id: cobranca.id,
      status: "awaiting_payment",
      invoice_url: cobranca.invoiceUrl,
      boleto_url: cobranca.bankSlipUrl,
      boleto_barcode: boletoBarcode,
      pix_qr_code: pix?.qr_code ?? null,
      pix_copy_paste: pix?.copy_paste ?? null,
      payload: cobranca as unknown as Record<string, unknown>,
    })
    .eq("id", rascunho.id as string)
    .eq("organization_id", ctx.organization_id)
    .select(COLUNAS_COBRANCA)
    .single();
  if (erroUpdate) throw new ApiError(500, "internal_error", undefined, ctx.requestId, erroUpdate.message);
  // `GenericStringError`: mesma pegadinha documentada em
  // `app/api/v1/contacts/[id]/timeline/route.ts` — coluna montada fora de
  // literal inline apaga a inferência do postgrest-js. Cast em duas etapas,
  // via `unknown`, é o molde já aceito neste repo.
  const salvoRow = salvo as unknown as Record<string, unknown>;

  await fecharOLaco(supabase, ctx, {
    chargeId: salvoRow.id as string,
    contactId: contato.id as string,
    leadIdInformado: input.lead_id ?? null,
    tipo: "billing_charge_created",
    reason: `Cobrança de ${input.method} gerada`,
  });

  void audit({
    action: "billing.charge_created",
    actorUserId: ctx.actor.type === "user" ? ctx.actor.id : null,
    organizationId: ctx.organization_id,
    resourceType: "billing_charge",
    resourceId: salvoRow.id as string,
    requestId: ctx.requestId,
    metadata: { method: input.method, amount_cents: input.amount_cents, environment: credencial.environment },
  });

  return salvoRow;
}

export async function cancelarCobrancaHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: CancelarCobrancaInput,
): Promise<Record<string, unknown>> {
  const atual = await exigeCobranca(supabase, ctx, input.id);

  // Idempotente: cancelar o que já está cancelado devolve o estado, não erro —
  // mesmo princípio de `crm_cancel_appointment`.
  if (atual.status === "cancelled") {
    return { id: atual.id, status: "cancelled", ja_estava: true };
  }
  if (atual.status === "paid" || atual.status === "refunded") {
    throw new ApiError(
      422,
      "billing_ja_pago",
      undefined,
      ctx.requestId,
      "Esta cobrança já foi paga — cancelar não é a operação certa aqui. Reembolso é decisão de uma pessoa.",
    );
  }

  const credencial = await exigeCredencialAtiva(supabase, ctx);
  if (atual.external_id) {
    await cancelarCobranca(credencial.asaas, atual.external_id as string, ctx.requestId);
  }

  const { data: salvo, error: erroUpdate } = await supabase
    .from("billing_charges")
    .update({ status: "cancelled" })
    .eq("id", atual.id as string)
    .eq("organization_id", ctx.organization_id)
    .select(COLUNAS_COBRANCA)
    .single();
  if (erroUpdate) throw new ApiError(500, "internal_error", undefined, ctx.requestId, erroUpdate.message);
  const salvoRow = salvo as unknown as Record<string, unknown>;

  await fecharOLaco(supabase, ctx, {
    chargeId: atual.id as string,
    contactId: atual.contact_id as string | null,
    leadIdInformado: (atual.lead_id as string | null) ?? null,
    tipo: "billing_charge_cancelled",
    reason: `Cobrança cancelada: ${input.reason}`,
  });

  void audit({
    action: "billing.charge_cancelled",
    actorUserId: ctx.actor.type === "user" ? ctx.actor.id : null,
    organizationId: ctx.organization_id,
    resourceType: "billing_charge",
    resourceId: atual.id as string,
    requestId: ctx.requestId,
    metadata: { reason: input.reason },
  });

  return salvoRow;
}

export async function consultarCobrancaHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: ConsultarCobrancaInput,
): Promise<Record<string, unknown>> {
  return exigeCobranca(supabase, ctx, input.id);
}

export async function listarCobrancasHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: ListarCobrancasInput,
): Promise<Record<string, unknown>[]> {
  let q = supabase
    .from("billing_charges")
    .select(COLUNAS_COBRANCA)
    .eq("organization_id", ctx.organization_id)
    .order("created_at", { ascending: false })
    .limit(input.limite ?? 20);

  if (input.contact_id) q = q.eq("contact_id", input.contact_id);
  if (input.lead_id) q = q.eq("lead_id", input.lead_id);
  if (input.status) q = q.eq("status", input.status);

  const { data, error } = await q;
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

/** A cobrança, ou 404 — sempre com o filtro de organização. */
async function exigeCobranca(supabase: SB, ctx: HandlerCtx, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("billing_charges")
    .select(COLUNAS_COBRANCA)
    .eq("organization_id", ctx.organization_id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  if (!data) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Cobrança não encontrada.");
  return data as unknown as Record<string, unknown>;
}

/**
 * A credencial ATIVA da organização, decifrada — pronta pro cliente ASAAS.
 *
 * Uma organização pode ter sandbox E produção cadastradas ao mesmo tempo
 * (ambientes distintos, `unique(organization_id, environment)`). Produção
 * vence quando as duas existem: sandbox é para testar a integração, e o
 * padrão nunca deve ser "cobra de verdade sem ninguém ter escolhido".
 */
async function exigeCredencialAtiva(
  supabase: SB,
  ctx: HandlerCtx,
): Promise<{ id: string; environment: AsaasEnvironment; asaas: { apiKey: string; environment: AsaasEnvironment } }> {
  const { data, error } = await supabase
    .from("billing_gateway_credentials")
    .select("id, environment, api_key_encrypted, api_key_iv, api_key_tag")
    .eq("organization_id", ctx.organization_id)
    .eq("is_active", true);
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  if (!data || data.length === 0) {
    throw new ApiError(
      422,
      "billing_gateway_nao_configurado",
      undefined,
      ctx.requestId,
      "Nenhuma credencial de pagamento (ASAAS) configurada para esta organização.",
    );
  }

  const escolhida = data.find((c) => c.environment === "production") ?? data[0]!;
  const apiKey = decryptKey(
    {
      ciphertext: byteaToBuffer(escolhida.api_key_encrypted),
      iv: byteaToBuffer(escolhida.api_key_iv),
      tag: byteaToBuffer(escolhida.api_key_tag),
    },
    "BILLING_CRED_AES_KEY",
  );

  return {
    id: escolhida.id as string,
    environment: escolhida.environment as AsaasEnvironment,
    asaas: { apiKey, environment: escolhida.environment as AsaasEnvironment },
  };
}

/**
 * Os DOIS emissores do laço, no mesmo fluxo da mutação — molde de
 * `fecharOLaco` da agenda, sem o espelho do Google (não existe aqui).
 *
 * `crm_lead_links` faz a cobrança PERTENCER ao negócio (o dossiê a lista);
 * `crm_lead_activities` é o que aparece na TIMELINE. Se `lead_id` não veio
 * explícito, tenta resolver pelo negócio ATIVO do contato — mesma régua de
 * `leadAtivoDoContato` na agenda.
 */
async function fecharOLaco(
  supabase: SB,
  ctx: HandlerCtx,
  args: {
    chargeId: string;
    contactId: string | null;
    leadIdInformado: string | null;
    tipo: "billing_charge_created" | "billing_charge_cancelled";
    reason: string;
  },
): Promise<void> {
  const leadId =
    args.leadIdInformado ?? (args.contactId ? await leadAtivoDoContato(supabase, ctx, args.contactId) : null);

  if (!leadId) {
    if (args.contactId) {
      await registraFalhaDeAtividade(supabase, {
        organizationId: ctx.organization_id,
        leadId: args.contactId,
        tipo: args.tipo,
        origem: "cobrança (sem negócio aberto para ancorar)",
        erro: undefined,
      });
    }
    return;
  }

  await supabase.from("crm_lead_links").insert({
    organization_id: ctx.organization_id,
    lead_id: leadId,
    target_kind: ALVO_DE_VINCULO_DA_COBRANCA,
    target_id: args.chargeId,
    link_kind: VINCULO_DE_COBRANCA,
    created_by_user_id: ctx.actor.type === "user" ? ctx.actor.id : null,
  });

  await emitLeadActivity(supabase, {
    organizationId: ctx.organization_id,
    leadId,
    contactId: args.contactId,
    type: args.tipo,
    sourceModule: "billing",
    sourceId: args.chargeId,
    actor: ctx.actor,
    reason: args.reason,
  });
}

/** O negócio ativo do contato — pela MESMA régua do resto do produto (agenda, retenção). */
async function leadAtivoDoContato(supabase: SB, ctx: HandlerCtx, contactId: string): Promise<string | null> {
  const [{ data: candidatos }, { data: padrao }] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("id, organization_id, pipeline_id, status, last_activity_at, created_at")
      .eq("organization_id", ctx.organization_id)
      .eq("contact_id", contactId),
    supabase
      .from("crm_pipelines")
      .select("id")
      .eq("organization_id", ctx.organization_id)
      .eq("is_default", true)
      .eq("is_archived", false)
      .maybeSingle(),
  ]);

  const rota = resolveActiveLeadForContact((candidatos ?? []) as LeadCandidate[], {
    defaultPipelineId: (padrao as { id: string } | null)?.id ?? null,
  });
  return rota.routed ? rota.leadId : null;
}
