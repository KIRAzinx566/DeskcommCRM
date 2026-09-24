import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apagarDoBucket } from "@/lib/catalogo/fotos-no-bucket";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/catalogo/fotos-no-bucket", () => ({ apagarDoBucket: vi.fn(async () => undefined) }));
// Este teste isola o handler; autoridade de suporte é exercitada na suíte própria.
vi.mock("@/lib/impersonate/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/impersonate/support")>()),
  requireSupportWrite: vi.fn(async () => null),
}));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PRODUTO_ID = "33333333-3333-4333-8333-333333333333";

/** O `organization_id` e o `id` que os dois `.eq()` receberam — o alvo do escopo. */
let orgIdLido: string | null = null;
let idLido: string | null = null;

function supabaseUpdate(resultado: { data: unknown; error: { code?: string } | null }) {
  return {
    from: () => ({
      update: () => ({
        eq: (coluna: string, valor: string) => {
          if (coluna === "organization_id") orgIdLido = valor;
          if (coluna === "id") idLido = valor;
          return {
            eq: (coluna2: string, valor2: string) => {
              if (coluna2 === "organization_id") orgIdLido = valor2;
              if (coluna2 === "id") idLido = valor2;
              return {
                select: () => ({
                  maybeSingle: async () => resultado,
                }),
              };
            },
          };
        },
      }),
    }),
  };
}

function supabaseDelete(resultado: { data: unknown; error: { code?: string } | null }) {
  return {
    from: () => ({
      delete: () => ({
        eq: (coluna: string, valor: string) => {
          if (coluna === "organization_id") orgIdLido = valor;
          if (coluna === "id") idLido = valor;
          return {
            eq: (coluna2: string, valor2: string) => {
              if (coluna2 === "organization_id") orgIdLido = valor2;
              if (coluna2 === "id") idLido = valor2;
              return {
                select: () => ({
                  maybeSingle: async () => resultado,
                }),
              };
            },
          };
        },
      }),
    }),
  };
}

function pedidoPatch(corpo: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/products/${PRODUTO_ID}`, {
    method: "PATCH",
    body: JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  });
}

function pedidoDelete(): NextRequest {
  return new NextRequest(`http://localhost/api/v1/products/${PRODUTO_ID}`, { method: "DELETE" });
}

const PARAMS = { params: Promise.resolve({ id: PRODUTO_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  orgIdLido = null;
  idLido = null;
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER_ID, idioma: "pt-BR" },
    org: { orgId: ORG_ID },
  } as never);
});

describe("PATCH /api/v1/products/[id]", () => {
  it("muda o que veio e devolve a linha, com o escopo da organização", async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseUpdate({ data: { id: PRODUTO_ID, nome: "iPhone 15 Pro" }, error: null }) as never,
    );
    const { PATCH } = await import("./route");

    const resposta = await PATCH(pedidoPatch({ nome: "iPhone 15 Pro" }), PARAMS);
    const json = (await resposta.json()) as { data: { nome: string } };

    expect(resposta.status).toBe(200);
    expect(json.data.nome).toBe("iPhone 15 Pro");
    expect(orgIdLido).toBe(ORG_ID);
    expect(idLido).toBe(PRODUTO_ID);
  });

  it("recusa dado que o schema não aceita", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseUpdate({ data: null, error: null }) as never);
    const { PATCH } = await import("./route");

    const resposta = await PATCH(pedidoPatch({ preco_cents: -100 }), PARAMS);

    expect(resposta.status).toBe(422);
  });

  it("devolve 404 quando a RLS barra ou o id não é desta organização — nunca 500", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseUpdate({ data: null, error: null }) as never);
    const { PATCH } = await import("./route");

    const resposta = await PATCH(pedidoPatch({ nome: "Outro nome" }), PARAMS);

    expect(resposta.status).toBe(404);
  });

  it("devolve 409 quando o código novo colide com outro produto da organização", async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseUpdate({ data: null, error: { code: "23505" } }) as never,
    );
    const { PATCH } = await import("./route");

    const resposta = await PATCH(pedidoPatch({ codigo: "JA-EXISTE" }), PARAMS);

    expect(resposta.status).toBe(409);
  });
});

describe("DELETE /api/v1/products/[id]", () => {
  it("apaga a linha, manda as fotos para fora do bucket e devolve o id, com o escopo da organização", async () => {
    vi.mocked(createClient).mockResolvedValue(
      supabaseDelete({ data: { id: PRODUTO_ID, fotos: ["a.jpg", "b.jpg"] }, error: null }) as never,
    );
    const { DELETE } = await import("./route");

    const resposta = await DELETE(pedidoDelete(), PARAMS);
    const json = (await resposta.json()) as { data: { id: string } };

    expect(resposta.status).toBe(200);
    expect(json.data.id).toBe(PRODUTO_ID);
    expect(orgIdLido).toBe(ORG_ID);
    expect(idLido).toBe(PRODUTO_ID);
    expect(apagarDoBucket).toHaveBeenCalledWith(ORG_ID, PRODUTO_ID, ["a.jpg", "b.jpg"], expect.any(String));
  });

  it("devolve 404 quando a RLS barra ou o id não é desta organização, e não chama o bucket", async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseDelete({ data: null, error: null }) as never);
    const { DELETE } = await import("./route");

    const resposta = await DELETE(pedidoDelete(), PARAMS);

    expect(resposta.status).toBe(404);
    expect(apagarDoBucket).not.toHaveBeenCalled();
  });
});
