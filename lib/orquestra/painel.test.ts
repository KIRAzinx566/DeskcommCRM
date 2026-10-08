import { describe, expect, it } from "vitest";

import {
  diaNoFuso,
  meiaNoite,
  montarAgentes,
  montarDiario,
  primeiroDiaDoPeriodo,
  resumirCaixa,
  rotuloDaFerramenta,
} from "./painel";

const SP = "America/Sao_Paulo";

describe("relógio do painel", () => {
  const agora = new Date("2026-10-08T01:30:00.000Z"); // 22h30 do dia 7 em São Paulo

  it("o dia é o da loja, não o do servidor em UTC", () => {
    expect(diaNoFuso(agora, SP)).toBe("2026-10-07");
  });

  it("meia-noite da loja em UTC", () => {
    expect(meiaNoite("2026-10-07", SP, agora).toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });

  it("primeiro dia de cada período", () => {
    expect(primeiroDiaDoPeriodo("hoje", agora, SP)).toBe("2026-10-07");
    expect(primeiroDiaDoPeriodo("mes", agora, SP)).toBe("2026-10-01");
    expect(primeiroDiaDoPeriodo("7d", agora, SP)).toBe("2026-10-01");
  });
});

describe("resumirCaixa", () => {
  const linha = (direction: "in" | "out", amount_cents: number, entry_date: string, currency = "BRL") => ({
    direction,
    amount_cents,
    entry_date,
    currency,
    created_at: `${entry_date}T12:00:00Z`,
  });

  it("soma entradas e saídas por dia, em ordem, e conta os lançamentos de hoje", () => {
    const r = resumirCaixa(
      [linha("in", 10_000, "2026-10-07"), linha("out", 3_000, "2026-10-06"), linha("in", 5_000, "2026-10-06")],
      "BRL",
      "2026-10-07",
    );
    expect(r).toEqual({
      entradasCents: 15_000,
      saidasCents: 3_000,
      porDia: [
        { dia: "2026-10-06", entradasCents: 5_000, saidasCents: 3_000 },
        { dia: "2026-10-07", entradasCents: 10_000, saidasCents: 0 },
      ],
      lancamentosHoje: 1,
    });
  });

  it("lançamento em outra moeda não entra na soma", () => {
    const r = resumirCaixa([linha("in", 10_000, "2026-10-07", "USD")], "BRL", "2026-10-07");
    expect(r.entradasCents).toBe(0);
  });
});

describe("agentes e diário", () => {
  const BIA = { id: "a1", name: "Bia", is_active: true };
  const LEO = { id: "a2", name: "Leo", is_active: false };
  const turnos = [
    { agent_id: "a1", status: "ok", created_at: "2026-10-07T10:00:00Z" },
    { agent_id: "a1", status: "erro", created_at: "2026-10-07T11:00:00Z" },
    { agent_id: null, status: "ok", created_at: "2026-10-07T09:00:00Z" },
  ];
  const auditoria = [
    { created_at: "2026-10-07T10:01:00Z", metadata: { actor_type: "ai_agent", actor_id: "a1", tool_name: "crm_search_products" } },
    { created_at: "2026-10-07T10:02:00Z", metadata: { actor_type: "ai_agent", actor_id: "a1", tool_name: "ferramenta_sem_rotulo" } },
    { created_at: "2026-10-07T10:03:00Z", metadata: { actor_type: "user", actor_id: "u1", tool_name: "crm_search_products" } },
  ];

  it("cada agente com os próprios turnos de hoje, as falhas e a última ação", () => {
    const [bia, leo] = montarAgentes([BIA, LEO], turnos, auditoria);
    expect(bia).toMatchObject({ turnosHoje: 2, falhasHoje: 1, ultimoTurnoEm: "2026-10-07T11:00:00Z" });
    expect(bia!.ultimaAcao).toEqual({ rotulo: "ferramenta_sem_rotulo", em: "2026-10-07T10:02:00Z" });
    expect(leo).toMatchObject({ ativo: false, turnosHoje: 0, ultimoTurnoEm: null, ultimaAcao: null });
  });

  it("sem auditoria (quem não administra), nenhum agente ganha 'última ação'", () => {
    const [bia] = montarAgentes([BIA], turnos, null);
    expect(bia!.ultimaAcao).toBeNull();
  });

  it("ferramenta do catálogo vira o rótulo humano; fora dele, o nome cru — nunca inventado", () => {
    expect(rotuloDaFerramenta("crm_search_products")).toBe("Procurar produto na loja");
    expect(rotuloDaFerramenta("ferramenta_sem_rotulo")).toBe("ferramenta_sem_rotulo");
  });

  it("diário com auditoria: só ações de agente, da mais nova para a mais velha", () => {
    const d = montarDiario([BIA], turnos, auditoria);
    expect(d.map((e) => e.texto)).toEqual(["ferramenta_sem_rotulo", "Procurar produto na loja"]);
    expect(d[0]).toMatchObject({ agente: "Bia", agenteId: "a1" });
  });

  it("diário sem auditoria: feito dos turnos, sem dizer o que não se sabe", () => {
    const d = montarDiario([BIA], turnos, null);
    expect(d.map((e) => e.texto)).toEqual(["Turno de atendimento com erro", "Atendeu uma conversa"]);
  });
});
