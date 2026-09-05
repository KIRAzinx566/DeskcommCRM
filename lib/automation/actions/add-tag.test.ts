import { describe, expect, it, vi } from "vitest";
import { simulateAddTag } from "./add-tag";
import type { ActionCtx } from "@/lib/automation/types";

function baseCtx(context: Record<string, unknown>): ActionCtx {
  return {
    // Qualquer chamada aqui é o teste falhando — `simulate` NUNCA deve tocar o banco.
    admin: {
      from: vi.fn(() => {
        throw new Error("simulateAddTag não deveria tocar o banco (ctx.admin.from foi chamado)");
      }),
      rpc: vi.fn(() => {
        throw new Error("simulateAddTag não deveria emitir evento (ctx.admin.rpc foi chamado)");
      }),
    } as unknown as ActionCtx["admin"],
    organizationId: "org-1",
    ruleId: "rule-1",
    ruleName: "Automação de teste",
    requestId: "req-1",
    event: {
      id: "evt-1",
      organization_id: "org-1",
      event_type: "lead.created",
      entity_kind: "crm_lead",
      entity_id: "lead-1",
      payload: {},
      metadata: {},
      consumed_by: [],
      attempts: 0,
    },
    context,
  };
}

describe("simulateAddTag — zero I/O real", () => {
  it("descreve as tags que seriam adicionadas, sem gravar nada", async () => {
    const ctx = baseCtx({ lead: { id: "lead-1", tags: ["existente"] } });
    const result = await simulateAddTag(ctx, { tags: ["nova", "existente"] });
    expect(result.status).toBe("success");
    expect(result.detail?.simulated).toBe(true);
    expect(result.detail?.added).toEqual(["nova"]);
    // ctx.admin.from/.rpc nunca foram chamados — se tivessem sido, o mock acima já teria lançado.
  });

  it("sem contato nem lead no contexto: skipped, sem tocar o banco", async () => {
    const ctx = baseCtx({});
    const result = await simulateAddTag(ctx, { tags: ["x"] });
    expect(result.status).toBe("skipped");
    expect(result.detail?.reason).toBe("no_target");
  });

  it("sem tags configuradas: skipped, sem tocar o banco", async () => {
    const ctx = baseCtx({ lead: { id: "lead-1" } });
    const result = await simulateAddTag(ctx, {});
    expect(result.status).toBe("skipped");
    expect(result.detail?.reason).toBe("no_tags");
  });
});
