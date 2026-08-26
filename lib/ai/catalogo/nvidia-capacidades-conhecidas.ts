/**
 * QUAIS MODELOS DA NVIDIA SABEM USAR FERRAMENTAS — dado que a origem não manda.
 *
 * `GET /v1/models` da NVIDIA (consumido por `nvidia.ts`) não devolve
 * `supported_parameters` nem nada equivalente — só `id`/`owned_by`. Nem o
 * client Python oficial recomendado pela própria NVIDIA foge disso: o
 * `ChatNVIDIA.get_available_models()[].supports_tools` da
 * `langchain-nvidia-ai-endpoints` vem de uma tabela ESCRITA À MÃO pelos
 * mantenedores (`_statics.py`, `MODEL_TABLE`), não de uma API. Não existe
 * fonte dinâmica para este dado — só a mesma alternativa que eles escolheram:
 * uma lista mantida por gente, atualizada quando a lista de origem muda.
 *
 * Esta lista é esse mesmo mecanismo, do mesmo lugar: os ids abaixo são os que
 * aparecem com `supports_tools=True` em
 * https://github.com/langchain-ai/langchain-nvidia/blob/main/libs/ai-endpoints/langchain_nvidia_ai_endpoints/_statics.py
 * (capturado em 2026-08-25). Um id fora daqui não é "sabidamente sem
 * ferramentas" — é "não verificado", e por isso `traduzirModeloNvidia`
 * continua tratando ausência como `false`: o mesmo erro seguro de sempre,
 * só que agora com dado real para os casos que já foram verificados, em vez
 * de nenhum.
 *
 * ⚠️ EXCLUÍDOS DE PROPÓSITO, mesmo aparecendo como `supports_tools=True` na
 * tabela de origem: `deepseek-ai/deepseek-v4-pro` e
 * `deepseek-ai/deepseek-v4-flash`. Bug documentado no fórum da NVIDIA — o
 * modelo emite a tool call, mas a conversão do formato nativo do DeepSeek
 * para o streaming OpenAI-compatible quebra no meio, e a chamada nunca
 * completa:
 * https://forums.developer.nvidia.com/t/deepseek-v4-pro-v4-flash-on-nvidia-nim-streaming-tool-calls-do-not-continue-in-claude-code-anthropic-compatible-agent-workflow/368085
 * "A origem diz que sabe" não vale mais que "sabemos que quebra" — o mesmo
 * princípio de `validar-binding.ts`: o pior desfecho deste produto é o
 * agente parecer que funciona e nada chegar ao funil.
 */
export const MODELOS_NVIDIA_COM_FERRAMENTAS_CONFIRMADAS: ReadonlySet<string> = new Set([
  "bytedance/seed-oss-36b-instruct",
  "deepseek-ai/deepseek-r1-0528",
  "deepseek-ai/deepseek-v3.1-terminus",
  "deepseek-ai/deepseek-v3.2",
  "google/gemma-4-31b-it",
  "ibm/granite-3.3-8b-instruct",
  "meta/llama-3.1-405b-instruct",
  "meta/llama-3.1-70b-instruct",
  "meta/llama-3.1-8b-instruct",
  "meta/llama-3.2-1b-instruct",
  "meta/llama-3.2-3b-instruct",
  "meta/llama-3.3-70b-instruct",
  "meta/muse-glimmer-30b",
  "microsoft/phi-4-mini-instruct",
  "minimaxai/minimax-m2",
  "mistralai/ministral-3-14b-instruct-2512",
  "mistralai/mistral-nemotron",
  "mistralai/mistral-small-3.1-24b-instruct-2503",
  "moonshotai/kimi-k2-instruct",
  "moonshotai/kimi-k2-instruct-0905",
  "moonshotai/kimi-k2-thinking",
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2.6",
  "nv-mistralai/mistral-nemo-12b-instruct",
  "nvidia/llama-3.1-nemotron-nano-4b-v1.1",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nvidia/llama-3.3-nemotron-super-49b-v1.5",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-ultra-550b-a55b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "nvidia/nvidia-nemotron-nano-9b-v2",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3-235b-a22b",
  "qwen/qwen3-next-80b-a3b-instruct",
  "qwen/qwen3-next-80b-a3b-thinking",
  "qwen/qwen3.5-122b-a10b",
  "qwen/qwq-32b",
  "stepfun-ai/step-3.5-flash",
  "stepfun-ai/step-3.7-flash",
  "z-ai/glm-5.1",
  "z-ai/glm4.7",
  "z-ai/glm5",
]);
