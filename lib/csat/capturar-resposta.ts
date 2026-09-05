/**
 * Consumidor de `message.received` — olha toda mensagem recebida procurando
 * uma pesquisa de CSAT pendente pro mesmo contato.
 *
 * NUNCA interfere no caminho normal da mensagem: só lê `csat_requests` e
 * escreve nela. Uma resposta que não interpreta como nota deixa a mensagem
 * seguir pro inbox normalmente — a pesquisa continua `pending` até expirar.
 * O motor de automação já escuta o mesmo evento (`lib/automation/engine.
 * handler.ts`); o event_log suporta vários consumidores por evento
 * (`consumed_by`), então os dois convivem sem disputar nada.
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { interpretarNota } from "@/lib/csat/interpretar-nota";

export const CSAT_REPLY_HANDLER_KEY = "csat-capturar-resposta.v1";

interface Payload {
  contact_id?: string;
  body_preview?: string;
}

export const csatReplyHandler: EventHandler = {
  key: CSAT_REPLY_HANDLER_KEY,
  events: ["message.received"],
  async handle(row): Promise<HandlerResult> {
    const p = row.payload as unknown as Payload;
    if (!p.contact_id || typeof p.body_preview !== "string") {
      return { consumer_key: CSAT_REPLY_HANDLER_KEY, status: "ok", detail: "sem_contato_ou_corpo" };
    }

    const admin = createAdminClient();
    const { data: pendente } = await admin
      .from("csat_requests")
      .select("id, expires_at")
      .eq("organization_id", row.organization_id)
      .eq("contact_id", p.contact_id)
      .eq("status", "pending")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pendente) {
      return { consumer_key: CSAT_REPLY_HANDLER_KEY, status: "ok", detail: "sem_pesquisa_pendente" };
    }

    // Comparação por Date, não por string: `expires_at` volta do Postgres num
    // formato que não bate byte-a-byte com `Date.toISOString()` (offset "+00"
    // vs "Z", casas decimais diferentes) — comparar como texto arriscaria
    // "expirou" errado pro lado errado.
    if (new Date(pendente.expires_at).getTime() < Date.now()) {
      await admin.from("csat_requests").update({ status: "expired" }).eq("id", pendente.id);
      return { consumer_key: CSAT_REPLY_HANDLER_KEY, status: "ok", detail: "expirada" };
    }

    const nota = interpretarNota(p.body_preview);
    if (nota === null) {
      return { consumer_key: CSAT_REPLY_HANDLER_KEY, status: "ok", detail: "nao_interpretavel" };
    }

    const { error } = await admin
      .from("csat_requests")
      .update({
        status: "answered",
        score: nota,
        raw_reply: p.body_preview,
        answered_at: new Date().toISOString(),
      })
      .eq("id", pendente.id);
    if (error) {
      return {
        consumer_key: CSAT_REPLY_HANDLER_KEY,
        status: "retry",
        retry_at: new Date(Date.now() + 60_000).toISOString(),
        detail: error.message,
      };
    }
    return { consumer_key: CSAT_REPLY_HANDLER_KEY, status: "ok", detail: `nota_${nota}` };
  },
};
