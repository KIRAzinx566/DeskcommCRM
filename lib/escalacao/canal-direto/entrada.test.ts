import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const checkRateLimit = vi.fn();
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

const registrarMensagemDoCanalDireto = vi.fn().mockResolvedValue(undefined);
vi.mock("./log", () => ({
  registrarMensagemDoCanalDireto: (...args: unknown[]) => registrarMensagemDoCanalDireto(...args),
}));

const resolverAgentePorNome = vi.fn();
const listarAgentesDaOrganizacao = vi.fn();
vi.mock("./resolver-agente-por-nome", () => ({
  resolverAgentePorNome: (...args: unknown[]) => resolverAgentePorNome(...args),
  listarAgentesDaOrganizacao: (...args: unknown[]) => listarAgentesDaOrganizacao(...args),
}));

const definirSelecao = vi.fn().mockResolvedValue(undefined);
vi.mock("./selecao", async () => {
  const real = await vi.importActual<typeof import("./selecao")>("./selecao");
  return { ...real, definirSelecao: (...args: unknown[]) => definirSelecao(...args) };
});

import { processarMensagemDoCanalDireto } from "./entrada";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "22222222-2222-4222-8222-222222222222";

function stubAdmin(): { client: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function baseInput(overrides: Partial<Parameters<typeof processarMensagemDoCanalDireto>[1]> = {}) {
  return {
    organizationId: ORG_ID,
    channelSessionId: CHANNEL_ID,
    corpo: "",
    externalId: "ext-1",
    agenteIdSelecionado: null,
    selecionadoEm: null,
    enviar: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

beforeEach(() => {
  checkRateLimit.mockReset().mockResolvedValue({ allowed: true, count: 1, limit: 20, window_sec: 60 });
  registrarMensagemDoCanalDireto.mockClear();
  resolverAgentePorNome.mockReset();
  listarAgentesDaOrganizacao.mockReset().mockResolvedValue([{ id: "a1", name: "Clínica" }]);
  definirSelecao.mockClear();
});

describe("processarMensagemDoCanalDireto", () => {
  it("teto de rate limit alcançado: não chama enviar, não loga", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, count: 21, limit: 20, window_sec: 60 });
    const { client } = stubAdmin();
    const input = baseInput({ corpo: "qualquer coisa" });
    await processarMensagemDoCanalDireto(client, input);
    expect(input.enviar).not.toHaveBeenCalled();
    expect(registrarMensagemDoCanalDireto).not.toHaveBeenCalled();
  });

  it("#agentes: lista os nomes reais e NÃO muda a seleção", async () => {
    const { client } = stubAdmin();
    const input = baseInput({ corpo: "#agentes" });
    await processarMensagemDoCanalDireto(client, input);
    expect(input.enviar).toHaveBeenCalledWith(expect.stringContaining("Clínica"));
    expect(definirSelecao).not.toHaveBeenCalled();
    expect(registrarMensagemDoCanalDireto).toHaveBeenCalledTimes(2); // dono + ia
  });

  it("#agente <nome> único: define a seleção e confirma", async () => {
    resolverAgentePorNome.mockResolvedValue({ status: "unico", agente: { id: "a1", name: "Clínica" } });
    const { client } = stubAdmin();
    const input = baseInput({ corpo: "#agente Clínica" });
    await processarMensagemDoCanalDireto(client, input);
    expect(definirSelecao).toHaveBeenCalledWith(client, ORG_ID, "a1");
    expect(input.enviar).toHaveBeenCalledWith(expect.stringContaining("Clínica"));
  });

  it("#agente <nome> ambíguo: NÃO muda a seleção, lista os candidatos", async () => {
    resolverAgentePorNome.mockResolvedValue({
      status: "ambiguo",
      candidatos: [{ id: "a1", name: "Clínica A" }, { id: "a2", name: "Clínica B" }],
    });
    const { client } = stubAdmin();
    const input = baseInput({ corpo: "#agente Clínica" });
    await processarMensagemDoCanalDireto(client, input);
    expect(definirSelecao).not.toHaveBeenCalled();
    expect(input.enviar).toHaveBeenCalledWith(expect.stringContaining("Clínica A"));
  });

  it("#agente <nome> inexistente: NÃO muda a seleção, pede de novo", async () => {
    resolverAgentePorNome.mockResolvedValue({ status: "nenhum" });
    const { client } = stubAdmin();
    const input = baseInput({ corpo: "#agente Suporte" });
    await processarMensagemDoCanalDireto(client, input);
    expect(definirSelecao).not.toHaveBeenCalled();
    expect(input.enviar).toHaveBeenCalledWith(expect.stringContaining("Não achei"));
  });

  it("sem seleção válida (nunca selecionou): pede #agente, NUNCA emite evento pro worker", async () => {
    const { client, rpc } = stubAdmin();
    const input = baseInput({ corpo: "Pare de oferecer desconto" });
    await processarMensagemDoCanalDireto(client, input);
    expect(rpc).not.toHaveBeenCalled();
    expect(input.enviar).toHaveBeenCalledWith(expect.stringContaining("Qual agente"));
  });

  it("seleção expirada pelo TTL: trata como sem seleção", async () => {
    const { client, rpc } = stubAdmin();
    const input = baseInput({
      corpo: "Pare de oferecer desconto",
      agenteIdSelecionado: "a1",
      selecionadoEm: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h > TTL de 2h
    });
    await processarMensagemDoCanalDireto(client, input);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("seleção válida + mensagem comum: grava o lado do dono e EMITE o evento pro worker — nunca chama o modelo aqui", async () => {
    const { client, rpc } = stubAdmin();
    const input = baseInput({
      corpo: "Pare de oferecer desconto sem perguntar",
      agenteIdSelecionado: "a1",
      selecionadoEm: new Date().toISOString(),
    });
    await processarMensagemDoCanalDireto(client, input);
    expect(rpc).toHaveBeenCalledWith(
      "emit_event",
      expect.objectContaining({
        p_event_type: "canal_direto.turno_requested",
        p_organization_id: ORG_ID,
        p_payload: expect.objectContaining({ corpo: "Pare de oferecer desconto sem perguntar" }),
      }),
    );
    // Nenhuma resposta síncrona ao dono por este caminho — é o worker que responde.
    expect(input.enviar).not.toHaveBeenCalled();
    expect(registrarMensagemDoCanalDireto).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autor: "dono", agentId: "a1" }),
    );
  });
});
