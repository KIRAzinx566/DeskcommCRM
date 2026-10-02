/**
 * A CONFIGURAÇÃO DO CANAL DIRETO — separada de `numero-interno-de-aviso.ts` de propósito.
 *
 * Aquele módulo responde "este chat é o número interno de avisos?" e a resposta
 * NUNCA depende de `ligado` (ver o cabeçalho dele). Este aqui responde uma
 * pergunta diferente — "o canal direto está ligado, e com qual agente?" — que
 * SÓ faz sentido depois que a primeira já disse que sim. Separar os dois evita
 * tocar um módulo estável e bem testado só para acrescentar um campo que a
 * maioria das chamadas (avisos de caso comuns) nunca usa.
 *
 * Sem cache de propósito: ligar/desligar o canal ou trocar o agente selecionado
 * precisa valer na PRÓXIMA mensagem, não em até 30s depois (o TTL de
 * `numero-interno-de-aviso.ts` existe para o corte de identidade, que é
 * chamado em toda mensagem da instalação; este aqui só é lido quando a
 * identidade já bateu — uma consulta rara, não uma consulta quente).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

export interface ConfigCanalDireto {
  ligado: boolean;
  agenteId: string | null;
  selecionadoEm: string | null;
  channelSessionId: string | null;
}

/** `null` = sem configuração nenhuma de aviso de caso (nem destino cadastrado). */
export async function lerConfigCanalDireto(
  db: SupabaseClient,
  organizationId: string,
): Promise<ConfigCanalDireto | null> {
  let data: unknown = null;
  try {
    const r = await db
      .from("config_aviso_de_caso")
      .select("canal_direto_ligado, canal_direto_agente_id, canal_direto_selecionado_em, channel_session_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    data = r.data;
  } catch (err) {
    // ABERTA na ação, como a leitura irmã: uma falha aqui não pode travar o
    // webhook. Sem config = sem canal direto, que é o comportamento seguro.
    logger.warn("[canal-direto] não foi possível ler a configuração", {
      organizationId,
      causa: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
  if (!data) return null;

  const linha = data as {
    canal_direto_ligado?: boolean | null;
    canal_direto_agente_id?: string | null;
    canal_direto_selecionado_em?: string | null;
    channel_session_id?: string | null;
  };
  return {
    ligado: linha.canal_direto_ligado === true,
    agenteId: linha.canal_direto_agente_id ?? null,
    selecionadoEm: linha.canal_direto_selecionado_em ?? null,
    channelSessionId: linha.channel_session_id ?? null,
  };
}
