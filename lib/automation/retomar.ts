/**
 * A decisão pura de "quais passos retomar" — extraída de
 * `runs/[runId]/resend/route.ts` pra ser testável sem mockar Supabase.
 *
 * Duas guardas, nesta ordem:
 * 1. A regra mudou desde este run (contagem de ações diferente do array de
 *    resultados)? Retomar por ÍNDICE contra uma lista diferente executaria
 *    a ação ERRADA — pior que recusar.
 * 2. Nada pra retomar (tudo já era `success`/`postponed`)? `postponed` tem
 *    retry próprio via reagendamento; misturar os dois mecanismos aqui
 *    duplicaria o relógio.
 */
import type { ActionResultDetail } from "./types";

export type DecisaoDeRetomada =
  | { ok: true; indices: number[] }
  | { ok: false; codigo: "rule_changed" | "no_actions_to_resend" };

const RETOMAVEIS = new Set<ActionResultDetail["status"]>(["failed", "skipped"]);

export function decidirRetomada(
  quantidadeDeAcoesDaRegraAtual: number,
  resultadosOriginais: ActionResultDetail[],
): DecisaoDeRetomada {
  if (quantidadeDeAcoesDaRegraAtual !== resultadosOriginais.length) {
    return { ok: false, codigo: "rule_changed" };
  }
  const indices = resultadosOriginais
    .map((r, i) => (RETOMAVEIS.has(r.status) ? i : -1))
    .filter((i) => i >= 0);
  if (indices.length === 0) return { ok: false, codigo: "no_actions_to_resend" };
  return { ok: true, indices };
}
