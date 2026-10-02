import { describe, expect, it } from "vitest";

import { lerComandoDoCanalDireto } from "./comando";

describe("lerComandoDoCanalDireto", () => {
  it("#agentes (literal inteiro) vira listar", () => {
    expect(lerComandoDoCanalDireto("#agentes")).toEqual({ tipo: "listar" });
    expect(lerComandoDoCanalDireto("  #AGENTES  ")).toEqual({ tipo: "listar" });
  });

  it("#agente <nome> vira selecionar, preservando acentuação e caixa do nome", () => {
    expect(lerComandoDoCanalDireto("#agente Clínica Bela Vista")).toEqual({
      tipo: "selecionar",
      nomeDigitado: "Clínica Bela Vista",
    });
  });

  it("#agente case-insensitive no prefixo", () => {
    expect(lerComandoDoCanalDireto("#AGENTE Vendas")).toEqual({
      tipo: "selecionar",
      nomeDigitado: "Vendas",
    });
  });

  it("#agente sem nome não é comando válido", () => {
    expect(lerComandoDoCanalDireto("#agente")).toBeNull();
    expect(lerComandoDoCanalDireto("#agente   ")).toBeNull();
  });

  it("mensagem comum (correção/pergunta) não é comando", () => {
    expect(lerComandoDoCanalDireto("Pare de oferecer desconto sem perguntar")).toBeNull();
    expect(lerComandoDoCanalDireto("quais agentes vocês tem?")).toBeNull();
  });

  it("corpo nulo/indefinido não é comando", () => {
    expect(lerComandoDoCanalDireto(null)).toBeNull();
    expect(lerComandoDoCanalDireto(undefined)).toBeNull();
  });

  it("#agentes seguido de texto não conta como o comando de listar", () => {
    expect(lerComandoDoCanalDireto("#agentes disponíveis, por favor")).toBeNull();
  });
});
