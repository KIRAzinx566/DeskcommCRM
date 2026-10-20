/**
 * A PORTA DO CANAL DIRETO nos três ingestores (WAHA, Meta, Zernio).
 *
 * O número interno de avisos tem dois donos para a mesma mensagem: o canal
 * direto deste fork (a equipe conversa com o agente pelo WhatsApp) e a
 * resposta ao caso do upstream (`RESPONDER`/`PERGUNTAR <caso>`, em
 * `resposta-whatsapp-ao-caso.ts`). A regra que junta os dois:
 *
 *   - o comando do caso tem formato explícito e vence sempre — ele é preciso,
 *     e o canal direto o leria como uma pergunta ao agente;
 *   - qualquer outro texto do número interno vai para o canal direto, quando
 *     ele está ligado e consegue responder;
 *   - fora disso, a mensagem segue para `consumirRespostaDoSuporteNoWhatsApp`,
 *     que é quem a conta como ignorada (o comportamento do upstream).
 *
 * `true` = o canal direto ficou com a mensagem e o ingestor para aqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { ehNumeroInternoDeAviso, type ChatIdentidade } from "@/lib/escalacao/numero-interno-de-aviso";
import { parseComandoDeRespostaDoSuporte } from "@/lib/escalacao/resposta-whatsapp-ao-caso";

import { lerConfigCanalDireto } from "./config";
import { processarMensagemDoCanalDireto } from "./entrada";
import { criarEnviadorDoCanal } from "./transporte";

export async function entregarAoCanalDireto(
  admin: SupabaseClient,
  entrada: {
    organizationId: string;
    channelSessionId: string;
    identidade: ChatIdentidade;
    direction: "inbound" | "outbound";
    texto: string | null;
    externalId: string | null;
  },
): Promise<boolean> {
  if (entrada.direction !== "inbound") return false;
  if (parseComandoDeRespostaDoSuporte(entrada.texto)) return false;
  if (!(await ehNumeroInternoDeAviso(admin, entrada.organizationId, entrada.identidade))) return false;

  const config = await lerConfigCanalDireto(admin, entrada.organizationId);
  if (!config?.ligado || !config.telefoneDestino) return false;

  const enviar = await criarEnviadorDoCanal(admin, {
    channelSessionId: entrada.channelSessionId,
    telefoneDestino: config.telefoneDestino,
  });
  if (!enviar) {
    logger.warn("[canal-direto] canal indisponível para responder — mensagem descartada como aviso comum", {
      organizationId: entrada.organizationId,
    });
    return false;
  }

  await processarMensagemDoCanalDireto(admin, {
    organizationId: entrada.organizationId,
    channelSessionId: entrada.channelSessionId,
    corpo: entrada.texto ?? "",
    externalId: entrada.externalId,
    agenteIdSelecionado: config.agenteId,
    selecionadoEm: config.selecionadoEm,
    enviar,
  });
  return true;
}
