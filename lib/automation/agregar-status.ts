/**
 * A MESMA fórmula que decide o status agregado de um run, usada por
 * `engine.ts` (execução original) e por `runs/[runId]/resend/route.ts`
 * (retomada) — extraída pra não duplicar a régua em dois lugares (doutrina
 * DIRC, anti-pattern nº2: "duplicação sem source of truth declarado").
 *
 * Falha (+skip) vence adiamento: uma regra em que uma ação falhou/pulou e
 * outra ficou esperando é `partial` — quem lê precisa saber que algo
 * quebrou, não que está tudo a caminho. Ver o comentário original em
 * `engine.ts` (migration 0175) para o histórico completo de por que isso
 * importa.
 */
import type { ActionResultDetail } from "./types";

export type StatusAgregadoDoRun = "success" | "partial" | "failed" | "adiado";

export function agregarStatusDoRun(results: ActionResultDetail[]): StatusAgregadoDoRun {
  const naoEnviadas = results.filter((r) => r.status === "failed" || r.status === "skipped").length;
  const adiados = results.filter((r) => r.status === "postponed").length;
  if (naoEnviadas === 0 && adiados > 0) return "adiado";
  if (naoEnviadas === 0) return "success";
  return naoEnviadas === results.length ? "failed" : "partial";
}
