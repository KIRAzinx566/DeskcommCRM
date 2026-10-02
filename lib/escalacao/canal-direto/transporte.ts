/**
 * O ENVIO DA RESPOSTA AO DONO — SEM `messages`, SEM `conversations`.
 *
 * Mesmo padrão de `lib/escalacao/aviso-ao-suporte.handler.ts#criarTransporteDoAviso`
 * (a mesma família de feature: o número de aviso de caso): o canal é resolvido
 * em `lib/channels/` — este arquivo nunca conhece provedor — e o destino sai de
 * `resolveRecipient` a partir do TELEFONE (`config_aviso_de_caso.telefone_destino`),
 * nunca reconstruído à mão. Nunca passa por `sendMessageHandler`
 * (`app/api/v1/messages/_handler.ts`), que exige `conversation_id` e grava em
 * `messages` — isso violaria a garantia que
 * `lib/escalacao/numero-interno-de-aviso.ts` já protege: este número NUNCA se
 * torna contato/conversa.
 *
 * Import TARDIO pelo mesmo motivo do arquivo-irmão: o topo não deve arrastar os
 * adapters de todos os provedores para dentro de quem só registra o handler do
 * `event_log`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export type EnviarMensagemDoCanalDireto = (texto: string) => Promise<boolean>;

/**
 * Resolve o canal e o destino, e devolve uma função de envio fechada sobre os
 * dois. `null` quando não há como enviar (canal arquivado, sem referência de
 * transporte, ou o telefone não traduz para um endereço neste canal) —
 * chamador trata como "não deu para responder" sem lançar.
 */
export async function criarEnviadorDoCanal(
  admin: SupabaseClient,
  input: { channelSessionId: string; telefoneDestino: string },
): Promise<EnviarMensagemDoCanalDireto | null> {
  const { getAdapter, resolveSessionRef, CHANNEL_SESSION_REF_COLUMNS } = await import(
    "@/lib/channels"
  );

  const { data } = await admin
    .from("channel_sessions")
    .select(`organization_id, ${CHANNEL_SESSION_REF_COLUMNS}`)
    .eq("id", input.channelSessionId)
    .maybeSingle();
  if (!data) return null;

  const linha = data as { organization_id: string } & Parameters<typeof resolveSessionRef>[0];
  const adapter = getAdapter(linha.provider as never);
  const sessionRef = resolveSessionRef(linha);
  const to = adapter.resolveRecipient({
    isGroup: false,
    groupChatId: null,
    phoneNumber: input.telefoneDestino,
    waIdentity: null,
    waLid: null,
  });
  if (!to) return null;

  return async (texto: string): Promise<boolean> => {
    try {
      const resultado = await adapter.send({
        organizationId: linha.organization_id,
        sessionRef,
        to,
        kind: "text",
        body: texto,
      });
      return resultado.externalId !== null;
    } catch (err) {
      logger.warn("[canal-direto] envio ao dono falhou", {
        causa: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };
}
