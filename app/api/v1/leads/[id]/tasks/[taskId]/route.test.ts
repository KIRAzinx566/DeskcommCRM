import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn(async () => ({ ok: true })) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "44444444-4444-4444-8444-444444444444";
const TASK = "55555555-5555-4555-8555-555555555555";

function sessao(papel: Role = "agent") {
  const user: AuthUser = {
    id: USER,
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG, organization_name: "Org", role: papel }],
  };
  vi.mocked(requireRole).mockImplementation(async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user, org: { orgId: ORG, name: "Org", role: papel } }
      : { ok: false, response: fail("forbidden_role", `Requer role >= ${min}.`, 403, {}) },
  );
}

interface DbOpts {
  task?: Record<string, unknown> | null;
  updateError?: { code?: string; message: string } | null;
}

function makeDb(opts: DbOpts) {
  const updates: Array<Record<string, unknown>> = [];
  let linha = opts.task ? { ...opts.task } : null;

  function builder(table: string) {
    const filtros: Array<[string, unknown]> = [];
    let patch: Record<string, unknown> | null = null;

    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return b;
      },
      update: (p: Record<string, unknown>) => {
        patch = p;
        return b;
      },
      maybeSingle: async () => {
        if (table === "crm_leads") return { data: { contact_id: null }, error: null };
        return { data: linha, error: null };
      },
      single: async () => {
        if (opts.updateError) return { data: null, error: opts.updateError };
        if (patch && linha) {
          linha = { ...linha, ...patch };
          updates.push(patch);
        }
        return { data: linha, error: null };
      },
    };
    return b;
  }

  vi.mocked(createClient).mockResolvedValue({ from: builder } as never);
  return { updates, linhaFinal: () => linha };
}

function reqPatch(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD}/tasks/${TASK}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: LEAD, taskId: TASK }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/v1/leads/[id]/tasks/[taskId]", () => {
  it("tarefa não encontrada → 404", async () => {
    sessao();
    makeDb({ task: null });
    const { PATCH } = await import("./route");
    expect((await PATCH(reqPatch({ status: "done" }), ctx)).status).toBe(404);
  });

  it("corpo vazio → 422", async () => {
    sessao();
    makeDb({ task: { id: TASK, organization_id: ORG, lead_id: LEAD, title: "x", status: "pending" } });
    const { PATCH } = await import("./route");
    expect((await PATCH(reqPatch({}), ctx)).status).toBe(422);
  });

  it("marcar como done grava completed_at e emite task_completed", async () => {
    sessao();
    makeDb({ task: { id: TASK, organization_id: ORG, lead_id: LEAD, title: "Ligar", status: "pending" } });
    const { PATCH } = await import("./route");
    const res = await PATCH(reqPatch({ status: "done" }), ctx);
    expect(res.status).toBe(200);

    const chamada = vi.mocked(emitLeadActivity).mock.calls[0]?.[1];
    expect(chamada).toMatchObject({ type: "task_completed", leadId: LEAD });
    expect(audit).toHaveBeenCalledOnce();
  });

  it("descartar emite task_dismissed, e concluir emite task_completed — nunca os dois", async () => {
    sessao();
    makeDb({ task: { id: TASK, organization_id: ORG, lead_id: LEAD, title: "Ligar", status: "pending" } });
    const { PATCH } = await import("./route");
    await PATCH(reqPatch({ status: "dismissed" }), ctx);
    expect(emitLeadActivity).toHaveBeenCalledTimes(1);
    expect(vi.mocked(emitLeadActivity).mock.calls[0]?.[1]).toMatchObject({ type: "task_dismissed" });
  });

  it("editar só o título não emite atividade — não é uma decisão sobre o negócio", async () => {
    sessao();
    makeDb({ task: { id: TASK, organization_id: ORG, lead_id: LEAD, title: "Ligar", status: "pending" } });
    const { PATCH } = await import("./route");
    await PATCH(reqPatch({ title: "Ligar de novo" }), ctx);
    expect(emitLeadActivity).not.toHaveBeenCalled();
  });

  it("viewer não pode editar", async () => {
    sessao("viewer");
    makeDb({ task: { id: TASK, organization_id: ORG, lead_id: LEAD, title: "x", status: "pending" } });
    const { PATCH } = await import("./route");
    expect((await PATCH(reqPatch({ status: "done" }), ctx)).status).toBe(403);
  });
});
