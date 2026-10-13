/**
 * GET/PATCH /api/v1/settings/precos — a régua de preço da loja.
 *
 * Duas configurações que mudam o que o AGENTE diz de preço, numa rota só
 * porque a tela é uma só (Produtos › Preços e parcelas):
 *
 *   - `organizations.settings.catalogo` — a TABELA DO DIA
 *     (`lib/catalogo/tabela-do-dia.ts`): com `validade = mesmo_dia`, a busca de
 *     produtos do agente para de devolver preço quando ninguém conferiu a tabela
 *     hoje.
 *   - `organizations.settings.parcelamento` — as TAXAS DO CARTÃO
 *     (`lib/financeiro/parcelamento.ts`), que a busca de produtos (`crm_search_products`, parâmetro `vezes`)
 *     usa para dizer o valor exato de cada parcela.
 *
 * "Conferir a tabela" é `conferir_agora: true`: o instante vem do SERVIDOR,
 * nunca do corpo — o relógio de quem clicou não decide se o preço vale hoje.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { reguaDaTela, type LinhaDaRegua } from "@/lib/catalogo/regua-de-preco";
import { lerConfigDaTabela, VALIDADES_DA_TABELA, type ConfigDaTabela } from "@/lib/catalogo/tabela-do-dia";
import {
  lerConfigDoParcelamento,
  lerTabelaDeTaxas,
  MAX_PARCELAS,
  type ConfigDoParcelamento,
} from "@/lib/financeiro/parcelamento";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    validade: z.enum(VALIDADES_DA_TABELA).optional(),
    conferir_agora: z.literal(true).optional(),
    /** A tabela de taxas como a loja cola: "Débito – 2,29%", "2x – 5,13%"… Vazio apaga. */
    taxas_texto: z.string().max(4000).optional(),
    sem_acrescimo_ate: z.number().int().min(0).max(MAX_PARCELAS).optional(),
  })
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: "nada para mudar" });

type Linha = LinhaDaRegua;
const resposta = (linha: Linha | null) => reguaDaTela(linha);

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings, timezone, currency")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) {
    return fail("internal_error", traduzir("Falha ao carregar.", authz.user.idioma), 500, { requestId });
  }
  return ok(resposta(data as Linha | null), { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  // Mesmo papel de quem edita preço de produto: é escrita de gestão.
  const authz = await requireRole("manager", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  const pedido = parsed.data;

  let taxasLidas: ReturnType<typeof lerTabelaDeTaxas> | null = null;
  if (pedido.taxas_texto !== undefined) {
    taxasLidas = lerTabelaDeTaxas(pedido.taxas_texto);
    // Linha que não se lê RECUSA o salvar inteiro, com as linhas na resposta:
    // gravar a metade que se leu deixaria a loja achando que salvou a tabela
    // toda — e o agente diria "essa opção não existe" para a parcela perdida.
    if (taxasLidas.ignoradas.length > 0) {
      return fail(
        "validation_failed",
        t("Não consegui ler algumas linhas da tabela de taxas. Use o formato \"10x – 10,2%\"."),
        422,
        { requestId, details: { linhas: taxasLidas.ignoradas } },
      );
    }
  }

  // ADMIN CLIENT: a RLS de `organizations` só deixa platform_admin fazer
  // UPDATE — um manager comum casaria 0 linhas em silêncio (issue #144). O gate
  // de papel acima é a proteção real, e o filtro é o `orgId` da sessão.
  const supabase = createAdminClient();
  const { data: atual, error: erroLeitura } = await supabase
    .from("organizations")
    .select("settings, timezone, currency")
    .eq("id", authz.org.orgId)
    .single();
  if (erroLeitura || !atual) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });

  const settingsAtual = ((atual as Linha).settings as Record<string, unknown> | null) ?? {};
  const tabelaAtual = lerConfigDaTabela(settingsAtual);
  const parcelamentoAtual = lerConfigDoParcelamento(settingsAtual);

  const tabela: ConfigDaTabela = {
    validade: pedido.validade ?? tabelaAtual.validade,
    conferida_em: pedido.conferir_agora ? new Date().toISOString() : tabelaAtual.conferida_em,
  };
  const parcelamento: ConfigDoParcelamento = {
    debito: taxasLidas ? taxasLidas.debito : parcelamentoAtual.debito,
    credito: taxasLidas ? taxasLidas.credito : parcelamentoAtual.credito,
    sem_acrescimo_ate: pedido.sem_acrescimo_ate ?? parcelamentoAtual.sem_acrescimo_ate,
  };

  const settingsNovo = { ...settingsAtual, catalogo: tabela, parcelamento };
  const { error } = await supabase.from("organizations").update({ settings: settingsNovo }).eq("id", authz.org.orgId);
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });

  const mudouConfig =
    pedido.validade !== undefined || pedido.taxas_texto !== undefined || pedido.sem_acrescimo_ate !== undefined;
  if (mudouConfig) {
    void audit({
      action: "pricing.config_changed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "organization",
      resourceId: authz.org.orgId,
      requestId,
      metadata: {
        ...(pedido.validade !== undefined ? { validade: pedido.validade } : {}),
        ...(taxasLidas ? { debito: taxasLidas.debito, credito: taxasLidas.credito } : {}),
        ...(pedido.sem_acrescimo_ate !== undefined ? { sem_acrescimo_ate: pedido.sem_acrescimo_ate } : {}),
      },
    });
  }
  if (pedido.conferir_agora) {
    void audit({
      action: "pricing.table_confirmed",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "organization",
      resourceId: authz.org.orgId,
      requestId,
      metadata: { conferida_em: tabela.conferida_em, via: "tela" },
    });
  }

  return ok(resposta({ ...(atual as Linha), settings: settingsNovo }), { requestId });
}
