import { describe, expect, it } from "vitest";

import { previsaoPorEtapa, probabilidadeEfetiva } from "./previsao";
import type { Lead } from "@/lib/types/leads";
import type { Stage } from "./types";

function stage(over: Partial<Stage> & { id: string }): Stage {
  return {
    organization_id: "org",
    pipeline_id: "pipe",
    name: over.id,
    slug: over.id,
    position: 0,
    color: null,
    is_won: false,
    is_lost: false,
    is_archived: false,
    expected_duration_hours: null,
    win_probability: null,
    ...over,
  };
}

function lead(over: Partial<Lead> & { id: string; stage_id: string }): Lead {
  return {
    organization_id: "org",
    pipeline_id: "pipe",
    title: over.id,
    description: null,
    contact_id: null,
    lost_reason: null,
    owner_user_id: null,
    owner_kind: null,
    owner_agent_id: null,
    value_cents: null,
    currency: null,
    position_in_stage: 0,
    status: "open",
    assigned_at: null,
    last_activity_at: null,
    expected_close_date: null,
    closed_at: null,
    source: "manual",
    source_metadata: {},
    external_id: null,
    tags: [],
    custom_fields: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by_user_id: null,
    ...over,
  };
}

describe("probabilidadeEfetiva", () => {
  it("etapa de ganho é sempre 100, mesmo com win_probability configurado diferente", () => {
    expect(probabilidadeEfetiva({ is_won: true, is_lost: false, win_probability: 40 })).toBe(100);
  });

  it("etapa de perda é sempre 0", () => {
    expect(probabilidadeEfetiva({ is_won: false, is_lost: true, win_probability: 90 })).toBe(0);
  });

  it("etapa aberta sem configuração é null, não zero", () => {
    expect(
      probabilidadeEfetiva({ is_won: false, is_lost: false, win_probability: null }),
    ).toBeNull();
  });

  it("etapa aberta com configuração usa o valor configurado", () => {
    expect(probabilidadeEfetiva({ is_won: false, is_lost: false, win_probability: 65 })).toBe(65);
  });
});

describe("previsaoPorEtapa", () => {
  it("etapa sem win_probability entra no bruto e fica de fora do ponderado (null, não zero)", () => {
    const s = [stage({ id: "s1", win_probability: null })];
    const l = [lead({ id: "l1", stage_id: "s1", value_cents: 10_000 })];
    const r = previsaoPorEtapa(l, s);
    expect(r.porEtapa[0]!.bruto_cents).toBe(10_000);
    expect(r.porEtapa[0]!.ponderado_cents).toBeNull();
    expect(r.bruto_cents).toBe(10_000);
    expect(r.ponderado_cents).toBe(0);
  });

  it("etapa com win_probability pondera a soma", () => {
    const s = [stage({ id: "s1", win_probability: 50 })];
    const l = [
      lead({ id: "l1", stage_id: "s1", value_cents: 10_000 }),
      lead({ id: "l2", stage_id: "s1", value_cents: 20_000 }),
    ];
    const r = previsaoPorEtapa(l, s);
    expect(r.porEtapa[0]!.bruto_cents).toBe(30_000);
    expect(r.porEtapa[0]!.ponderado_cents).toBe(15_000);
    expect(r.ponderado_cents).toBe(15_000);
  });

  it("won sempre soma 100% no ponderado, ignorando win_probability", () => {
    const s = [stage({ id: "won", is_won: true, win_probability: 10 })];
    const l = [lead({ id: "l1", stage_id: "won", value_cents: 5_000 })];
    const r = previsaoPorEtapa(l, s);
    expect(r.porEtapa[0]!.ponderado_cents).toBe(5_000);
  });

  it("lost sempre soma 0 no ponderado", () => {
    const s = [stage({ id: "lost", is_lost: true, win_probability: 80 })];
    const l = [lead({ id: "l1", stage_id: "lost", value_cents: 5_000 })];
    const r = previsaoPorEtapa(l, s);
    expect(r.porEtapa[0]!.ponderado_cents).toBe(0);
  });

  it("value_cents nulo conta como 0 no bruto e não quebra o ponderado", () => {
    const s = [stage({ id: "s1", win_probability: 50 })];
    const l = [lead({ id: "l1", stage_id: "s1", value_cents: null })];
    const r = previsaoPorEtapa(l, s);
    expect(r.porEtapa[0]!.bruto_cents).toBe(0);
    expect(r.porEtapa[0]!.ponderado_cents).toBe(0);
  });

  it("total agrega várias etapas, misturando com e sem probabilidade", () => {
    const s = [
      stage({ id: "s1", win_probability: 50 }),
      stage({ id: "s2", win_probability: null }),
    ];
    const l = [
      lead({ id: "l1", stage_id: "s1", value_cents: 10_000 }),
      lead({ id: "l2", stage_id: "s2", value_cents: 7_000 }),
    ];
    const r = previsaoPorEtapa(l, s);
    expect(r.bruto_cents).toBe(17_000);
    expect(r.ponderado_cents).toBe(5_000);
  });
});
