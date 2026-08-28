/**
 * `generateText` esgota `maxRetries` e embrulha tudo num `RetryError` cuja
 * `.message` é genérica ("Failed after N attempts. Last error: …") — sem o
 * `statusCode` do provedor, que só existe no `.lastError`. Sem desembrulhar,
 * um 429 real de NVIDIA/OpenRouter caía em `erro_desconhecido` na tela de
 * Execuções, em vez de `limite_ou_saldo` — medido ao vivo numa instalação real
 * (mensagem do provedor: "Failed after 3 attempts. Last error:
 * AI_APICallError: Too Many Requests").
 */
import { RetryError } from "ai";
import { describe, expect, it } from "vitest";

import { normalizarErro } from "@/lib/agent-engine/edge/llm/run-model-call";

describe("normalizarErro — desembrulha RetryError", () => {
  it("429 dentro de um RetryError vira limite_ou_saldo (o caso medido)", () => {
    const retry = new RetryError({
      message: "Failed after 3 attempts. Last error: AI_APICallError: Too Many Requests",
      reason: "maxRetriesExceeded",
      errors: [
        { message: "AI_APICallError: Too Many Requests", statusCode: 429 },
      ],
    });
    expect(normalizarErro(retry).error_code).toBe("limite_ou_saldo");
  });

  it("404 dentro de um RetryError vira modelo_inexistente", () => {
    const retry = new RetryError({
      message: "Failed after 3 attempts. Last error: AI_APICallError: model not found",
      reason: "maxRetriesExceeded",
      errors: [{ message: "model not found", statusCode: 404 }],
    });
    expect(normalizarErro(retry).error_code).toBe("modelo_inexistente");
  });

  it("'too many requests' sem status numérico ainda casa por texto", () => {
    expect(normalizarErro(new Error("Too Many Requests")).error_code).toBe("limite_ou_saldo");
  });

  it("erro que não veio de RetryError continua classificado como antes", () => {
    const erro = Object.assign(new Error("boom"), { statusCode: 503 });
    expect(normalizarErro(erro).error_code).toBe("provedor_indisponivel");
  });
});
