import { describe, expect, it } from "vitest";

import {
  lerConfigDoParcelamento,
  lerTabelaDeTaxas,
  simularOpcao,
  simularTodas,
  temTaxas,
  textoDaTabelaDeTaxas,
  type ConfigDoParcelamento,
} from "./parcelamento";

const LOJA: ConfigDoParcelamento = {
  debito: 2.29,
  credito: { "1": 4.29, "2": 5.13, "10": 10.2, "18": 15.83 },
  sem_acrescimo_ate: 0,
};

describe("lerTabelaDeTaxas", () => {
  it("lê o formato da maquininha, com qualquer traço, vírgula ou ponto", () => {
    const lido = lerTabelaDeTaxas(
      ["Débito – 2,29%", "Crédito à Vista - 4,29%", "2x — 5.13%", "10x 10,2 %", "", "  18x – 15,83%  "].join("\n"),
    );
    expect(lido).toEqual({
      debito: 2.29,
      credito: { "1": 4.29, "2": 5.13, "10": 10.2, "18": 15.83 },
      ignoradas: [],
    });
  });

  it("linha que não se lê volta em `ignoradas`, nunca adivinhada", () => {
    const lido = lerTabelaDeTaxas("3x sem taxa\n30x – 20%\nPix – 0%\n4x – 6,42%");
    expect(lido.credito).toEqual({ "4": 6.42 });
    expect(lido.ignoradas).toEqual(["3x sem taxa", "30x – 20%", "Pix – 0%"]);
  });

  it("taxa absurda (acima de 40%) é ignorada", () => {
    expect(lerTabelaDeTaxas("12x – 99%").ignoradas).toEqual(["12x – 99%"]);
  });

  it("ida e volta: o texto gravado relê igual", () => {
    const texto = textoDaTabelaDeTaxas(LOJA);
    const relido = lerTabelaDeTaxas(texto);
    expect({ debito: relido.debito, credito: relido.credito }).toEqual({ debito: LOJA.debito, credito: LOJA.credito });
  });
});

describe("simularOpcao", () => {
  it("repassa a taxa: total = à vista / (1 - taxa), parcela = total / vezes", () => {
    // R$ 1.000 em 10x a 10,2%: 1000 / 0,898 = 1113,59 → 10x de 111,36
    expect(simularOpcao(100_000, 10, LOJA)).toEqual({
      opcao: 10,
      taxa: 10.2,
      sem_acrescimo: false,
      total_cents: 111_359,
      parcela_cents: 11_136,
    });
  });

  it("débito e crédito à vista: uma vez só, parcela = total", () => {
    expect(simularOpcao(100_000, "debito", LOJA)).toMatchObject({ total_cents: 102_344, parcela_cents: 102_344 });
    expect(simularOpcao(100_000, 1, LOJA)).toMatchObject({ total_cents: 104_482, parcela_cents: 104_482 });
  });

  it("opção sem taxa cadastrada devolve null — nunca estima pela vizinha", () => {
    expect(simularOpcao(100_000, 12, LOJA)).toBeNull();
    expect(simularOpcao(100_000, "debito", { ...LOJA, debito: null })).toBeNull();
  });

  it("valor não positivo ou não inteiro devolve null", () => {
    expect(simularOpcao(0, 2, LOJA)).toBeNull();
    expect(simularOpcao(-100, 2, LOJA)).toBeNull();
    expect(simularOpcao(10.5, 2, LOJA)).toBeNull();
  });

  it("'até Nx sem juros': até ali a loja absorve a taxa", () => {
    const semJurosAte2 = { ...LOJA, sem_acrescimo_ate: 2 };
    expect(simularOpcao(100_000, 2, semJurosAte2)).toMatchObject({
      sem_acrescimo: true,
      total_cents: 100_000,
      parcela_cents: 50_000,
    });
    expect(simularOpcao(100_000, 10, semJurosAte2)).toMatchObject({ sem_acrescimo: false, total_cents: 111_359 });
    // Débito não é parcela: "sem juros" não o alcança.
    expect(simularOpcao(100_000, "debito", semJurosAte2)).toMatchObject({ sem_acrescimo: false });
  });
});

describe("simularTodas", () => {
  it("débito primeiro, depois o crédito em ordem, só o que está cadastrado", () => {
    expect(simularTodas(100_000, LOJA).map((s) => s.opcao)).toEqual(["debito", 1, 2, 10, 18]);
  });
});

describe("lerConfigDoParcelamento", () => {
  it("sem nada gravado: sem taxas", () => {
    const config = lerConfigDoParcelamento({});
    expect(temTaxas(config)).toBe(false);
  });

  it("vezes fora do teto são descartadas na leitura", () => {
    const config = lerConfigDoParcelamento({ parcelamento: { debito: 2, credito: { "2": 5, "30": 20 } } });
    expect(config.credito).toEqual({ "2": 5 });
    expect(config.sem_acrescimo_ate).toBe(0);
  });
});
