import { describe, expect, it, vi, beforeEach } from "vitest";
import type pg from "pg";

const runModelCall = vi.fn();
vi.mock("../edge/llm/run-model-call", () => ({
  runModelCall: (...args: unknown[]) => runModelCall(...args),
}));

import { responderNoCanalDireto, type AgenteDoCanalDireto } from "./canal-direto";

function poolVazio(): pg.Pool {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { query } as unknown as pg.Pool;
}

const AGENTE: AgenteDoCanalDireto = {
  agentId: "agent-1",
  agentName: "Clínica",
  systemPrompt: "Você atende a Clínica Bela Vista.",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  baseUrl: null,
  credentialId: "cred-1",
};

beforeEach(() => {
  runModelCall.mockReset();
});

function input(mensagemDoDono: string) {
  return { tenantId: "org-1", agente: AGENTE, historico: [], mensagemDoDono };
}

describe("responderNoCanalDireto", () => {
  it("JSON válido com correção: devolve resposta e correção estruturadas", async () => {
    runModelCall.mockResolvedValue({
      result: {
        text: '{"resposta_ao_dono": "Entendido.", "correcao": {"titulo": "Desconto exige autorização", "corpo": "Nunca oferecer desconto sem perguntar ao dono."}}',
      },
      callId: "c1",
    });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("Pare de dar desconto sem perguntar"));
    expect(r).toEqual({
      ok: true,
      respostaAoDono: "Entendido.",
      correcao: { titulo: "Desconto exige autorização", corpo: "Nunca oferecer desconto sem perguntar ao dono." },
    });
  });

  it("JSON válido sem correção (pergunta/elogio): correcao null", async () => {
    runModelCall.mockResolvedValue({
      result: { text: '{"resposta_ao_dono": "Oi! Tudo certo por aqui.", "correcao": null}' },
      callId: "c2",
    });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("Como você está?"));
    expect(r).toEqual({ ok: true, respostaAoDono: "Oi! Tudo certo por aqui.", correcao: null });
  });

  it("JSON cercado por ```json ... ``` é extraído corretamente", async () => {
    runModelCall.mockResolvedValue({
      result: { text: '```json\n{"resposta_ao_dono": "Ok.", "correcao": null}\n```' },
      callId: "c3",
    });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("ok"));
    expect(r).toEqual({ ok: true, respostaAoDono: "Ok.", correcao: null });
  });

  it("texto sem JSON nenhum: parse_falhou, NUNCA grava correção", async () => {
    runModelCall.mockResolvedValue({ result: { text: "Desculpe, não entendi sua pergunta." }, callId: "c4" });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("???"));
    expect(r).toEqual({ ok: false, motivo: "parse_falhou" });
  });

  it("JSON malformado: parse_falhou", async () => {
    runModelCall.mockResolvedValue({ result: { text: '{"resposta_ao_dono": "Ok", "correcao": }' }, callId: "c5" });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("teste"));
    expect(r).toEqual({ ok: false, motivo: "parse_falhou" });
  });

  it("JSON válido mas fora do schema (falta resposta_ao_dono): parse_falhou", async () => {
    runModelCall.mockResolvedValue({ result: { text: '{"correcao": null}' }, callId: "c6" });
    const r = await responderNoCanalDireto(poolVazio(), {} as never, input("teste"));
    expect(r).toEqual({ ok: false, motivo: "parse_falhou" });
  });

  it("chama o modelo com a persona do agente selecionado, purpose canal_direto, sem tools/maxSteps", async () => {
    runModelCall.mockResolvedValue({ result: { text: '{"resposta_ao_dono": "Ok.", "correcao": null}' }, callId: "c7" });
    await responderNoCanalDireto(poolVazio(), {} as never, input("teste"));
    const chamada = runModelCall.mock.calls[0]![2] as Record<string, unknown>;
    expect(chamada.purpose).toBe("canal_direto");
    expect(chamada.agentId).toBe("agent-1");
    expect(chamada.model).toBe("claude-sonnet-4-6");
    expect(chamada.tools).toBeUndefined();
    expect(chamada.maxSteps).toBeUndefined();
  });
});
