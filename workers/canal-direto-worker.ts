/**
 * CONSOME `canal_direto.mensagem_recebida` — o turno de LLM do canal direto.
 *
 * Deferido do ingestor (`lib/escalacao/canal-direto/entrada.ts`) de propósito:
 * o webhook nunca espera o modelo. Aqui sim.
 *
 * ## O lock por organização
 *
 * `pg_advisory_xact_lock(hashtext('canal_direto'), hashtext(organization_id))`
 * serializa, por organização, "ler seleção → chamar o modelo → gravar memória
 * → mandar resposta" — a trava evita que duas mensagens em sequência rápida
 * do dono processem fora de ordem. Deliberadamente HELD durante a chamada ao
 * modelo (uma transação longa, incomum no resto do motor): o volume esperado
 * é baixíssimo (um dono, mensagens ocasionais), e aqui CORREÇÃO (nunca
 * processar duas correções do mesmo dono fora de ordem) pesa mais que
 * throughput. Se não conseguir o lock na hora, devolve `status: "retry"` — o
 * drain reagenda com o próprio backoff, sem a rodada ficar presa esperando.
 *
 * ## Releitura da seleção
 *
 * Nunca confia no `metadata.agent_id` do evento: entre o `emit_event` e o
 * consumo, o dono pode ter mandado `#agente <outro>`. A seleção é relida
 * FRESCA, dentro do lock.
 */
import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { audit } from "@/lib/audit";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { loadPublishedAgentConfigById } from "@/lib/agent-engine/agent/agent-config";
import { responderNoCanalDireto } from "@/lib/agent-engine/agent/canal-direto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

import { lerConfigCanalDireto } from "@/lib/escalacao/canal-direto/config";
import { avaliarSelecao } from "@/lib/escalacao/canal-direto/selecao";
import { criarEnviadorWaha } from "@/lib/escalacao/canal-direto/transporte";
import { registrarMensagemDoCanalDireto } from "@/lib/escalacao/canal-direto/log";

export const CANAL_DIRETO_CONSUMER_KEY = "canal_direto_worker_v1";
const HISTORICO_TAMANHO = 20;

interface PayloadDoEvento {
  corpo?: string;
  external_id?: string | null;
  channel_session_id?: string | null;
  chat_id?: string | null;
}

export async function consumirMensagemDoCanalDireto(row: EventRow): Promise<HandlerResult> {
  const consumer_key = CANAL_DIRETO_CONSUMER_KEY;
  const payload = row.payload as unknown as PayloadDoEvento;
  const corpo = payload.corpo;
  const channelSessionId = payload.channel_session_id ?? null;
  const chatId = payload.chat_id ?? null;
  if (!corpo || !channelSessionId || !chatId) {
    return { consumer_key, status: "skipped", detail: "payload_incompleto" };
  }

  const pool = getRequestPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext('canal_direto'), hashtext($1))", [
      row.organization_id,
    ]);

    const admin = createAdminClient();
    const config = await lerConfigCanalDireto(admin, row.organization_id);
    const selecao = avaliarSelecao(config?.agenteId ?? null, config?.selecionadoEm ?? null);
    if (!selecao?.valida) {
      await client.query("commit");
      return { consumer_key, status: "skipped", detail: "sem_selecao_valida" };
    }

    const agenteConfig = await loadPublishedAgentConfigById(pool, row.organization_id, selecao.agenteId);
    if (!agenteConfig) {
      await client.query("commit");
      // Agente apagado ou despublicado entre a seleção e o consumo: trata
      // como "sem seleção" — a próxima mensagem do dono pede #agente de novo.
      return { consumer_key, status: "skipped", detail: "agente_indisponivel" };
    }

    const { data: historicoRows } = await admin
      .from("canal_direto_mensagens")
      .select("autor, corpo")
      .eq("organization_id", row.organization_id)
      .eq("agent_id", selecao.agenteId)
      .order("created_at", { ascending: false })
      .limit(HISTORICO_TAMANHO);
    const historico = ((historicoRows ?? []) as Array<{ autor: "dono" | "ia"; corpo: string }>).reverse();

    const enviar = await criarEnviadorWaha(admin, { channelSessionId, chatId });
    if (!enviar) {
      await client.query("commit");
      return { consumer_key, status: "error", detail: "waha_indisponivel" };
    }

    const resposta = await responderNoCanalDireto(pool, requestTurnDeps().llmCfg, {
      tenantId: row.organization_id,
      agente: {
        agentId: agenteConfig.agentId,
        agentName: agenteConfig.agentName,
        systemPrompt: agenteConfig.systemPrompt,
        provider: agenteConfig.provider,
        model: agenteConfig.model,
        baseUrl: agenteConfig.baseUrl,
        credentialId: agenteConfig.credentialId,
      },
      historico,
      mensagemDoDono: corpo,
    });

    if (!resposta.ok) {
      const enviou = await enviar("Não entendi — pode reformular?");
      await registrarMensagemDoCanalDireto(admin, {
        organizationId: row.organization_id,
        agentId: selecao.agenteId,
        channelSessionId,
        autor: "ia",
        corpo: "Não entendi — pode reformular?",
        erroCodigo: enviou ? resposta.motivo : "envio_falhou",
      });
      void audit({
        action: "ai.canal_direto_mensagem_rejeitada",
        organizationId: row.organization_id,
        resourceType: "ai_agents",
        resourceId: selecao.agenteId,
        metadata: { motivo: resposta.motivo },
      });
      await client.query("commit");
      return { consumer_key, status: "ok", detail: resposta.motivo };
    }

    let memoryEntryId: string | null = null;
    if (resposta.correcao) {
      const { data: entry, error: insErr } = await admin
        .from("org_memory_entries")
        .insert({
          organization_id: row.organization_id,
          agent_id: selecao.agenteId,
          title: resposta.correcao.titulo,
          body: resposta.correcao.corpo,
          source: "canal_direto",
          status: "active",
        })
        .select("id")
        .single();
      if (insErr) {
        logger.error("[canal-direto] correção não gravou em org_memory_entries", {
          organizationId: row.organization_id,
          causa: insErr.message,
        });
      } else {
        memoryEntryId = (entry as { id: string }).id;
        void audit({
          action: "ai.canal_direto_correcao_aplicada",
          organizationId: row.organization_id,
          resourceType: "org_memory_entries",
          resourceId: memoryEntryId,
          metadata: { agent_id: selecao.agenteId, memory_entry_id: memoryEntryId, titulo: resposta.correcao.titulo },
        });
      }
    }

    const enviou = await enviar(resposta.respostaAoDono);
    await registrarMensagemDoCanalDireto(admin, {
      organizationId: row.organization_id,
      agentId: selecao.agenteId,
      channelSessionId,
      autor: "ia",
      corpo: resposta.respostaAoDono,
      memoryEntryId,
      erroCodigo: enviou ? null : "envio_falhou",
    });

    await client.query("commit");
    return { consumer_key, status: "ok" };
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      // A transação já pode ter morrido (ex.: lock wait timeout) — o rollback
      // é limpeza best-effort, nunca a causa do retorno.
    }
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[canal-direto-worker] falhou", { organizationId: row.organization_id, causa: detail });
    return {
      consumer_key,
      status: "retry",
      retry_at: new Date(Date.now() + 60_000).toISOString(),
      detail,
    };
  } finally {
    client.release();
  }
}
