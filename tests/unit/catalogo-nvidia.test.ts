/**
 * A TRADUÇÃO DO CATÁLOGO DA NVIDIA — irmã de `catalogo-openrouter.test.ts`.
 *
 * A resposta da NVIDIA não traz preço, contexto nem `supported_parameters` —
 * então o que este módulo garante é justamente que NADA disso é inventado:
 * preço fica `null` (nunca 0), `supports_vision` fica `false` até a origem
 * publicar o dado. A descrição, por outro lado, É inferida do padrão do nome
 * (`inferirCategoria`) — é texto de ajuda pra tela, não um campo que gate
 * funcionalidade, então errar a categoria não quebra chamada nenhuma.
 *
 * `supports_tools` é o meio-termo: não é inventado do nome, mas também não
 * fica sempre `false` — vem de `nvidia-capacidades-conhecidas.ts`, a lista
 * mantida à mão descrita lá. Os casos abaixo cobrem as três situações: um id
 * confirmado na lista, um id excluído de propósito (bug documentado do
 * DeepSeek V4 na NIM) e um id ausente da lista (não verificado, fica `false`).
 *
 * Os casos abaixo usam o shape REAL da API, capturado em 2026-08-10
 * (`GET https://integrate.api.nvidia.com/v1/models`, sem chave).
 */
import { describe, expect, it } from "vitest";

import {
  inferirCategoria,
  traduzirCatalogoNvidia,
  traduzirModeloNvidia,
  type ModeloDaNvidia,
} from "@/lib/ai/catalogo/nvidia";

const LLAMA_3_3: ModeloDaNvidia = {
  id: "meta/llama-3.3-70b-instruct",
  owned_by: "meta",
};

describe("inferência de categoria pelo padrão do id", () => {
  it("reconhece embeddings antes de qualquer outra coisa", () => {
    // Bate em "1b" (tamanho) E em "embed" — embedding tem que vencer.
    expect(inferirCategoria("nvidia/llama-3.2-nv-embedqa-1b-v1")).toMatch(/embeddings/i);
    expect(inferirCategoria("baai/bge-m3")).toMatch(/embeddings/i);
  });

  it("reconhece guardrails/moderação", () => {
    expect(inferirCategoria("nvidia/llama-3.1-nemoguard-8b-content-safety")).toMatch(/moderação/i);
    expect(inferirCategoria("nvidia/llama-3.1-nemoguard-8b-topic-control")).toMatch(/moderação/i);
  });

  it("reconhece modelos de visão", () => {
    expect(inferirCategoria("meta/llama-3.2-11b-vision-instruct")).toMatch(/imagem/i);
    expect(inferirCategoria("nvidia/vila")).toMatch(/imagem/i);
    expect(inferirCategoria("adept/fuyu-8b")).toMatch(/imagem/i);
  });

  it("reconhece código", () => {
    expect(inferirCategoria("mistralai/codestral-22b-instruct-v0.1")).toMatch(/código/i);
    expect(inferirCategoria("bigcode/starcoder2-15b")).toMatch(/código/i);
    expect(inferirCategoria("meta/codellama-70b")).toMatch(/código/i);
  });

  it("reconhece tradução e reward model", () => {
    expect(inferirCategoria("nvidia/riva-translate-4b-instruct")).toMatch(/tradução/i);
    expect(inferirCategoria("nvidia/nemotron-4-340b-reward")).toMatch(/avalia/i);
  });

  it("cai para 'grande' ou 'leve' por parâmetros quando não é caso especial", () => {
    expect(inferirCategoria("nvidia/llama-3.1-nemotron-ultra-253b-v1")).toMatch(/grande/i);
    expect(inferirCategoria("meta/llama-3.2-1b-instruct")).toMatch(/leve/i);
    expect(inferirCategoria("meta/llama-3.2-3b-instruct")).toMatch(/leve/i);
  });

  it("cai para chat geral quando nada bate", () => {
    expect(inferirCategoria("meta/llama-3.3-70b-instruct")).toMatch(/grande/i);
    expect(inferirCategoria("mistralai/mistral-7b-instruct-v0.3")).toBe(
      "Modelo de conversa geral (chat/instruct).",
    );
  });
});

describe("tradução de um modelo da NVIDIA", () => {
  it("a descrição combina categoria inferida + quem publicou", () => {
    const linha = traduzirModeloNvidia(LLAMA_3_3);
    expect(linha?.description).toBe(
      "Modelo grande — respostas mais elaboradas, mais lento e mais caro em cômputo. Publicado por meta.",
    );
  });

  it("os demais campos continuam sem inventar dado que a origem não manda", () => {
    const linha = traduzirModeloNvidia(LLAMA_3_3);
    expect(linha).toMatchObject({
      provider: "nvidia",
      model_id: "meta/llama-3.3-70b-instruct",
      display_name: "meta/llama-3.3-70b-instruct",
      context_window: null,
      input_price_per_million_cents: null,
      output_price_per_million_cents: null,
      // Está na lista confirmada — ver nvidia-capacidades-conhecidas.ts.
      supports_tools: true,
      supports_vision: false,
      source: "nvidia",
    });
  });

  it("um id fora da lista confirmada continua supports_tools: false", () => {
    const linha = traduzirModeloNvidia({ id: "mistralai/mixtral-8x7b-instruct-v0.1", owned_by: "mistralai" });
    expect(linha?.supports_tools).toBe(false);
  });

  it("DeepSeek V4 (pro e flash) fica supports_tools: false de propósito, apesar de a fonte dizer que sabe — bug de streaming documentado na NIM", () => {
    expect(traduzirModeloNvidia({ id: "deepseek-ai/deepseek-v4-pro" })?.supports_tools).toBe(false);
    expect(traduzirModeloNvidia({ id: "deepseek-ai/deepseek-v4-flash" })?.supports_tools).toBe(false);
  });

  it("sem owned_by, a descrição é só a categoria — sem 'Publicado por .'", () => {
    const linha = traduzirModeloNvidia({ id: "algum/modelo-2b-instruct" });
    expect(linha?.description).toBe("Modelo leve — rápido, bom para tarefas simples e alto volume.");
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
    expect(catalogo[0]?.description).toMatch(/Publicado por meta-atualizado\.$/);
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
