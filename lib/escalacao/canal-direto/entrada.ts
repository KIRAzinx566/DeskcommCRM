/**
 * O PONTO DE ENTRADA DO CANAL DIRETO — chamado pelos ingestores no MESMO
 * lugar onde hoje só chamam `registrarMensagemIgnorada`, quando
 * `canal_direto_ligado = true`.
 *
 * Nunca chama o modelo aqui: o turno de LLM é PESADO e este caminho roda
 * dentro do webhook. Comando (`#agente`/`#agentes`) é respondido na hora, sem
 * IA; uma correção/pergunta de verdade é só logada e DEFERIDA para o worker
 * via `emit_event` (mesmo motivo de `ai_agent.dispatch_requested` em
 * `lib/channels/pos-entrada.ts`: não travar o webhook esperando o modelo, e
 * ganhar retry/backoff/dead-letter de graça do drain).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { logger } from "@/lib/logger";

import { lerComandoDoCanalDireto } from "./comando";
import type { EnviarMensagemDoCanalDireto } from "./transporte";
import { registrarMensagemDoCanalDireto } from "./log";
import { listarAgentesDaOrganizacao, resolverAgentePorNome } from "./resolver-agente-por-nome";
import { avaliarSelecao, definirSelecao } from "./selecao";

const TETO_POR_ORGANIZACAO = 20;
const JANELA_SEGUNDOS = 60;

export const EVENTO_MENSAGEM_RECEBIDA = "canal_direto.mensagem_recebida";

export interface EntradaDoCanalDireto {
  organizationId: string;
  channelSessionId: string | null;
  corpo: string;
  externalId: string | null;
  agenteIdSelecionado: string | null;
  selecionadoEm: string | null;
  enviar: EnviarMensagemDoCanalDireto;
}

function pedidoDeSelecao(nomes: string[]): string {
  if (nomes.length === 0) {
    return "Nenhum agente de IA cadastrado nesta organização ainda. Cadastre um agente antes de usar o canal direto.";
  }
  return `Qual agente você quer corrigir? Responda "#agente <nome>". Agentes disponíveis: ${nomes.join(", ")}.`;
}

/**
 * Chamada pelos ingestores quando a mensagem é do número interno de avisos
 * E `canal_direto_ligado = true`. Nunca lança — toda falha vira log e a
 * mensagem é tratada como "não processada", nunca como erro do webhook.
 */
export async function processarMensagemDoCanalDireto(
  admin: SupabaseClient,
  input: EntradaDoCanalDireto,
): Promise<void> {
  const limite = await checkRateLimit(`canal-direto:${input.organizationId}`, TETO_POR_ORGANIZACAO, JANELA_SEGUNDOS);
  if (!limite.allowed) {
    logger.warn("[canal-direto] teto de mensagens por minuto alcançado", {
      organizationId: input.organizationId,
    });
    return;
  }

  const comando = lerComandoDoCanalDireto(input.corpo);

  if (comando?.tipo === "listar") {
    const agentes = await listarAgentesDaOrganizacao(admin, input.organizationId);
    const resposta = pedidoDeSelecao(agentes.map((a) => a.name));
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: null,
      channelSessionId: input.channelSessionId,
      autor: "dono",
      corpo: input.corpo,
      externalId: input.externalId,
    });
    const enviou = await input.enviar(resposta);
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: null,
      channelSessionId: input.channelSessionId,
      autor: "ia",
      corpo: resposta,
      erroCodigo: enviou ? null : "envio_falhou",
    });
    return;
  }

  if (comando?.tipo === "selecionar") {
    const resultado = await resolverAgentePorNome(admin, input.organizationId, comando.nomeDigitado);
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: resultado.status === "unico" ? resultado.agente.id : null,
      channelSessionId: input.channelSessionId,
      autor: "dono",
      corpo: input.corpo,
      externalId: input.externalId,
    });

    let resposta: string;
    let agentIdDaResposta: string | null = null;
    if (resultado.status === "unico") {
      await definirSelecao(admin, input.organizationId, resultado.agente.id);
      agentIdDaResposta = resultado.agente.id;
      resposta = `Certo — agora você está falando com "${resultado.agente.name}". Pode corrigir.`;
      void audit({
        action: "ai.canal_direto_agente_selecionado",
        organizationId: input.organizationId,
        resourceType: "ai_agents",
        resourceId: resultado.agente.id,
        metadata: { agent_name: resultado.agente.name },
      });
    } else if (resultado.status === "ambiguo") {
      resposta = `Mais de um agente bate com "${comando.nomeDigitado}": ${resultado.candidatos
        .map((c) => c.name)
        .join(", ")}. Diga o nome completo.`;
      void audit({
        action: "ai.canal_direto_mensagem_rejeitada",
        organizationId: input.organizationId,
        metadata: { motivo: "nome_ambiguo", candidatos: resultado.candidatos.map((c) => c.name) },
      });
    } else {
      const agentes = await listarAgentesDaOrganizacao(admin, input.organizationId);
      resposta = `Não achei um agente chamado "${comando.nomeDigitado}". ${pedidoDeSelecao(
        agentes.map((a) => a.name),
      )}`;
      void audit({
        action: "ai.canal_direto_mensagem_rejeitada",
        organizationId: input.organizationId,
        metadata: { motivo: "nome_nao_encontrado" },
      });
    }

    const enviou = await input.enviar(resposta);
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: agentIdDaResposta,
      channelSessionId: input.channelSessionId,
      autor: "ia",
      corpo: resposta,
      erroCodigo: enviou ? null : "envio_falhou",
    });
    return;
  }

  // Não é comando: é correção/pergunta para o agente selecionado.
  const selecao = avaliarSelecao(input.agenteIdSelecionado, input.selecionadoEm);
  if (!selecao || !selecao.valida) {
    const agentes = await listarAgentesDaOrganizacao(admin, input.organizationId);
    const resposta = pedidoDeSelecao(agentes.map((a) => a.name));
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: null,
      channelSessionId: input.channelSessionId,
      autor: "dono",
      corpo: input.corpo,
      externalId: input.externalId,
    });
    const enviou = await input.enviar(resposta);
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: input.organizationId,
      agentId: null,
      channelSessionId: input.channelSessionId,
      autor: "ia",
      corpo: resposta,
      erroCodigo: enviou ? null : "envio_falhou",
    });
    return;
  }

  // Seleção válida: grava e DEFERE para o worker — nunca chama o modelo aqui.
  await registrarMensagemDoCanalDireto(admin, {
    organizationId: input.organizationId,
    agentId: selecao.agenteId,
    channelSessionId: input.channelSessionId,
    autor: "dono",
    corpo: input.corpo,
    externalId: input.externalId,
  });

  const { error } = await admin.rpc("emit_event" as never, {
    p_event_type: EVENTO_MENSAGEM_RECEBIDA,
    p_entity_kind: "organization",
    p_entity_id: input.organizationId,
    p_payload: { corpo: input.corpo, external_id: input.externalId, channel_session_id: input.channelSessionId },
    p_metadata: { agent_id: selecao.agenteId },
    p_organization_id: input.organizationId,
  } as never);
  if (error) {
    logger.warn("[canal-direto] emit_event falhou — mensagem logada mas não será respondida", {
      organizationId: input.organizationId,
      causa: error.message,
    });
  }
}
