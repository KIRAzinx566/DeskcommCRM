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
 * heurística que preencha isso com segurança: inventar a partir do nome do
 * modelo é exatamente o erro que a OpenRouter evita não fazendo (ver doc de
 * lá) — e aqui a origem nem manda o nome com pistas confiáveis. Preço fica
 * `null` (desconhecido, nunca 0 inventado) e `supports_vision` fica `false`
 * até a origem publicar o dado.
 *
 * `supports_tools` é a exceção, e por isso vem de outro lugar:
 * `nvidia-capacidades-conhecidas.ts`, uma lista mantida à mão a partir da
 * mesma fonte que o client Python oficial da NVIDIA usa (não existe API para
 * isso — nem o `ChatNVIDIA.get_available_models()` deles foge de uma tabela
 * escrita à mão). Um id fora dessa lista continua `false` — "não verificado"
 * tem o mesmo efeito prático de "sem heurística", que é o mesmo erro seguro
 * de sempre: ficar de fora do seletor de "ponto que exige tools" é o erro
 * seguro; aparecer disponível e falhar na primeira chamada de ferramenta não
 * é.
 */

import { MODELOS_NVIDIA_COM_FERRAMENTAS_CONFIRMADAS } from "./nvidia-capacidades-conhecidas";

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

/**
 * `GET /v1/models` da NVIDIA não manda descrição, categoria nem capacidade —
 * só `id` e `owned_by`. Sem esse dado, a tela mostraria 101 linhas idênticas
 * ("Publicado por X."), e o operador não teria como saber qual escolher para
 * qual ponto do agente.
 *
 * A convenção de nome desses modelos (toda a comunidade, não só a NVIDIA:
 * `embed`, `vision`/`vl`, `guard`/`safety`, `translate`, `code`/`coder`) é
 * estável o bastante para classificar por PADRÃO DO ID — diferente de inferir
 * `supports_tools`/`supports_vision` (que gate funcionalidade e por isso só
 * vêm de campo estruturado da origem, nunca do nome), isto aqui é só o texto
 * de ajuda que a tela mostra: errar a categoria não quebra chamada nenhuma,
 * só deixa a dica imprecisa — e nenhuma dica nenhuma é pior que isso.
 *
 * Ordem importa: os testes de propósito especial (embedding, guard, visão,
 * tradução, reward, parsing) vêm ANTES do de tamanho, porque um nome como
 * `nvidia/llama-3.2-nv-embedqa-1b-v1` bate em "1b" E em "embed" — e ser
 * embedding é a informação que mais importa aqui.
 */
export function inferirCategoria(id: string): string {
  const s = id.toLowerCase();

  if (/embed|bge\b/.test(s)) return "Gera embeddings — busca semântica/RAG, não conversa com o cliente.";
  if (/guard|safety|topic-control/.test(s)) return "Moderação/classificação de conteúdo — não é para conversar direto com o cliente.";
  if (/reward/.test(s)) return "Avalia respostas de outro modelo (reward model) — não conversa direto.";
  if (/parse|nemoretriever-parse/.test(s)) return "Leitura/extração de documentos, não é modelo de chat.";
  if (/translate/.test(s)) return "Tradução automática.";
  if (/vision|-vl-|vila|neva|kosmos|fuyu|cosmos-reason|diffusiongemma/.test(s)) return "Entende imagem além de texto (multimodal).";
  if (/code|coder|codestral|starcoder/.test(s)) return "Especializado em geração e explicação de código.";

  if (/(^|[^0-9])(70b|8x22b|22b|34b|4[05]0b|253b|340b|550b|super|ultra)([^0-9]|$)/.test(s)) {
    return "Modelo grande — respostas mais elaboradas, mais lento e mais caro em cômputo.";
  }
  if (/(^|[^0-9])([1-3]b|nano|mini)([^0-9]|$)/.test(s)) {
    return "Modelo leve — rápido, bom para tarefas simples e alto volume.";
  }

  return "Modelo de conversa geral (chat/instruct).";
}

/** Traduz UM modelo. `null` quando a entrada não é utilizável. */
export function traduzirModeloNvidia(m: ModeloDaNvidia): LinhaDeCatalogoNvidia | null {
  const id = (m.id ?? "").trim();
  if (id === "") return null;

  const dono = (m.owned_by ?? "").trim();
  const categoria = inferirCategoria(id);

  return {
    provider: FONTE_NVIDIA,
    model_id: id,
    display_name: id,
    description: dono ? `${categoria} Publicado por ${dono}.` : categoria,
    context_window: null,
    input_price_per_million_cents: null,
    output_price_per_million_cents: null,
    supports_tools: MODELOS_NVIDIA_COM_FERRAMENTAS_CONFIRMADAS.has(id),
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
