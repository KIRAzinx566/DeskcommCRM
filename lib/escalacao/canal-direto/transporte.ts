/**
 * O ENVIO DA RESPOSTA AO DONO — SEM `messages`, SEM `conversations`.
 *
 * Fecha sobre `sendWAHA`/`WahaClient.sendMessage` (`lib/waha/send.ts`),
 * NUNCA sobre `sendMessageHandler` (`app/api/v1/messages/_handler.ts`), que
 * exige `conversation_id` e grava em `messages`. Usar o caminho pesado
 * violaria a garantia que `lib/escalacao/numero-interno-de-aviso.ts` já
 * protege: este número NUNCA se torna contato/conversa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendWAHA } from "@/lib/waha/send";
import { logger } from "@/lib/logger";

export type EnviarMensagemDoCanalDireto = (texto: string) => Promise<boolean>;

/**
 * Resolve o nome da sessão WAHA e devolve uma função de envio fechada sobre
 * ela e o `chatId` — o MESMO endereço de onde a mensagem do dono chegou (o
 * ingestor já resolveu isso; não há por que reconstruir a partir de
 * `telefone_destino`/`destino_jid`, que existem para OUTRO propósito — a
 * identidade do número, não o endereço de envio). `null` quando a sessão não
 * é alcançável (sem WAHA configurado, ou canal arquivado) — chamador trata
 * como "não deu para responder" sem lançar.
 */
export async function criarEnviadorWaha(
  admin: SupabaseClient,
  input: { channelSessionId: string; chatId: string },
): Promise<EnviarMensagemDoCanalDireto | null> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("waha_session_name")
    .eq("id", input.channelSessionId)
    .maybeSingle();
  if (error || !data?.waha_session_name) return null;

  const sessionName = data.waha_session_name as string;
  const chatId = input.chatId;

  return async (texto: string): Promise<boolean> => {
    try {
      const resultado = await sendWAHA({ sessionName, chatId, text: texto });
      return resultado !== null;
    } catch (err) {
      logger.warn("[canal-direto] envio ao dono falhou", {
        causa: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };
}
