import { describe, expect, it } from "vitest";

import { avaliarSelecao, TTL_DA_SELECAO_MS } from "./selecao";

describe("avaliarSelecao", () => {
  it("sem agentId gravado: null (nenhuma seleção)", () => {
    expect(avaliarSelecao(null, null)).toBeNull();
    expect(avaliarSelecao(null, new Date().toISOString())).toBeNull();
  });

  it("agentId sem carimbo de seleção: válida (nunca expira por engano)", () => {
    expect(avaliarSelecao("agent-1", null)).toEqual({ agenteId: "agent-1", valida: true });
  });

  it("dentro do TTL: válida", () => {
    const selecionadoEm = new Date(Date.now() - 1000).toISOString();
    expect(avaliarSelecao("agent-1", selecionadoEm)).toEqual({ agenteId: "agent-1", valida: true });
  });

  it("fora do TTL: inválida", () => {
    const selecionadoEm = new Date(Date.now() - TTL_DA_SELECAO_MS - 1000).toISOString();
    expect(avaliarSelecao("agent-1", selecionadoEm)).toEqual({ agenteId: "agent-1", valida: false });
  });

  it("exatamente no limite do TTL: inválida (< estrito, não <=)", () => {
    const selecionadoEm = new Date(Date.now() - TTL_DA_SELECAO_MS).toISOString();
    expect(avaliarSelecao("agent-1", selecionadoEm)?.valida).toBe(false);
  });
});
