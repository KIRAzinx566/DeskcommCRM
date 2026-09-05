/**
 * POST /api/v1/webhooks/asaas/[token] — confirmação de pagamento da ASAAS.
 *
 * Molde de `app/api/v1/webhooks/in/[token]/route.ts` (WAHA/captação): o token
 * do PATH resolve a organização — nunca o body —, e o header
 * `asaas-access-token` é a segunda camada (o segredo que o tenant colou no
 * painel da ASAAS), comparado por hash com `crypto.timingSafeEqual`. Duas
 * etapas: arquiva o payload bruto SEMPRE (mesmo se o parse tipado falhar
 * depois), e só então aplica a lógica tipada.
 *
 * Atualização de `billing_charges` acontece INLINE (é escrita rápida em
 * banco, não HTTP — mesmo padrão de `dispatchWahaEvent` atualizando
 * `messages`/`conversations` sincronamente). O que é lento/externo (timeline,
 * cancelar lembrete pendente) vira `event_log` para um worker consumir depois
 * — nenhuma chamada de rede acontece dentro deste handler.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { byteaToBuffer } from "@/lib/crypto/aes_gcm";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

const RATE_LIMIT_PER_MIN = 60;

/** O status ASAAS → o nosso vocabulário fechado de `billing_charges.status`. */
const STATUS_POR_EVENTO: Record<string, string> = {
  PAYMENT_CONFIRMED: "paid",
  PAYMENT_RECEIVED: "paid",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_REFUNDED: "refunded",
  PAYMENT_DELETED: "cancelled",
};

function timingSafeEqualHex(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { token } = await ctx.params;
  if (!token || token.length < 8) {
    return fail("not_found", "unknown webhook token", 404, { requestId });
  }

  const rl = await checkRateLimit(`asaas_webhook:${token}`, RATE_LIMIT_PER_MIN, 60);
  if (!rl.allowed) {
    return fail("rate_limited", "Too many requests.", 429, { requestId, headers: { "Retry-After": "60" } });
  }

  const admin = createAdminClient();
  const { data: credencial, error: credErr } = await admin
    .from("billing_gateway_credentials")
    .select("id, organization_id, webhook_token_hash, is_active")
    .eq("webhook_path_token", token)
    .maybeSingle();
  if (credErr) return fail("internal_error", credErr.message, 500, { requestId });
  if (!credencial || !credencial.is_active) {
    return fail("not_found", "unknown webhook token", 404, { requestId });
  }

  const rawBody = await req.text();
  const headerToken = req.headers.get("asaas-access-token");
  const validSignature =
    headerToken !== null &&
    timingSafeEqualHex(
      createHash("sha256").update(headerToken).digest(),
      byteaToBuffer(credencial.webhook_token_hash),
    );

  // Fail-closed: header presente e ERRADO é sempre recusado. A regra de
  // "aceitar sem header" (WAHA) não se aplica aqui — cadastro de credencial
  // sempre gera o par, então "sem header" é sempre uma tentativa inválida.
  if (!validSignature) {
    await audit({
      action: "billing.webhook_invalid_signature",
      organizationId: credencial.organization_id,
      resourceType: "billing_gateway_credential",
      resourceId: credencial.id,
      requestId,
    });
    return fail("unauthenticated", "invalid_signature", 401, { requestId });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const eventType = typeof payload.event === "string" ? payload.event : "unknown";
  const pagamento = (payload.payment ?? {}) as Record<string, unknown>;
  const asaasChargeId = typeof pagamento.id === "string" ? pagamento.id : null;
  // ⚠️ CONFIRMADO contra um webhook REAL de sandbox (2026-09-04, capturado via
  // webhook.site): o envelope TEM `id` de entrega estável no topo
  // (`"evt_...&..."`) — a suposição original ("não há id estável") estava
  // errada e usava um par (cobrança, tipo de evento) sintético, que dedupe
  // demais: dois eventos DIFERENTES do mesmo tipo pra mesma cobrança (raro,
  // mas possível — ex. duas tentativas de pagamento) colidiriam como se
  // fossem o mesmo. O `id` real do envelope é a chave certa.
  const externalEventId =
    typeof payload.id === "string"
      ? payload.id
      : asaasChargeId
        ? `${asaasChargeId}:${eventType}:${crypto.randomUUID()}`
        : `sem_pagamento:${crypto.randomUUID()}`;

  const { error: insertLogErr } = await admin.from("billing_webhook_events").insert({
    organization_id: credencial.organization_id,
    external_event_id: externalEventId,
    event_type: eventType,
    raw_payload: payload,
    signature_verified: true,
  });
  if (insertLogErr) {
    if (insertLogErr.code === "23505") {
      // Retry exato do mesmo evento — já processado, 200 idempotente.
      return ok({ deduped: true }, { requestId });
    }
    logger.error("[billing.webhook] falha ao arquivar evento", {
      organization_id: credencial.organization_id,
      error: insertLogErr.message,
    });
  }

  const novoStatus = STATUS_POR_EVENTO[eventType];
  if (!novoStatus || !asaasChargeId) {
    // Evento que não muda status conhecido (ex.: PAYMENT_CREATED, que já
    // sabemos porque criamos) — arquivado acima, sem mais ação.
    return ok({ ignored: true }, { requestId });
  }

  const { data: cobranca, error: erroCobranca } = await admin
    .from("billing_charges")
    .select("id, status, contact_id, lead_id")
    .eq("organization_id", credencial.organization_id)
    .eq("external_id", asaasChargeId)
    .maybeSingle();
  if (erroCobranca) return fail("internal_error", erroCobranca.message, 500, { requestId });
  if (!cobranca) {
    // A ASAAS conhece uma cobrança que não é nossa (ou já foi apagada) — não
    // é erro do webhook, é um id que não casa. Fica arquivado, nada mais.
    return ok({ ignored: true, motivo: "cobranca_nao_encontrada" }, { requestId });
  }

  // Idempotente: status já é este (retry de evento, ou dois webhooks fora de
  // ordem) — não reemitiu atividade/evento duas vezes.
  if (cobranca.status === novoStatus) {
    return ok({ id: cobranca.id, status: novoStatus, ja_estava: true }, { requestId });
  }

  const patch: Record<string, unknown> = { status: novoStatus };
  if (novoStatus === "paid") patch.paid_at = new Date().toISOString();

  const { error: erroUpdate } = await admin
    .from("billing_charges")
    .update(patch)
    .eq("id", cobranca.id)
    .eq("organization_id", credencial.organization_id);
  if (erroUpdate) return fail("internal_error", erroUpdate.message, 500, { requestId });

  // O que é LENTO (timeline, cancelar lembrete pendente, avisar o agente) vira
  // event_log — nenhuma chamada de rede dentro deste handler.
  await admin.from("event_log").insert({
    organization_id: credencial.organization_id,
    event_type: "billing.charge_status_changed",
    entity_kind: "billing_charge",
    entity_id: cobranca.id,
    payload: {
      charge_id: cobranca.id,
      contact_id: cobranca.contact_id,
      lead_id: cobranca.lead_id,
      previous_status: cobranca.status,
      new_status: novoStatus,
    },
  });

  return ok({ id: cobranca.id, status: novoStatus }, { requestId });
}
