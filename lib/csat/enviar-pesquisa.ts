/**
 * Consumidor de `conversation.closed` — manda a pergunta de CSAT pelo MESMO
 * WhatsApp, na mesma conversa que acabou de fechar.
 *
 * Nunca lança para fora: falha de envio é `logger.warn` + `status: "error"`,
 * nunca reprocessa o evento indefinidamente (uma pergunta perdida não é tão
 * grave quanto duas perguntas na mesma conversa).
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { CSAT_PERGUNTA_PADRAO } from "@/lib/schemas/settings";
import { logger } from "@/lib/logger";

export const CSAT_SURVEY_HANDLER_KEY = "csat-enviar-pesquisa.v1";

/** Espelha `csat_requests.expires_at` — depois disso a próxima mensagem do contato não é mais lida como resposta. */
const EXPIRA_EM_MS = 48 * 60 * 60 * 1000;

interface Payload {
  contact_id: string;
  channel_session_id: string;
  /** Conversa sem NENHUMA mensagem inbound não tem o que avaliar. */
  had_inbound: boolean;
}

export const csatSurveyHandler: EventHandler = {
  key: CSAT_SURVEY_HANDLER_KEY,
  events: ["conversation.closed"],
  async handle(row): Promise<HandlerResult> {
    const p = row.payload as unknown as Payload;
    if (!row.entity_id) {
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "ok", detail: "sem_conversation_id" };
    }
    if (!p.had_inbound) {
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "skipped", detail: "sem_mensagem_inbound" };
    }

    const admin = createAdminClient();

    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", row.organization_id)
      .maybeSingle();
    const csatConfig = (org?.settings as { csat?: { enabled?: boolean; pergunta?: string } } | null)?.csat;
    if (csatConfig?.enabled === false) {
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "skipped", detail: "csat_desligado" };
    }

    // Já perguntamos nesta conversa recentemente? Evita duplicar se o evento
    // for reprocessado (retry do drain) ou a conversa fechar/reabrir rápido.
    const { data: existente } = await admin
      .from("csat_requests")
      .select("id")
      .eq("conversation_id", row.entity_id)
      .gte("sent_at", new Date(Date.now() - EXPIRA_EM_MS).toISOString())
      .maybeSingle();
    if (existente) {
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "skipped", detail: "ja_perguntado" };
    }

    const pergunta = csatConfig?.pergunta?.trim() || CSAT_PERGUNTA_PADRAO;

    try {
      await sendMessageHandler(
        admin,
        { organization_id: row.organization_id, actor: { type: "webhook_source", id: "csat" }, requestId: row.id },
        { conversation_id: row.entity_id, type: "text", body: pergunta },
      );
    } catch (err) {
      // Contato bloqueado, canal fora do ar, etc. — sendMessageHandler já
      // decidiu que não dava para mandar. Não insere `csat_requests`: não há
      // pesquisa pendente pra uma pergunta que nunca chegou.
      logger.warn("[csat] não conseguiu enviar a pesquisa", {
        organization_id: row.organization_id,
        conversation_id: row.entity_id,
        error: err instanceof Error ? err.message : String(err),
      });
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "error", detail: "envio_falhou" };
    }

    const sentAt = new Date();
    const { error: insErr } = await admin.from("csat_requests").insert({
      organization_id: row.organization_id,
      conversation_id: row.entity_id,
      contact_id: p.contact_id,
      channel_session_id: p.channel_session_id,
      status: "pending",
      sent_at: sentAt.toISOString(),
      expires_at: new Date(sentAt.getTime() + EXPIRA_EM_MS).toISOString(),
    });
    if (insErr) {
      logger.error("[csat] pergunta enviada mas não gravou csat_requests", {
        organization_id: row.organization_id,
        conversation_id: row.entity_id,
        error: insErr.message,
      });
      return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "error", detail: insErr.message };
    }

    return { consumer_key: CSAT_SURVEY_HANDLER_KEY, status: "ok" };
  },
};
