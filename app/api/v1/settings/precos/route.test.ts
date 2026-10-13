import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";

/** O formato que a rota devolve — só o que estes testes leem. */
interface Regua {
  tabela: { validade: string; conferida_em: string | null; situacao: string };
  parcelamento: { debito: number | null; credito: Record<string, number>; texto: string };
}
interface Corpo {
  data?: Regua;
  error?: { code: string; details?: { linhas?: string[] } };
}

function montarMundo(settings: Record<string, unknown> = {}) {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER_ID, idioma: "pt-BR" },
    org: { orgId: ORG_ID },
  } as never);

  let gravado: Record<string, unknown> | null = null;
  const idsFiltrados: unknown[] = [];
  const linha = () => ({ settings: gravado ?? settings, timezone: "America/Sao_Paulo" });
  const client = {
    from: (tabela: string) => {
      if (tabela !== "organizations") throw new Error(`tabela não mockada: ${tabela}`);
      return {
        select: () => ({
          eq: (_c: string, v: unknown) => {
            idsFiltrados.push(v);
            return {
              single: async () => ({ data: linha(), error: null }),
              maybeSingle: async () => ({ data: linha(), error: null }),
            };
          },
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, v: unknown) => {
            idsFiltrados.push(v);
            gravado = patch.settings as Record<string, unknown>;
            return { error: null };
          },
        }),
      };
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as never);
  vi.mocked(createAdminClient).mockReturnValue(client as never);

  return {
    get gravado() {
      return gravado;
    },
    idsFiltrados,
    async GET() {
      const { GET } = await import("./route");
      const res = await GET();
      return { status: res.status, body: (await res.json()) as Required<Pick<Corpo, "data">> };
    },
    async PATCH(corpo: unknown) {
      const { PATCH } = await import("./route");
      const res = await PATCH(
        new NextRequest("http://localhost/api/v1/settings/precos", { method: "PATCH", body: JSON.stringify(corpo) }),
      );
      return { status: res.status, body: (await res.json()) as Corpo };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T15:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/v1/settings/precos", () => {
  it("organização que nunca configurou: tudo desligado, sem taxas", async () => {
    const mundo = montarMundo();
    const { status, body } = await mundo.GET();
    expect(status).toBe(200);
    expect(body.data.tabela).toEqual({ validade: "desligada", conferida_em: null, situacao: "sem_validade" });
    expect(body.data.parcelamento).toMatchObject({ debito: null, credito: {}, texto: "" });
  });
});

describe("PATCH /api/v1/settings/precos", () => {
  it("cola a tabela de taxas e grava lida, sem apagar o resto de settings", async () => {
    const mundo = montarMundo({ proposals: { enabled: true } });
    const { status, body } = await mundo.PATCH({ taxas_texto: "Débito – 2,29%\n10x – 10,2%" });
    expect(status).toBe(200);
    expect(mundo.gravado).toMatchObject({
      proposals: { enabled: true },
      parcelamento: { debito: 2.29, credito: { "10": 10.2 } },
    });
    expect(body.data!.parcelamento.texto).toBe("Débito – 2,29%\n10x – 10,2%");
    expect(vi.mocked(audit).mock.calls.map(([a]) => a.action)).toEqual(["pricing.config_changed"]);
  });

  it("linha que não se lê recusa o salvar INTEIRO e devolve as linhas", async () => {
    const mundo = montarMundo();
    const { status, body } = await mundo.PATCH({ taxas_texto: "2x – 5%\n3x sem juros" });
    expect(status).toBe(422);
    expect(body.error?.details?.linhas).toEqual(["3x sem juros"]);
    expect(mundo.gravado).toBeNull();
  });

  it("conferir agora usa o relógio do SERVIDOR e audita a conferência", async () => {
    const mundo = montarMundo({ catalogo: { validade: "mesmo_dia", conferida_em: null } });
    const { body } = await mundo.PATCH({ conferir_agora: true });
    expect(body.data!.tabela).toMatchObject({
      conferida_em: "2026-10-07T15:00:00.000Z",
      situacao: "em_dia",
    });
    expect(vi.mocked(audit).mock.calls.map(([a]) => a.action)).toEqual(["pricing.table_confirmed"]);
  });

  it("não aceita o instante vindo do corpo", async () => {
    const mundo = montarMundo();
    const { status } = await mundo.PATCH({ conferida_em: "2030-01-01T00:00:00.000Z" });
    expect(status).toBe(422);
    expect(mundo.gravado).toBeNull();
  });

  it("corpo vazio é recusado", async () => {
    const mundo = montarMundo();
    expect((await mundo.PATCH({})).status).toBe(422);
  });

  it("grava na organização da SESSÃO", async () => {
    const mundo = montarMundo();
    await mundo.PATCH({ validade: "mesmo_dia" });
    expect(new Set(mundo.idsFiltrados)).toEqual(new Set([ORG_ID]));
  });

  it("quem não é gestor não muda (o gate de papel responde)", async () => {
    montarMundo();
    vi.mocked(requireRole).mockResolvedValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }),
    } as never);
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/v1/settings/precos", {
        method: "PATCH",
        body: JSON.stringify({ validade: "mesmo_dia" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(requireRole)).toHaveBeenCalledWith("manager", expect.anything());
  });
});
