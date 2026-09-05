import { describe, expect, it } from "vitest";
import { interpretarNota } from "./interpretar-nota";

describe("interpretarNota", () => {
  it("dígito 1-5 sozinho vira a nota", () => {
    expect(interpretarNota("5")).toBe(5);
    expect(interpretarNota("1")).toBe(1);
    expect(interpretarNota("  3  ")).toBe(3);
  });

  it("dígito fora de 1-5 não interpreta", () => {
    expect(interpretarNota("0")).toBeNull();
    expect(interpretarNota("6")).toBeNull();
    expect(interpretarNota("10")).toBeNull();
  });

  it("palavras conhecidas, com acento/maiúscula/pontuação, viram nota", () => {
    expect(interpretarNota("Ótimo!")).toBe(5);
    expect(interpretarNota("otimo")).toBe(5);
    expect(interpretarNota("excelente")).toBe(5);
    expect(interpretarNota("Bom.")).toBe(4);
    expect(interpretarNota("regular")).toBe(3);
    expect(interpretarNota("RUIM")).toBe(2);
    expect(interpretarNota("péssimo")).toBe(1);
  });

  it("⚠️ EXIGE o corpo inteiro — palavra no meio de uma frase não conta", () => {
    // O caso que este arquivo existe para vigiar: "bom dia, ainda preciso de
    // ajuda" contém "bom", mas é o cliente continuando a conversa, não
    // avaliando o atendimento.
    expect(interpretarNota("bom dia, ainda preciso de ajuda")).toBeNull();
    expect(interpretarNota("nossa, que atendimento ruim")).toBeNull();
  });

  it("vazio ou só espaço não interpreta", () => {
    expect(interpretarNota("")).toBeNull();
    expect(interpretarNota("   ")).toBeNull();
  });

  it("qualquer outro texto não interpreta", () => {
    expect(interpretarNota("obrigado")).toBeNull();
    expect(interpretarNota("tudo bem?")).toBeNull();
  });
});
