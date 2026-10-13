import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { carregarPainel } from "@/lib/orquestra/painel";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ sessao: true })) }));
vi.mock("@/lib/orquestra/painel", async (original) => ({
  ...(await original<typeof import("@/lib/orquestra/painel")>()),
  carregarPainel: vi.fn(async () => ({ ok: "painel" })),
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";

function comPapel(role: "viewer" | "manager" | "admin") {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG_ID, role },
  } as never);
}

async function pedir(qs = "") {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/orquestra/painel${qs}`));
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/orquestra/painel", () => {
  it("viewer lê, pela sessão, a organização da sessão — sem a auditoria", async () => {
    comPapel("viewer");
    const res = await pedir("?periodo=hoje");
    expect(res.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith("viewer", expect.anything());
    expect(carregarPainel).toHaveBeenCalledWith({ sessao: true }, { orgId: ORG_ID, periodo: "hoje", podeVerAuditoria: false });
  });

  it("quem administra recebe também o diário da auditoria", async () => {
    comPapel("admin");
    await pedir();
    expect(carregarPainel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ periodo: "mes", podeVerAuditoria: true }));
  });

  it("manager não é admin: sem auditoria (a policy de api_audit_log não entregaria)", async () => {
    comPapel("manager");
    await pedir();
    expect(carregarPainel).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ podeVerAuditoria: false }));
  });

  it("período fora da lista é recusado", async () => {
    comPapel("viewer");
    expect((await pedir("?periodo=ano")).status).toBe(422);
    expect(carregarPainel).not.toHaveBeenCalled();
  });
});
