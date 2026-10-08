import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const SESSAO = "66666666-6666-4666-8666-666666666666";
const CONTA = "55555555-5555-4555-8555-555555555555";
const GRUPO = "120363000000000000@g.us";

const estado = {
  grupo: { id: "g1", enabled: true } as { id: string; enabled: boolean } | null,
  conta: { id: CONTA } as { id: string } | null,
  update: null as Record<string, unknown> | null,
  filtros: [] as Array<[string, string, unknown]>,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          estado.filtros.push([tabela, c, v]);
          return q;
        },
        maybeSingle: async () => ({
          data: tabela === "channel_session_groups" ? estado.grupo : estado.conta,
          error: null,
        }),
        update: (u: Record<string, unknown>) => {
          estado.update = u;
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
      };
      return q;
    },
  }),
}));

async function patch(corpo: unknown) {
  const { PATCH } = await import("./route");
  return PATCH(
    new NextRequest(`http://localhost/api/v1/channel-sessions/${SESSAO}/groups/caixa`, {
      method: "PATCH",
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ id: SESSAO }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  estado.grupo = { id: "g1", enabled: true };
  estado.conta = { id: CONTA };
  estado.update = null;
  estado.filtros = [];
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG, role: "manager" },
  } as never);
});

describe("PATCH /api/v1/channel-sessions/[id]/groups/caixa", () => {
  it("marca o grupo ligado como grupo de vendas, com a conta, e audita", async () => {
    const res = await patch({ group_chat_id: GRUPO, lanca_no_caixa: true, conta_do_caixa_id: CONTA });
    expect(res.status).toBe(200);
    expect(estado.update).toEqual({ lanca_no_caixa: true, conta_do_caixa_id: CONTA });
    expect(vi.mocked(audit)).toHaveBeenCalledWith(expect.objectContaining({ action: "financeiro.grupo_de_vendas_configurado" }));
    expect(requireRole).toHaveBeenCalledWith("manager", expect.anything());
  });

  it("ligar sem conta é recusado", async () => {
    expect((await patch({ group_chat_id: GRUPO, lanca_no_caixa: true })).status).toBe(422);
    expect(estado.update).toBeNull();
  });

  it("conta que não é desta organização (ou está inativa) é recusada", async () => {
    estado.conta = null;
    expect((await patch({ group_chat_id: GRUPO, lanca_no_caixa: true, conta_do_caixa_id: CONTA })).status).toBe(422);
    expect(estado.filtros).toContainEqual(["financial_accounts", "organization_id", ORG]);
    expect(estado.update).toBeNull();
  });

  it("grupo desligado não vira grupo de vendas", async () => {
    estado.grupo = { id: "g1", enabled: false };
    expect((await patch({ group_chat_id: GRUPO, lanca_no_caixa: true, conta_do_caixa_id: CONTA })).status).toBe(409);
  });

  it("desmarcar limpa a conta", async () => {
    await patch({ group_chat_id: GRUPO, lanca_no_caixa: false });
    expect(estado.update).toEqual({ lanca_no_caixa: false, conta_do_caixa_id: null });
  });
});
