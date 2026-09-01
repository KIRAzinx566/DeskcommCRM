import { describe, expect, it } from "vitest";

import { createDefaultRegistry } from "@/lib/agent-engine/edge/llm/providers";

describe("createDefaultRegistry", () => {
  it("registra os providers que a tela oferece", () => {
    // Eram três até a migration 0127 abrir `provider` como vocabulário aberto e
    // a OpenRouter entrar. A lista fica travada aqui de propósito: provider
    // novo no registry sem entrada em `lib/ai/pontos/provedores.ts` é código
    // que ninguém alcança pela tela, e o inverso é uma tela que oferece o que
    // toda chamada recusaria. O par é vigiado por provedores-x-registry.test.ts.
    const reg = createDefaultRegistry();
    expect(Object.keys(reg).sort()).toEqual([
      "anthropic",
      "custom",
      "google",
      "nvidia",
      "openai",
      "openrouter",
    ]);
  });
  it("cada factory produz um LanguageModel (não lança ao instanciar)", () => {
    const reg = createDefaultRegistry();
    expect(() => reg.anthropic!("k", "claude-sonnet-4-6")).not.toThrow();
    expect(() => reg.openai!("k", "gpt-5")).not.toThrow();
    expect(() => reg.google!("k", "gemini-2.5-pro")).not.toThrow();
    expect(() => reg.openrouter!("k", "meta-llama/llama-3.3-70b-instruct")).not.toThrow();
    // Endpoint próprio (gateway compatível, ou modelo local no roteiro).
    expect(() => reg.openrouter!("k", "x/y", "https://gateway.exemplo/v1")).not.toThrow();
    expect(() => reg.nvidia!("k", "meta/llama-3.3-70b-instruct")).not.toThrow();
    // "custom" SÓ funciona com baseUrl — sem endpoint canônico, de propósito.
    expect(() => reg.custom!("k", "qualquer/modelo", "https://gateway.exemplo/v1")).not.toThrow();
  });

  it("'custom' lança sem baseUrl — não existe endpoint canônico para cair", () => {
    const reg = createDefaultRegistry();
    expect(() => reg.custom!("k", "qualquer/modelo")).toThrow();
  });

  it("openrouter e nvidia falam Chat Completions, não Responses API", () => {
    // ⚠️ O caso acima ("não lança ao instanciar") NUNCA pegaria este bug: as
    // duas classes (OpenAIChatLanguageModel, OpenAIResponsesLanguageModel)
    // instanciam sem erro — só divergem na REQUISIÇÃO, que nenhum teste aqui
    // fazia de verdade.
    //
    // Desde @ai-sdk/openai@4, chamar o provider DIRETO (`createOpenAI(...)
    // (modelId)`, sem `.chat()`) usa a Responses API da OpenAI (`POST
    // /responses`) por padrão. `api.openai.com` fala as duas, então o caso
    // "openai" nunca quebrou visivelmente — mas OpenRouter e a NVIDIA só
    // implementam a Chat Completions antiga (`POST /chat/completions`).
    // Medido ao vivo: curl direto em `/chat/completions` da NVIDIA respondeu
    // 200 pro mesmo par modelo+chave que o produto reportava "Not Found" —
    // toda mensagem real (worker, via este registry) e todo teste pela tela
    // (buildModel em lib/ai/runtime/agent.ts, mesmo bug) batiam em `/responses`
    // e voltavam erro do provedor, nunca do nosso código.
    const reg = createDefaultRegistry();
    const openrouterModel = reg.openrouter!("k", "meta-llama/llama-3.3-70b-instruct");
    const nvidiaModel = reg.nvidia!("k", "meta/llama-3.3-70b-instruct");
    // "openai.chat", não "openrouter.chat"/"nvidia.chat": nenhuma das duas
    // fábricas passa `name` para `createOpenAI`, então o SDK usa o default
    // ("openai") — o que importa aqui é o SUFIXO `.chat`, não o prefixo.
    expect((openrouterModel as { provider: string }).provider).toBe("openai.chat");
    expect((nvidiaModel as { provider: string }).provider).toBe("openai.chat");
  });
});
