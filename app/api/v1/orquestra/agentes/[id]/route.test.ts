import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireRole } from "@/lib/auth/require-role";
import { carregarMesa } from "@/lib/orquestra/agente";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ sessao: true })) }));
vi.mock("@/lib/orquestra/agente", () => ({ carregarMesa: vi.fn(async () => ({ conversas: [], pedidosDeAjuda: [] })) }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const AGENTE_ID = "33333333-3333-4333-8333-333333333333";

function comPapel() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG_ID, role: "agent" },
  } as never);
}

async function pedir(id: string) {
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/v1/orquestra/agentes/${id}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/orquestra/agentes/:id", () => {
  it("quem atende lê, pela sessão, a mesa do agente na organização da sessão", async () => {
    comPapel();
    const res = await pedir(AGENTE_ID);
    expect(res.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith("agent", expect.anything());
    expect(carregarMesa).toHaveBeenCalledWith({ sessao: true }, { orgId: ORG_ID, agenteId: AGENTE_ID });
  });

  it("id que não é uuid nem chega ao banco", async () => {
    comPapel();
    expect((await pedir("nao-e-uuid")).status).toBe(400);
    expect(carregarMesa).not.toHaveBeenCalled();
  });

  it("falha da leitura vira 500 com motivo, nunca uma mesa vazia", async () => {
    comPapel();
    vi.mocked(carregarMesa).mockRejectedValueOnce(new Error("boom"));
    expect((await pedir(AGENTE_ID)).status).toBe(500);
  });
});
