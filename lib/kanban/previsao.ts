import type { Lead } from "@/lib/types/leads";
import type { Stage } from "./types";

/**
 * Previsão de receita por etapa — bruta (soma direta) e ponderada (× probabilidade
 * de fechar), inspirada no Odoo.
 *
 * ⚠️ `is_won`/`is_lost` usam 100/0 FIXO, ignorando `win_probability`: um negócio
 * já ganho não é "provavelmente" ganho, e a coluna de configuração nem oferece o
 * campo para essas duas etapas (ver `_stages.tsx`). Etapa aberta SEM
 * `win_probability` configurado fica de fora do ponderado — DIRC letra C, não
 * inventamos um número (nem 0% nem 50%) que ninguém escolheu.
 *
 * `value_cents` nulo conta como 0 no bruto e não impede o ponderado (um negócio
 * sem valor ainda pode ter etapa com probabilidade — só não soma nada).
 */

export interface PrevisaoPorEtapa {
  stage_id: string;
  stage_name: string;
  /** Soma direta de `value_cents`, sem filtro nenhum. */
  bruto_cents: number;
  /**
   * Soma ponderada, ou `null` quando a etapa não tem probabilidade conhecida
   * (aberta sem `win_probability`) — `null` é "não sei", nunca 0.
   */
  ponderado_cents: number | null;
  /** A probabilidade efetiva usada nesta etapa (100/0 fixo para won/lost). */
  probabilidade: number | null;
}

export interface PrevisaoTotal {
  porEtapa: PrevisaoPorEtapa[];
  bruto_cents: number;
  /** Soma dos ponderados das etapas que TÊM probabilidade — nunca inclui as `null`. */
  ponderado_cents: number;
}

/** A probabilidade efetiva de uma etapa: 100/0 fixo para won/lost, senão a configurada (ou `null`). */
export function probabilidadeEfetiva(
  stage: Pick<Stage, "is_won" | "is_lost" | "win_probability">,
): number | null {
  if (stage.is_won) return 100;
  if (stage.is_lost) return 0;
  return stage.win_probability ?? null;
}

export function previsaoPorEtapa(leads: Lead[], stages: Stage[]): PrevisaoTotal {
  const leadsPorEtapa = new Map<string, Lead[]>();
  for (const lead of leads) {
    const lista = leadsPorEtapa.get(lead.stage_id);
    if (lista) lista.push(lead);
    else leadsPorEtapa.set(lead.stage_id, [lead]);
  }

  const porEtapa: PrevisaoPorEtapa[] = stages.map((stage) => {
    const leadsDaEtapa = leadsPorEtapa.get(stage.id) ?? [];
    const bruto = leadsDaEtapa.reduce((soma, l) => soma + (l.value_cents ?? 0), 0);
    const probabilidade = probabilidadeEfetiva(stage);
    const ponderado = probabilidade === null ? null : Math.round(bruto * (probabilidade / 100));
    return {
      stage_id: stage.id,
      stage_name: stage.name,
      bruto_cents: bruto,
      ponderado_cents: ponderado,
      probabilidade,
    };
  });

  return {
    porEtapa,
    bruto_cents: porEtapa.reduce((soma, e) => soma + e.bruto_cents, 0),
    ponderado_cents: porEtapa.reduce((soma, e) => soma + (e.ponderado_cents ?? 0), 0),
  };
}
