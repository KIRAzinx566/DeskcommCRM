import { describe, expect, it } from "vitest";

import { lerMensagemDoGrupo, valorEmCentavos } from "./grupo-de-vendas";

const ler = (t: string) => lerMensagemDoGrupo(t);

describe("valorEmCentavos", () => {
  it.each([
    ["2.100,00", 210_000],
    ["2100", 210_000],
    ["9.290", 929_000],
    ["2100,5", 210_050],
    ["49.90", 4_990],
    ["1.234.567", 123_456_700],
  ])("%s → %d", (txt, cents) => {
    expect(valorEmCentavos(txt)).toBe(cents);
  });

  it("texto que não é número volta null", () => {
    expect(valorEmCentavos("dois mil")).toBeNull();
  });
});

describe("lerMensagemDoGrupo — o formato, não o produto", () => {
  it("venda de loja de celular, com o modelo e a capacidade na linha", () => {
    const r = ler("iPhone 13 128GB VENDIDO POR R$2.100,00 pago no pix com Fabio");
    expect(r.lancamentos).toEqual([
      {
        linha: 0,
        direcao: "in",
        valorCents: 210_000,
        forma: "pix",
        descricao: expect.stringContaining("iPhone 13 128GB"),
      },
    ]);
  });

  it("'pago' numa linha de venda é forma de pagamento, não saída", () => {
    expect(ler("17 pro max 512gb vendido 9290 pago em dinheiro").lancamentos[0]).toMatchObject({
      direcao: "in",
      valorCents: 929_000,
      forma: "dinheiro",
    });
  });

  it("outro nicho: perfume, sem R$, valor depois de 'por'", () => {
    expect(ler("vendi 212 VIP 100ml por 449,90 no cartão").lancamentos[0]).toMatchObject({
      direcao: "in",
      valorCents: 44_990,
      forma: "cartão",
    });
  });

  it("gasto vira saída", () => {
    expect(ler("Paguei motoboy entrega R$ 25").lancamentos[0]).toMatchObject({ direcao: "out", valorCents: 2_500 });
    expect(ler("comprei 3 capinhas por 60").lancamentos[0]).toMatchObject({ direcao: "out", valorCents: 6_000 });
  });

  it("várias linhas, um lançamento por linha, com o índice da linha", () => {
    const r = ler("bom dia time\nvendi capinha R$ 50\nvendi película R$ 30 pix");
    expect(r.lancamentos.map((l) => [l.linha, l.valorCents])).toEqual([
      [1, 5_000],
      [2, 3_000],
    ]);
  });

  it("conversa sem verbo de venda nem de gasto é ignorada em silêncio", () => {
    expect(ler("quem fecha a loja hoje? chega às 18")).toEqual({ lancamentos: [], ignoradas: 0 });
  });

  it("dois valores possíveis: não escolhe, conta como ignorada", () => {
    expect(ler("vendi 2 capinhas por 50 e 1 película por 30")).toEqual({ lancamentos: [], ignoradas: 1 });
  });

  it("venda sem valor: ignorada", () => {
    expect(ler("vendi o iphone 15 do Carlos")).toEqual({ lancamentos: [], ignoradas: 1 });
  });

  it("valor absurdo é erro de digitação: ignorado", () => {
    expect(ler("vendi capinha R$ 0,50").ignoradas).toBe(1);
  });

  it("número de modelo e capacidade não viram valor quando há R$", () => {
    expect(ler("Galaxy S24 256GB vendido R$ 3.999").lancamentos[0]!.valorCents).toBe(399_900);
  });

  it("emoji e negrito do WhatsApp não atrapalham", () => {
    expect(ler("✅ *VENDIDO* iPhone 11 — R$ 1.500 💰").lancamentos[0]).toMatchObject({ valorCents: 150_000 });
  });
});
