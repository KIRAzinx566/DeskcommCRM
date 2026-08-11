/**
 * A TRADUÇÃO DO CATÁLOGO DA NVIDIA — irmã de `catalogo-openrouter.test.ts`.
 *
 * A resposta da NVIDIA não traz preço, contexto nem `supported_parameters` —
 * então o que este módulo garante é justamente que NADA disso é inventado:
 * preço fica `null` (nunca 0), `supports_tools`/`supports_vision` ficam
 * `false` até a origem publicar o dado.
 *
 * Os casos abaixo usam o shape REAL da API, capturado em 2026-08-10
 * (`GET https://integrate.api.nvidia.com/v1/models`, sem chave).
 */
import { describe, expect, it } from "vitest";

import {
  traduzirCatalogoNvidia,
  traduzirModeloNvidia,
  type ModeloDaNvidia,
} from "@/lib/ai/catalogo/nvidia";

const LLAMA_3_3: ModeloDaNvidia = {
  id: "meta/llama-3.3-70b-instruct",
  owned_by: "meta",
};

describe("tradução de um modelo da NVIDIA", () => {
  it("converte o caso real do Llama 3.3 70B", () => {
    expect(traduzirModeloNvidia(LLAMA_3_3)).toEqual({
      provider: "nvidia",
      model_id: "meta/llama-3.3-70b-instruct",
      display_name: "meta/llama-3.3-70b-instruct",
      description: "Publicado por meta.",
      context_window: null,
      input_price_per_million_cents: null,
      output_price_per_million_cents: null,
      supports_tools: false,
      supports_vision: false,
      source: "nvidia",
    });
  });

  it("nunca inventa preço — a origem não publica, então fica null, nunca 0", () => {
    const linha = traduzirModeloNvidia(LLAMA_3_3);
    expect(linha?.input_price_per_million_cents).toBeNull();
    expect(linha?.output_price_per_million_cents).toBeNull();
  });

  it("sem owned_by, a descrição fica null em vez de 'Publicado por .'", () => {
    const linha = traduzirModeloNvidia({ id: "algum/modelo" });
    expect(linha?.description).toBeNull();
  });

  it("id vazio ou ausente não produz linha", () => {
    expect(traduzirModeloNvidia({ id: "" })).toBeNull();
    expect(traduzirModeloNvidia({ id: "   " })).toBeNull();
  });
});

describe("tradução do catálogo inteiro", () => {
  it("descarta entradas sem id e remove duplicata mantendo a última", () => {
    const catalogo = traduzirCatalogoNvidia([
      LLAMA_3_3,
      { id: "" },
      { id: "meta/llama-3.3-70b-instruct", owned_by: "meta-atualizado" },
    ]);
    expect(catalogo).toHaveLength(1);
    expect(catalogo[0]?.description).toBe("Publicado por meta-atualizado.");
  });

  it("traduz o recorte real de GET /v1/models (2026-08-10)", () => {
    const catalogo = traduzirCatalogoNvidia([
      { id: "meta/llama-3.1-70b-instruct", owned_by: "meta" },
      { id: "mistralai/mistral-large-2-instruct", owned_by: "mistralai" },
      { id: "nvidia/llama-3.1-nemotron-70b-instruct", owned_by: "nvidia" },
    ]);
    expect(catalogo.map((m) => m.model_id)).toEqual([
      "meta/llama-3.1-70b-instruct",
      "mistralai/mistral-large-2-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
    ]);
    expect(catalogo.every((m) => m.provider === "nvidia" && m.source === "nvidia")).toBe(true);
  });
});
