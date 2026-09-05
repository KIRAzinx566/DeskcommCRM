/**
 * GUARDAR A CHAVE DA ASAAS — o miolo, sem HTTP.
 *
 * Molde de `lib/ai/credenciais/guardar.ts` (mesma lista do que os dois
 * caminhos precisam fazer IGUAL: cifrar AES-GCM, gravar só os últimos 4
 * dígitos em claro, registrar no audit, validar em segundo plano sem segurar
 * a resposta). Duas diferenças por ser gateway de pagamento, não provider de
 * LLM:
 *
 * 1. Chave de cifra SEPARADA (`BILLING_CRED_AES_KEY`, não `AI_CRED_AES_KEY`)
 *    — vazamento de credencial de um domínio não deveria expor o outro.
 * 2. Guarda também o HASH do token de webhook (nunca decifrado — só precisa
 *    bater com o que a ASAAS ecoa de volta no header `asaas-access-token`).
 */
import { createHash, randomBytes } from "node:crypto";

import { audit } from "@/lib/audit";
import { bufToBytea, encryptKey } from "@/lib/crypto/aes_gcm";
import { validarConta, type AsaasEnvironment } from "@/lib/billing/asaas/client";
import type { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoDeGuardarCredencialAsaas =
  | { ok: true; id: string; last4: string; webhookToken: string; webhookPathToken: string }
  | {
      ok: false;
      /** `ambiente_em_uso` é escolha do usuário (já tem credencial pra esse ambiente) — o resto é falha nossa. */
      motivo: "cifragem" | "ambiente_em_uso" | "banco";
      detalhe?: string;
    };

export interface PedidoDeGuardarCredencialAsaas {
  admin: ReturnType<typeof createAdminClient>;
  orgId: string;
  userId: string;
  environment: AsaasEnvironment;
  /** Plaintext. Vive só no escopo desta chamada — nunca persistido nem logado. */
  apiKey: string;
  requestId: string;
}

export async function guardarCredencialAsaas(
  p: PedidoDeGuardarCredencialAsaas,
): Promise<ResultadoDeGuardarCredencialAsaas> {
  let encrypted;
  try {
    encrypted = encryptKey(p.apiKey, "BILLING_CRED_AES_KEY");
  } catch (err) {
    return { ok: false, motivo: "cifragem", detalhe: err instanceof Error ? err.message : undefined };
  }

  // Dois segredos distintos — mesmo par que `webhook_sources` já usa
  // (`path_token` público + segredo privado). `webhookPathToken` vai na URL
  // que o tenant cola no painel ASAAS; `webhookToken` é o "token de acesso"
  // que a ASAAS ecoa de volta no header — guardamos só o HASH dele, nunca
  // precisamos ler de volta, só comparar.
  const webhookPathToken = randomBytes(24).toString("base64url");
  const webhookToken = randomBytes(24).toString("base64url");
  const webhookTokenHash = createHash("sha256").update(webhookToken).digest();

  const { data: created, error } = await p.admin
    .from("billing_gateway_credentials")
    .insert({
      organization_id: p.orgId,
      provider: "asaas",
      environment: p.environment,
      api_key_encrypted: bufToBytea(encrypted.ciphertext),
      api_key_iv: bufToBytea(encrypted.iv),
      api_key_tag: bufToBytea(encrypted.tag),
      api_key_last4: encrypted.last4,
      webhook_path_token: webhookPathToken,
      webhook_token_hash: bufToBytea(webhookTokenHash),
      is_active: true,
      created_by: p.userId,
    })
    .select("id")
    .single();

  if (error || !created) {
    if (error?.code === "23505") return { ok: false, motivo: "ambiente_em_uso" };
    return { ok: false, motivo: "banco", detalhe: error?.message };
  }

  const id = created.id as string;

  await audit({
    action: "billing.credential_created",
    actorUserId: p.userId,
    organizationId: p.orgId,
    resourceType: "billing_gateway_credential",
    resourceId: id,
    requestId: p.requestId,
    metadata: { provider: "asaas", environment: p.environment, last4: encrypted.last4 },
  });

  // Fire-and-forget, mesmo padrão de `lib/ai/credenciais/guardar.ts`: guardar
  // a chave e validá-la contra a ASAAS são coisas diferentes — a segunda pode
  // falhar por rede sem que a primeira precise ser desfeita.
  void validarEmSegundoPlano(p.admin, id, p.orgId, p.environment, p.apiKey, p.requestId);

  // O plaintext do webhook token só existe AGORA — depois disto só o hash
  // vive no banco. É por isso que a rota que chama isto tem de mostrá-lo ao
  // usuário nesta mesma resposta, uma vez só (mesmo princípio do bearer
  // token de `api_tokens`).
  return { ok: true, id, last4: encrypted.last4, webhookToken, webhookPathToken };
}

async function validarEmSegundoPlano(
  admin: ReturnType<typeof createAdminClient>,
  credentialId: string,
  organizationId: string,
  environment: AsaasEnvironment,
  apiKey: string,
  requestId: string,
): Promise<void> {
  try {
    const conta = await validarConta({ apiKey, environment }, requestId);
    await admin
      .from("billing_gateway_credentials")
      .update({
        validated_at: new Date().toISOString(),
        validation_error: null,
        asaas_cpf_cnpj: conta.cpfCnpj,
      })
      .eq("id", credentialId)
      .eq("organization_id", organizationId);
  } catch (err) {
    await admin
      .from("billing_gateway_credentials")
      .update({
        validated_at: null,
        validation_error: err instanceof Error ? err.message : "Falha desconhecida ao validar.",
      })
      .eq("id", credentialId)
      .eq("organization_id", organizationId);
  }
}
