import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "44444444-4444-4444-8444-444444444444";

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
  lead?: { id: string; organization_id: string; owner_user_id: string | null; contact_id: string | null } | null;
  tasks?: Array<Record<string, unknown>>;
}

/** Dublê mínimo: aplica `eq`/`order` de verdade sobre listas em memória. */
function makeDb(opts: DbOpts) {
  const inseridos: Array<Record<string, unknown>> = [];

  function builder(table: string) {
    const filtros: Array<[string, unknown]> = [];
    let ordem: { col: string; asc: boolean } | null = null;
    let novaLinha: Record<string, unknown> | null = null;

    const fonte = () => {
      if (table === "crm_leads") return opts.lead ? [opts.lead] : [];
      if (table === "crm_lead_tasks") return opts.tasks ?? [];
      return [];
    };
    const casam = () => fonte().filter((r) => filtros.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
    const lidos = () => {
      const rows = [...casam()];
      if (ordem) {
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[ordem!.col] as string;
          const bv = (b as Record<string, unknown>)[ordem!.col] as string;
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return ordem!.asc ? cmp : -cmp;
        });
      }
      return rows;
    };

    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return b;
      },
      order: (col: string, opts2?: { ascending?: boolean }) => {
        ordem = { col, asc: opts2?.ascending !== false };
        return b;
      },
      insert: (row: Record<string, unknown>) => {
        novaLinha = { id: "nova-tarefa", ...row };
        inseridos.push(novaLinha);
        return b;
      },
      maybeSingle: async () => ({ data: lidos()[0] ?? null, error: null }),
      single: async () => ({ data: novaLinha, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: lidos(), error: null }).then(res),
    };
    return b;
  }

  vi.mocked(createClient).mockResolvedValue({ from: builder } as never);
  return { inseridos };
}

function reqGet() {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD}/tasks`);
}
function reqPost(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD}/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
const ctx = { params: Promise.resolve({ id: LEAD }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/v1/leads/[id]/tasks", () => {
  it("lead não encontrado (RLS ou inexistente) → 404", async () => {
    sessao();
    makeDb({ lead: null });
    const { GET } = await import("./route");
    expect((await GET(reqGet(), ctx)).status).toBe(404);
  });

  it("lista as tarefas do lead ordenadas por prazo", async () => {
    sessao();
    makeDb({
      lead: { id: LEAD, organization_id: ORG, owner_user_id: null, contact_id: null },
      tasks: [
        { id: "t2", lead_id: LEAD, title: "Segunda", due_at: "2026-02-01T00:00:00Z", status: "pending" },
        { id: "t1", lead_id: LEAD, title: "Primeira", due_at: "2026-01-01T00:00:00Z", status: "pending" },
      ],
    });
    const { GET } = await import("./route");
    const body = (await (await GET(reqGet(), ctx)).json()) as { data: { tasks: Array<{ id: string }> } };
    expect(body.data.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("POST /api/v1/leads/[id]/tasks", () => {
  it("corpo sem título/prazo → 422", async () => {
    sessao();
    makeDb({ lead: { id: LEAD, organization_id: ORG, owner_user_id: null, contact_id: null } });
    const { POST } = await import("./route");
    const res = await POST(reqPost({}), ctx);
    expect(res.status).toBe(422);
  });

  it("cria a tarefa herdando o dono do lead quando owner_user_id não vem no corpo", async () => {
    sessao();
    const LEAD_OWNER = "99999999-9999-4999-8999-999999999999";
    const db = makeDb({
      lead: { id: LEAD, organization_id: ORG, owner_user_id: LEAD_OWNER, contact_id: null },
    });
    const { POST } = await import("./route");
    const res = await POST(
      reqPost({ title: "Ligar amanhã", due_at: "2026-03-01T10:00:00Z" }),
      ctx,
    );
    expect(res.status).toBe(201);
    expect(db.inseridos[0]).toMatchObject({
      lead_id: LEAD,
      organization_id: ORG,
      owner_user_id: LEAD_OWNER,
      title: "Ligar amanhã",
    });
    expect(audit).toHaveBeenCalledOnce();
  });

  it("owner_user_id explícito no corpo vence o dono do lead", async () => {
    sessao();
    const OUTRO = "77777777-7777-4777-8777-777777777777";
    const db = makeDb({
      lead: { id: LEAD, organization_id: ORG, owner_user_id: USER, contact_id: null },
    });
    const { POST } = await import("./route");
    await POST(
      reqPost({ title: "Ligar", due_at: "2026-03-01T10:00:00Z", owner_user_id: OUTRO }),
      ctx,
    );
    expect(db.inseridos[0]).toMatchObject({ owner_user_id: OUTRO });
  });

  it("viewer não pode criar tarefa", async () => {
    sessao("viewer");
    makeDb({ lead: { id: LEAD, organization_id: ORG, owner_user_id: null, contact_id: null } });
    const { POST } = await import("./route");
    const res = await POST(reqPost({ title: "x", due_at: "2026-03-01T10:00:00Z" }), ctx);
    expect(res.status).toBe(403);
  });
});
