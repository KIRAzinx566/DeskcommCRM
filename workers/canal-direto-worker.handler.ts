import type { EventHandler } from "@/lib/event-log/dispatcher";
import { EVENTO_MENSAGEM_RECEBIDA } from "@/lib/escalacao/canal-direto/entrada";
import {
  CANAL_DIRETO_CONSUMER_KEY,
  consumirMensagemDoCanalDireto,
} from "@/workers/canal-direto-worker";

export const canalDiretoHandler: EventHandler = {
  key: CANAL_DIRETO_CONSUMER_KEY,
  events: [EVENTO_MENSAGEM_RECEBIDA],
  // Chamada de modelo + envio de WhatsApp — mesma classe de ai-response-worker.
  naOrgParada: "pula",
  handle: consumirMensagemDoCanalDireto,
};
