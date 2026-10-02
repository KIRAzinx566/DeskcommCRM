/**
 * A TRANSCRIÇÃO DO CANAL DIRETO — `canal_direto_mensagens` (migration 0507).
 *
 * Fire-and-forget: falha de log nunca pode travar nem derrubar o webhook ou o
 * worker. O corpo é guardado em texto puro de propósito — o autor é
 * dono/funcionário, nunca `contacts`, nunca entra na cascata de LGPD de
 * contato (mesmo precedente de `agent_case_chat_messages.body`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface RegistroDoCanalDireto {
  organizationId: string;
  agentId: string | null;
  channelSessionId: string | null;
  autor: "dono" | "ia";
  corpo: string;
  memoryEntryId?: string | null;
  erroCodigo?: string | null;
  externalId?: string | null;
}

export async function registrarMensagemDoCanalDireto(
  admin: SupabaseClient,
  registro: RegistroDoCanalDireto,
): Promise<void> {
  try {
    const { error } = await admin.from("canal_direto_mensagens").insert({
      organization_id: registro.organizationId,
      agent_id: registro.agentId,
      channel_session_id: registro.channelSessionId,
      autor: registro.autor,
      corpo: registro.corpo,
      memory_entry_id: registro.memoryEntryId ?? null,
      erro_codigo: registro.erroCodigo ?? null,
      external_id: registro.externalId ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("[canal-direto] log da transcrição não gravou", {
      organizationId: registro.organizationId,
      autor: registro.autor,
      causa: err instanceof Error ? err.message : String(err),
    });
  }
}
