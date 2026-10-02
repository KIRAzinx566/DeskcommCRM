import type { EventHandler } from "@/lib/event-log/dispatcher";
import { EVENTO_MENSAGEM_RECEBIDA } from "@/lib/escalacao/canal-direto/entrada";
import {
  CANAL_DIRETO_CONSUMER_KEY,
  consumirMensagemDoCanalDireto,
} from "@/workers/canal-direto-worker";

export const canalDiretoHandler: EventHandler = {
  key: CANAL_DIRETO_CONSUMER_KEY,
  events: [EVENTO_MENSAGEM_RECEBIDA],
  // TODO(sync): `naOrgParada: "pula"` — esta branch partiu de `main` antes da
  // sincronização que introduziu o campo (ver PR #85). Readicionar assim que
  // esta branch trouxer a `main` atualizada pra dentro (merge da main), antes
  // de abrir o PR desta feature — sem o campo, o typecheck do upstream
  // sincronizado reprova este handler (EventHandler exige o campo).
  handle: consumirMensagemDoCanalDireto,
};
