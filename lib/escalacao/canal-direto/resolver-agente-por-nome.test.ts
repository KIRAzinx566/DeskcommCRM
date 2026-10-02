import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { listarAgentesDaOrganizacao, resolverAgentePorNome } from "./resolver-agente-por-nome";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function stubAgentes(agentes: Array<{ id: string; name: string }>): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            then: (resolve: (v: { data: typeof agentes; error: null }) => unknown) =>
              resolve({ data: agentes, error: null }),
            order: () => Promise.resolve({ data: agentes, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const CLINICA = { id: "a1", name: "Agente Clínica Bela Vista" };
const VENDAS = { id: "a2", name: "Vendas" };
const CLINICA_2 = { id: "a3", name: "Clínica Centro" };

describe("resolverAgentePorNome", () => {
  it("match exato (case/acento-insensitive)", async () => {
    const db = stubAgentes([CLINICA, VENDAS]);
    expect(await resolverAgentePorNome(db, ORG_ID, "vendas")).toEqual({ status: "unico", agente: VENDAS });
    expect(await resolverAgentePorNome(db, ORG_ID, "VENDAS")).toEqual({ status: "unico", agente: VENDAS });
  });

  it("sem exato, cai pra substring", async () => {
    const db = stubAgentes([CLINICA, VENDAS]);
    expect(await resolverAgentePorNome(db, ORG_ID, "clinica")).toEqual({ status: "unico", agente: CLINICA });
  });

  it("substring ambígua entre dois agentes", async () => {
    const db = stubAgentes([CLINICA, CLINICA_2]);
    const r = await resolverAgentePorNome(db, ORG_ID, "clinica");
    expect(r.status).toBe("ambiguo");
    if (r.status === "ambiguo") {
      expect(r.candidatos).toEqual(expect.arrayContaining([CLINICA, CLINICA_2]));
    }
  });

  it("nome que não bate em nenhum agente", async () => {
    const db = stubAgentes([CLINICA, VENDAS]);
    expect(await resolverAgentePorNome(db, ORG_ID, "suporte")).toEqual({ status: "nenhum" });
  });

  it("organização sem agentes", async () => {
    const db = stubAgentes([]);
    expect(await resolverAgentePorNome(db, ORG_ID, "qualquer")).toEqual({ status: "nenhum" });
  });
});

describe("listarAgentesDaOrganizacao", () => {
  it("devolve os nomes reais, nunca inventados", async () => {
    const db = stubAgentes([VENDAS, CLINICA]);
    expect(await listarAgentesDaOrganizacao(db, ORG_ID)).toEqual([VENDAS, CLINICA]);
  });
});
