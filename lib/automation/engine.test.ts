import { describe, expect, it, vi } from "vitest";
import "@/lib/automation/actions/add-tag"; // side-effect: registra "add_tag" (com simulate)
import { dryRunAutomationRule, type RuleRow } from "./engine";
import type { EventRow } from "@/lib/event-log/dispatcher";

/**
 * `ctx.admin` que EXPLODE em qualquer uso — a mesma técnica de
 * `add-tag.test.ts`. `dryRunAutomationRule` só toca o banco em leitura
 * (dentro de `buildContext`, e só quando `entity_kind`/`entity_id` batem
 * com um dos ramos dele); usando um evento sem esses campos, nada aqui
 * deveria disparar o mock — se disparar, o teste falha com a mensagem do
 * `throw`, provando que um caminho de I/O inesperado foi tocado.
 */
function adminQueNuncaDeveSerTocado() {
  return {
    from: vi.fn(() => {
      throw new Error("dryRunAutomationRule não deveria tocar o banco neste cenário");
    }),
    rpc: vi.fn(() => {
      throw new Error("dryRunAutomationRule não deveria chamar RPC neste cenário");
    }),
  } as unknown as Parameters<typeof dryRunAutomationRule>[0];
}

function baseEvent(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "evt-1",
    organization_id: "org-1",
    event_type: "lead.created",
    entity_kind: "outro_tipo_sem_branch", // buildContext não reconhece — zero query.
    entity_id: null,
    payload: { foo: "bar" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    ...overrides,
  };
}

function baseRule(overrides: Partial<RuleRow> = {}): RuleRow {
  return {
    id: "rule-1",
    name: "Regra de teste",
    conditions: [],
    actions: [],
    ...overrides,
  };
}

describe("dryRunAutomationRule", () => {
  it("condições não batem → wouldMatch false, results vazio, zero ação simulada", async () => {
    const admin = adminQueNuncaDeveSerTocado();
    const rule = baseRule({
      conditions: [{ field: "event.foo", op: "eq", value: "não é bar" }],
      actions: [{ type: "add_tag", config: { tags: ["x"] } }],
    });
    const resultado = await dryRunAutomationRule(admin, rule, baseEvent());
    expect(resultado).toEqual({ wouldMatch: false, results: [] });
  });

  it("condições batem, ação desconhecida → failed unknown_action, marcado simulated", async () => {
    const admin = adminQueNuncaDeveSerTocado();
    const rule = baseRule({ actions: [{ type: "tipo_que_nao_existe" }] });
    const resultado = await dryRunAutomationRule(admin, rule, baseEvent());
    expect(resultado.wouldMatch).toBe(true);
    expect(resultado.results).toEqual([
      { type: "tipo_que_nao_existe", status: "failed", error: "unknown_action", detail: { simulated: true } },
    ]);
  });

  it("ação sem simulate() cai no fallback — nunca chama execute() de verdade", async () => {
    const admin = adminQueNuncaDeveSerTocado();
    // send_ai_message tem simulate; registramos um tipo fake SEM simulate pra
    // provar o fallback sem depender de nenhuma ação real do produto.
    const { registerAction } = await import("@/lib/automation/actions");
    registerAction({
      type: "acao_sem_simulate_para_teste",
      execute: vi.fn(async () => {
        throw new Error("execute() NUNCA deveria rodar durante um dry-run");
      }),
    });
    const rule = baseRule({ actions: [{ type: "acao_sem_simulate_para_teste" }] });
    const resultado = await dryRunAutomationRule(admin, rule, baseEvent());
    expect(resultado.wouldMatch).toBe(true);
    expect(resultado.results).toEqual([
      {
        type: "acao_sem_simulate_para_teste",
        status: "skipped",
        detail: {
          simulated: true,
          explicacao: "Esta ação ainda não tem simulação — não foi testada nem executada.",
        },
      },
    ]);
  });

  it("ação com simulate() é chamada via simulate — nunca via execute (admin não é tocado)", async () => {
    const admin = adminQueNuncaDeveSerTocado();
    const rule = baseRule({ actions: [{ type: "add_tag", config: { tags: ["x"] } }] });
    // Evento sem lead/contact no contexto → add_tag.simulate devolve skipped
    // "no_target", SEM tocar ctx.admin. Se `execute` tivesse rodado no lugar
    // de `simulate`, o mock acima já teria lançado antes de chegarmos aqui.
    const resultado = await dryRunAutomationRule(admin, rule, baseEvent());
    expect(resultado.wouldMatch).toBe(true);
    expect(resultado.results).toEqual([
      { type: "add_tag", status: "skipped", detail: { reason: "no_target", simulated: true } },
    ]);
  });

  it("regra sem ação nenhuma: wouldMatch true, results vazio", async () => {
    const admin = adminQueNuncaDeveSerTocado();
    const resultado = await dryRunAutomationRule(admin, baseRule(), baseEvent());
    expect(resultado).toEqual({ wouldMatch: true, results: [] });
  });
});
