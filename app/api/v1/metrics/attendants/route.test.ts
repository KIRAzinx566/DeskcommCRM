/**
 * GET /api/v1/metrics/attendants — cobre o enriquecimento novo (carga atual +
 * capacidade), que reaproveita `carregarRosterDeAtendimento`
 * (lib/escalacao/atendentes.ts) — a MESMA função que `/api/v1/attendants/
 * availability` já usa para o painel de Equipe. Mockada aqui de propósito: a
 * contagem em si já tem rede própria em `attendants-availability-route.test.ts`;
 * o que este arquivo prova é que a ROTA junta o roster certo aos user_ids que a
 * RPC devolveu, e degrada sem service role.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { isServiceRoleConfigured } from "@/lib/audit";
import { carregarRosterDeAtendimento } from "@/lib/escalacao/atendentes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK, type AuthUser, type Role } from "@/lib/auth/types";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({
  isServiceRoleConfigured: vi.fn(() => true),
  audit: vi.fn(async () => undefined),
}));
vi.mock("@/lib/escalacao/atendentes", () => ({ carregarRosterDeAtendimento: vi.fn() }));

const ORG = "22222222-2222-4222-8222-222222222222";
const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "99999999-9999-4999-8999-999999999999";

function sessao(papel: Role) {
  const user: AuthUser = {
    id: ANA,
    email: "ana@example.com",
    full_name: "Ana",
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

function fazerSessionClient(attendants: Array<Record<string, unknown>>) {
  return {
    rpc: async () => ({ data: { funnel: [], attendants }, error: null }),
  };
}

function fazerAdmin() {
  return {
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({
            data: { user: { id, email: `${id.slice(0, 4)}@example.com`, user_metadata: {} } },
          }),
      },
    },
  };
}

async function chamar() {
  const { GET } = await import("./route");
  return GET(new NextRequest("http://localhost/api/v1/metrics/attendants"));
}

describe("GET /api/v1/metrics/attendants — carga atual + capacidade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("junta o roster (mesma função da tela de Equipe) aos user_ids da RPC", async () => {
    sessao("manager");
    vi.mocked(isServiceRoleConfigured).mockReturnValue(true);
    vi.mocked(createClient).mockResolvedValue(
      fazerSessionClient([
        { user_id: ANA, won: 1, lost: 0, conversations_handled: 3, avg_first_response_seconds: 30 },
        { user_id: BRUNO, won: 0, lost: 1, conversations_handled: 1, avg_first_response_seconds: null },
      ]) as unknown as Awaited<ReturnType<typeof createClient>>,
    );
    vi.mocked(createAdminClient).mockReturnValue(
      fazerAdmin() as unknown as ReturnType<typeof createAdminClient>,
    );
    vi.mocked(carregarRosterDeAtendimento).mockResolvedValue([
      {
        userId: ANA,
        papel: "agent",
        disponivel: true,
        capacidade: 5,
        agenda: {},
        ultimoSinalDeVida: null,
        atualizadoEm: null,
        cargaAtual: 2,
      },
      {
        userId: BRUNO,
        papel: "manager",
        disponivel: false,
        capacidade: null,
        agenda: {},
        ultimoSinalDeVida: null,
        atualizadoEm: null,
        cargaAtual: 0,
      },
    ]);

    const body = (await (await chamar()).json()) as {
      data: { attendants: Array<{ user_id: string; current_load: number; capacity: number | null }> };
    };

    const ana = body.data.attendants.find((a) => a.user_id === ANA);
    const bruno = body.data.attendants.find((a) => a.user_id === BRUNO);
    expect(ana).toMatchObject({ current_load: 2, capacity: 5 });
    // Nunca configurou disponibilidade: capacidade null, não zero — mesma
    // distinção que a tela de Equipe já faz.
    expect(bruno).toMatchObject({ current_load: 0, capacity: null });
  });

  it("sem service role, degrada current_load/capacity em vez de estourar", async () => {
    sessao("agent");
    vi.mocked(isServiceRoleConfigured).mockReturnValue(false);
    vi.mocked(createClient).mockResolvedValue(
      fazerSessionClient([
        { user_id: ANA, won: 0, lost: 0, conversations_handled: 0, avg_first_response_seconds: null },
      ]) as unknown as Awaited<ReturnType<typeof createClient>>,
    );

    const body = (await (await chamar()).json()) as {
      data: { attendants: Array<{ current_load: number; capacity: number | null; name: string | null }> };
    };
    expect(body.data.attendants[0]).toMatchObject({
      current_load: 0,
      capacity: null,
      name: null,
    });
    expect(carregarRosterDeAtendimento).not.toHaveBeenCalled();
  });
});
