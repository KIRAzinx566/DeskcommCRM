/**
 * CLASSIFICADOR AUXILIAR "ADVISÓRIO" QUE DERRUBA O TURNO NÃO É ADVISÓRIO.
 *
 * ## O defeito, medido ao vivo
 *
 * `classifyStage` e `classifyJailbreak` têm os dois o mesmo docblock —
 * "degrada sem sugestão; o turno segue normal" / "NÃO veta o inbound" — mas
 * até esta correção nenhum dos dois tinha `try/catch` no call site: um
 * `await` sem guarda nenhuma, dentro de `executarTurnoDoAgente`.
 *
 * Um 429 de rate limit (medido: NVIDIA, tier gratuito, 40 req/min por modelo)
 * na chamada do `stage_classifier` SOBE sem tratamento, passa direto por
 * `comHandoffSeOrcamentoAcabar` (que só resgata `LlmBudgetExceededError` —
 * ver `handoff-por-orcamento.test.ts`) e derruba o TURNO INTEIRO antes da
 * resposta principal ser tentada. Resultado: o cliente manda mensagem no
 * WhatsApp e nunca recebe resposta — nem da IA, nem de humano (o handoff só
 * dispara para orçamento esgotado) — e depois de `max_attempts` a Central
 * ganha um `job_dead` genérico, sem dizer que o motivo foi um classificador
 * AUXILIAR, não a resposta em si.
 *
 * ## O que se prova aqui
 *
 * Estático, pelo mesmo motivo do arquivo irmão: exercitar
 * `executarTurnoDoAgente` de ponta a ponta pede o turno inteiro montado, e
 * `executarTurnoDoAgente` não é exportada de propósito (ver
 * `handoff-por-orcamento.test.ts`). A propriedade que importa — "o call site
 * tem try/catch que só relança LlmBudgetExceededError, e degrada (não
 * relança) qualquer outro erro" — é legível no texto e verificável por
 * sabotagem.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const INBOUND = join(RAIZ, "lib/agent-engine/agent/inbound-turn.ts");
const FONTE = readFileSync(INBOUND, "utf8");

/**
 * O bloco de código entre duas âncoras textuais — mesma técnica de
 * `corpoDaFuncao` usada em outros testes deste repo para não depender de um
 * parser de AST.
 */
function trecho(inicio: string, fim: string): string {
  const i = FONTE.indexOf(inicio);
  expect(i, `âncora de início não encontrada: ${inicio}`).toBeGreaterThan(-1);
  const f = FONTE.indexOf(fim, i);
  expect(f, `âncora de fim não encontrada: ${fim}`).toBeGreaterThan(i);
  return FONTE.slice(i, f);
}

describe("classifyStage não derruba o turno num erro de provedor", () => {
  const bloco = trecho(
    "if (deps.knobs.stageClassifier !== undefined) {",
    "// F4-04: classifier ADVISÓRIO anti-jailbreak",
  );

  it("a chamada está dentro de um try", () => {
    expect(bloco, "sem try, qualquer exceção sobe sem tratamento").toContain("try {");
    expect(bloco.indexOf("try {")).toBeLessThan(bloco.indexOf("await classifyStage("));
  });

  it("LlmBudgetExceededError ainda relança — a escolta de orçamento precisa dela", () => {
    expect(
      bloco,
      "sem relançar o erro de orçamento, o handoff humano (comHandoffSeOrcamentoAcabar) nunca dispara",
    ).toMatch(/if\s*\(\s*err instanceof LlmBudgetExceededError\s*\)\s*throw err;/);
  });

  it("qualquer outro erro é logado, não relançado — o turno segue sem hint", () => {
    // A régua é NEGATIVA por natureza (ausência de um segundo `throw`), então o
    // controle positivo abaixo prova que a sonda enxerga um `throw` quando ele existe.
    const catchBlock = bloco.slice(bloco.indexOf("} catch (err) {"));
    expect(catchBlock, "catch não encontrado").not.toBe("");
    expect(catchBlock).toContain("runLog.warn(");
    // Só UM throw dentro do catch (o condicional de orçamento) — um segundo
    // `throw err;` fora do `if` reintroduziria o defeito original.
    const throws = catchBlock.match(/\bthrow\b/g) ?? [];
    expect(throws.length, "catch com mais de um throw volta a derrubar o turno em erro comum").toBe(1);
  });
});

describe("classifyJailbreak não derruba o turno num erro de provedor", () => {
  const bloco = trecho(
    "if (camadaLigada(camadas.jailbreak, deps.knobs.jailbreak !== undefined)) {",
    "// Spec 16 §4: a projeção arma",
  );

  it("a chamada está dentro de um try", () => {
    expect(bloco).toContain("try {");
    expect(bloco.indexOf("try {")).toBeLessThan(bloco.indexOf("await classifyJailbreak("));
  });

  it("LlmBudgetExceededError ainda relança", () => {
    expect(bloco).toMatch(/if\s*\(\s*err instanceof LlmBudgetExceededError\s*\)\s*throw err;/);
  });

  it("qualquer outro erro é logado, não relançado", () => {
    const catchBlock = bloco.slice(bloco.indexOf("} catch (err) {"));
    expect(catchBlock).not.toBe("");
    expect(catchBlock).toContain("runLog.warn(");
    const throws = catchBlock.match(/\bthrow\b/g) ?? [];
    expect(throws.length).toBe(1);
  });
});

describe("controle negativo: a sonda acusa a volta do defeito", () => {
  it("catch que relança tudo (defeito original) reprova a régua de 1 throw só", () => {
    // Sabota o CATCH, não a estrutura toda: troca a mensagem de log condicional
    // por um `throw err;` incondicional — exatamente o defeito original (um 429
    // comum derrubando o turno como se fosse orçamento esgotado).
    const original = trecho(
      "if (deps.knobs.stageClassifier !== undefined) {",
      "// F4-04: classifier ADVISÓRIO anti-jailbreak",
    );
    const catchOriginal = original.slice(original.indexOf("} catch (err) {"));
    const catchSabotado = catchOriginal.replace(
      /runLog\.warn\(\s*'stage-classifier[\s\S]*?\}\);/,
      "throw err;",
    );
    expect(catchSabotado, "a sabotagem não mudou o catch — a sonda não acha o alvo").not.toBe(
      catchOriginal,
    );
    const throws = catchSabotado.match(/\bthrow\b/g) ?? [];
    expect(
      throws.length,
      "com o defeito original (relança tudo), a régua de 'só 1 throw' teria que acusar 2",
    ).toBe(2);
  });
});
