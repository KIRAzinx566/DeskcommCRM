/**
 * Consumidor de `billing.charge_status_changed` — o que é LENTO/de timeline,
 * fora do handler síncrono do webhook (`app/api/v1/webhooks/asaas/[token]/route.ts`).
 *
 * Só dois desfechos viram linha na timeline: `paid` (dinheiro recebeu de
 * verdade) e `cancelled`/`refunded` (o inverso). `overdue` não gera atividade
 * — é o estado esperado de "venceu e não pagou", ruído demais para o
 * dossiê se cada vencimento tocasse alarme.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createAdminClient } from "@/lib/supabase/admin";

export const BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY = "billing-charge-status-changed.v1";

interface Payload {
  charge_id: string;
  contact_id: string | null;
  lead_id: string | null;
  previous_status: string;
  new_status: string;
}

export const billingChargeStatusChangedHandler: EventHandler = {
  key: BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY,
  events: ["billing.charge_status_changed"],
  async handle(row): Promise<HandlerResult> {
    const p = row.payload as unknown as Payload;

    if (!p.lead_id) {
      // Cobrança sem negócio ancorado (contato existe, lead não) — não há
      // timeline para escrever. Não é erro: nem toda cobrança nasce de um
      // negócio aberto.
      return { consumer_key: BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY, status: "skipped", detail: "sem_lead" };
    }

    const tipo =
      p.new_status === "paid"
        ? ("billing_charge_paid" as const)
        : p.new_status === "cancelled" || p.new_status === "refunded"
          ? ("billing_charge_cancelled" as const)
          : null;
    if (!tipo) {
      return { consumer_key: BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY, status: "skipped", detail: p.new_status };
    }

    const admin = createAdminClient();
    const resultado = await emitLeadActivity(admin, {
      organizationId: row.organization_id,
      leadId: p.lead_id,
      contactId: p.contact_id,
      type: tipo,
      sourceModule: "billing",
      sourceId: p.charge_id,
      actor: { type: "webhook_source", id: "asaas" },
      reason:
        tipo === "billing_charge_paid"
          ? "Pagamento confirmado pela ASAAS."
          : `Cobrança encerrada pela ASAAS (${p.new_status}).`,
    });

    if (!resultado.ok) {
      return { consumer_key: BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY, status: "retry", retry_at: new Date(Date.now() + 60_000).toISOString(), detail: resultado.error };
    }
    return { consumer_key: BILLING_CHARGE_STATUS_CHANGED_HANDLER_KEY, status: "ok", detail: tipo };
  },
};
