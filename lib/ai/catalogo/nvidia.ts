/**
 * O CATÁLOGO DA NVIDIA (build.nvidia.com), TRADUZIDO PARA O QUE O SISTEMA SABE
 * GUARDAR.
 *
 * Mesmo motivo da OpenRouter (`./openrouter.ts`): a NVIDIA publica dezenas de
 * modelos open-weight num endpoint OpenAI-compatível, e a lista muda sozinha.
 *
 * ## Onde este catálogo é mais pobre que o da OpenRouter, e por quê isso é
 * intencional
 *
 * `GET /v1/models` da NVIDIA devolve só `id`, `object`, `created` e
 * `owned_by` — sem preço, sem contexto, sem `supported_parameters`. Não há
 * heurística que preencha isso com segurança: inventar `supports_tools: true`
 * a partir do nome do modelo é exatamente o erro que a OpenRouter evita não
 * fazendo (ver doc de lá) — e aqui a origem nem manda o nome com pistas
 * confiáveis. Preço fica `null` (desconhecido, nunca 0 inventado) e as duas
 * capacidades ficam `false` até a origem publicar o dado — ficar de fora do
 * seletor de "ponto que exige tools" é o erro seguro; aparecer disponível e
 * falhar na primeira chamada de ferramenta não é.
 */

/** O recorte da resposta da NVIDIA que este módulo consome. */
export interface ModeloDaNvidia {
  id: string;
  owned_by?: string | null;
}

/** Uma linha pronta para o upsert em `ai_models` — mesma forma do catálogo da OpenRouter. */
export interface LinhaDeCatalogoNvidia {
  provider: string;
  model_id: string;
  display_name: string;
  description: string | null;
  context_window: number | null;
  input_price_per_million_cents: number | null;
  output_price_per_million_cents: number | null;
  supports_tools: boolean;
  supports_vision: boolean;
  source: string;
}

export const FONTE_NVIDIA = "nvidia";

/** Traduz UM modelo. `null` quando a entrada não é utilizável. */
export function traduzirModeloNvidia(m: ModeloDaNvidia): LinhaDeCatalogoNvidia | null {
  const id = (m.id ?? "").trim();
  if (id === "") return null;

  const dono = (m.owned_by ?? "").trim();

  return {
    provider: FONTE_NVIDIA,
    model_id: id,
    display_name: id,
    description: dono ? `Publicado por ${dono}.` : null,
    context_window: null,
    input_price_per_million_cents: null,
    output_price_per_million_cents: null,
    supports_tools: false,
    supports_vision: false,
    source: FONTE_NVIDIA,
  };
}

/**
 * Traduz o catálogo inteiro, descartando o que não dá para usar e removendo
 * duplicata de id — mesma defesa da OpenRouter contra
 * "ON CONFLICT DO UPDATE command cannot affect row a second time".
 */
export function traduzirCatalogoNvidia(modelos: readonly ModeloDaNvidia[]): LinhaDeCatalogoNvidia[] {
  const porId = new Map<string, LinhaDeCatalogoNvidia>();
  for (const m of modelos) {
    const linha = traduzirModeloNvidia(m);
    if (linha === null) continue;
    porId.set(linha.model_id, linha);
  }
  return [...porId.values()];
}
