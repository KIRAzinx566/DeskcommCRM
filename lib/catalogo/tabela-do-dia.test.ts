import { describe, expect, it } from "vitest";

import {
  avisoDaTabelaVencidaParaOAgente,
  diaCurto,
  lerConfigDaTabela,
  situacaoDaTabela,
} from "./tabela-do-dia";

const SP = "America/Sao_Paulo";

describe("lerConfigDaTabela", () => {
  it("sem nada gravado: desligada e nunca conferida (o comportamento de antes)", () => {
    expect(lerConfigDaTabela(null)).toEqual({ validade: "desligada", conferida_em: null });
    expect(lerConfigDaTabela({})).toEqual({ validade: "desligada", conferida_em: null });
    expect(lerConfigDaTabela({ catalogo: "lixo" })).toEqual({ validade: "desligada", conferida_em: null });
  });

  it("valor torto em um campo cai no padrão só daquele campo", () => {
    expect(
      lerConfigDaTabela({ catalogo: { validade: "toda_hora", conferida_em: "2026-10-07T12:00:00.000Z" } }),
    ).toEqual({ validade: "desligada", conferida_em: "2026-10-07T12:00:00.000Z" });
    expect(lerConfigDaTabela({ catalogo: { validade: "mesmo_dia", conferida_em: "ontem" } })).toEqual({
      validade: "mesmo_dia",
      conferida_em: null,
    });
  });
});

describe("situacaoDaTabela", () => {
  const agora = new Date("2026-10-07T15:00:00.000Z"); // 12h em São Paulo

  it("desligada não vence nunca", () => {
    expect(situacaoDaTabela({ validade: "desligada", conferida_em: null }, agora, SP)).toEqual({
      estado: "sem_validade",
    });
  });

  it("ligada e nunca conferida: vencida", () => {
    expect(situacaoDaTabela({ validade: "mesmo_dia", conferida_em: null }, agora, SP)).toEqual({
      estado: "vencida",
      conferidaEm: null,
    });
  });

  it("conferida hoje (no fuso da loja): em dia", () => {
    const conferidaEm = "2026-10-07T11:00:00.000Z"; // 8h em SP
    expect(situacaoDaTabela({ validade: "mesmo_dia", conferida_em: conferidaEm }, agora, SP)).toEqual({
      estado: "em_dia",
      conferidaEm,
    });
  });

  it("conferida ontem: vencida", () => {
    const conferidaEm = "2026-10-06T20:00:00.000Z";
    expect(situacaoDaTabela({ validade: "mesmo_dia", conferida_em: conferidaEm }, agora, SP).estado).toBe(
      "vencida",
    );
  });

  it("o dia é o da loja, não o do servidor em UTC", () => {
    // 20h em SP = 23h UTC do dia 7. Às 22h de SP já é dia 8 em UTC — mas ainda dia 7 na loja.
    const conferidaEm = "2026-10-07T23:00:00.000Z";
    const maisTarde = new Date("2026-10-08T01:00:00.000Z");
    expect(situacaoDaTabela({ validade: "mesmo_dia", conferida_em: conferidaEm }, maisTarde, SP).estado).toBe(
      "em_dia",
    );
    // E na virada de meia-noite da loja, vence.
    const diaSeguinte = new Date("2026-10-08T03:30:00.000Z");
    expect(situacaoDaTabela({ validade: "mesmo_dia", conferida_em: conferidaEm }, diaSeguinte, SP).estado).toBe(
      "vencida",
    );
  });

  it("fuso inválido cai no padrão do produto em vez de lançar", () => {
    const conferidaEm = "2026-10-07T11:00:00.000Z";
    expect(
      situacaoDaTabela({ validade: "mesmo_dia", conferida_em: conferidaEm }, agora, "Lua/Mar_da_Tranquilidade")
        .estado,
    ).toBe("em_dia");
  });
});

describe("aviso para o agente", () => {
  it("diz a data da última conferência e proíbe passar preço", () => {
    const texto = avisoDaTabelaVencidaParaOAgente(
      { estado: "vencida", conferidaEm: "2026-10-06T14:00:00.000Z" },
      SP,
    );
    expect(texto).toContain(diaCurto("2026-10-06T14:00:00.000Z", SP));
    expect(texto).toContain("NÃO passe preço");
    expect(texto).toContain("request_human_handoff");
  });

  it("tabela nunca conferida é dita como tal", () => {
    expect(avisoDaTabelaVencidaParaOAgente({ estado: "vencida", conferidaEm: null }, SP)).toContain(
      "nunca foi conferida",
    );
  });
});
