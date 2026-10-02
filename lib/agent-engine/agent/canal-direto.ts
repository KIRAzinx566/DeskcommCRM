/**
 * CANAL DIRETO DO DONO — o emissor da correção/aprendizado em tempo real.
 *
 * ⚠️ ESTE ARQUIVO TEM DE MORAR EM `lib/agent-engine/` — mesma razão do
 * cabeçalho de `conversa-do-caso.ts`: a varredura de herança
 * (`tests/unit/heranca-de-provider-nos-pontos-auxiliares.test.ts`) só lê essa
 * pasta.
 *
 * Sem tools, sem `maxSteps`: a IA aqui LÊ a correção e DECIDE se vale a pena
 * guardar — nunca age sobre o CRM ou sobre a conversa de um cliente. Resposta
 * esperada é um JSON (`montarSystemDoCanalDireto`/`INSTRUCAO_DE_FORMATO`), e o
 * parse é defensivo: falha de parse NUNCA grava memória — fail closed na
 * AÇÃO, aberto na INFORMAÇÃO (o dono recebe "não entendi" em vez de a
 * correção sumir em silêncio).
 */
import type pg from "pg";
import { z } from "zod";

import { runModelCall, type LlmEdgeConfig, type RunModelCallDeps } from "../edge/llm/run-model-call";
import { loadOrgMemory } from "./org-memory";
import { montarSystemDoCanalDireto } from "./canal-direto/contexto";

const RespostaSchema = z.object({
  resposta_ao_dono: z.string(),
  correcao: z
    .object({
      titulo: z.string().trim().min(1),
      corpo: z.string().trim().min(1),
    })
    .nullable(),
});

export interface AgenteDoCanalDireto {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  credentialId: string | null;
}

export interface CanalDiretoInput {
  tenantId: string;
  agente: AgenteDoCanalDireto;
  /** Últimas mensagens da transcrição, mais antiga primeiro. */
  historico: Array<{ autor: "dono" | "ia"; corpo: string }>;
  mensagemDoDono: string;
}

export type RespostaDoCanalDireto =
  | { ok: true; respostaAoDono: string; correcao: { titulo: string; corpo: string } | null }
  | { ok: false; motivo: "parse_falhou" };

/** Extrai o objeto JSON de uma resposta que pode vir cercada por ```` ```json ```` ou texto solto. */
function extrairJson(texto: string): unknown {
  const semCerca = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const inicio = semCerca.indexOf("{");
  const fim = semCerca.lastIndexOf("}");
  if (inicio < 0 || fim < inicio) throw new Error("sem objeto JSON no texto");
  return JSON.parse(semCerca.slice(inicio, fim + 1));
}

export async function responderNoCanalDireto(
  db: pg.Pool,
  llmCfg: LlmEdgeConfig,
  input: CanalDiretoInput,
  deps: RunModelCallDeps = {},
): Promise<RespostaDoCanalDireto> {
  const orgMemory = await loadOrgMemory(db, input.tenantId, input.agente.agentId);
  const system = montarSystemDoCanalDireto({
    systemPromptDoAgente: input.agente.systemPrompt,
    orgMemory,
  });

  const { result } = await runModelCall(
    db,
    llmCfg,
    {
      tenantId: input.tenantId,
      leadId: null,
      jobId: null,
      agentId: input.agente.agentId,
      purpose: "canal_direto",
      system,
      messages: [
        ...input.historico.map((m) => ({
          role: (m.autor === "dono" ? "user" : "assistant") as "user" | "assistant",
          content: m.corpo,
        })),
        { role: "user" as const, content: input.mensagemDoDono },
      ],
      model: input.agente.model,
      llmOverride: {
        provider: input.agente.provider,
        credentialId: input.agente.credentialId,
        baseUrl: input.agente.baseUrl ?? undefined,
      },
      // SEM `tools` e SEM `maxSteps` — ver o cabeçalho.
    },
    deps,
  );

  let bruto: unknown;
  try {
    bruto = extrairJson(result.text ?? "");
  } catch {
    return { ok: false, motivo: "parse_falhou" };
  }

  const parsed = RespostaSchema.safeParse(bruto);
  if (!parsed.success) return { ok: false, motivo: "parse_falhou" };

  return { ok: true, respostaAoDono: parsed.data.resposta_ao_dono, correcao: parsed.data.correcao };
}
