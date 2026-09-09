import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `loadAuthUser` decide o que fazer com quem chega com ZERO organização.
 *
 * O defeito medido em produção (2026-09-05, cliente real "Plata Iphones"):
 * com "Confirm email" desligado no provedor de auth, `signUp()` deixa a
 * pessoa logar direto, sem NUNCA passar por `/auth/confirm` — que é onde
 * `ensureTenantForUser` normalmente roda. Ela fica presa para sempre vendo
 * "você não tem organização ativa", sem ação nenhuma que resolva.
 *
 * `app/app/layout.tsx` é a rede de segurança: ele provisiona quando
 * `sem_organizacao_decisao` diz `"provisionar"`. Este arquivo trava a
 * DECISÃO — a parte que não pode errar, porque errar na direção contrária
 * (provisionar quem foi CONVIDADO) dá a essa pessoa uma organização fantasma
 * em vez de colocá-la na organização certa.
 */

const consultas: { platformAdmins: unknown; memberships: unknown } = {
  platformAdmins: { data: null, error: null },
  memberships: { data: [], error: null },
};

let usuarioAtual: { id: string; email: string; user_metadata: Record<string, unknown> } = {
  id: "u1",
  email: "fabio@example.com",
  user_metadata: {},
};

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
}));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: usuarioAtual }, error: null }),
    },
    // `loadAuthUser` agora resolve `support` via `readSupportContext`, que chama
    // esta RPC direto (não passa por `.from()`). Ninguém neste arquivo testa
    // acompanhamento administrativo — o padrão é "não está sendo acompanhado".
    rpc: async () => ({ data: null, error: null }),
    from: (tabela: string) => {
      const alvo = tabela === "platform_admins" ? "platformAdmins" : "memberships";
      const resultado = () => consultas[alvo as keyof typeof consultas];
      const chain = {
        select: () => chain,
        eq: () => chain,
        is: () =>
          alvo === "platformAdmins"
            ? { maybeSingle: async () => resultado() }
            : { ...chain, then: chain.then },
        order: () => ({ ...chain, then: chain.then }),
        maybeSingle: async () => resultado(),
        then: (r: (v: unknown) => unknown) => Promise.resolve(resultado()).then(r),
      };
      return chain;
    },
  }),
}));

const { loadAuthUser } = await import("@/lib/auth/server");
const { signInviteToken } = await import("@/lib/auth/invite-token");

beforeEach(() => {
  consultas.platformAdmins = { data: null, error: null };
  consultas.memberships = { data: [], error: null };
  usuarioAtual = { id: "u1", email: "fabio@example.com", user_metadata: {} };
});

describe("loadAuthUser — decisão pra quem tem zero organização", () => {
  it("signup comum sem convite: decide 'provisionar' e carrega o org_name digitado", async () => {
    usuarioAtual.user_metadata = { org_name: "Plata Iphones" };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBe("provisionar");
    expect(u?.sem_organizacao_org_name).toBe("Plata Iphones");
  });

  it("convite válido pro MESMO e-mail: decide 'convite', nunca provisiona sozinho", async () => {
    const token = signInviteToken({
      invite_id: "00000000-0000-4000-8000-000000000001",
      email: usuarioAtual.email,
      organization_id: "00000000-0000-4000-8000-000000000002",
      role: "agent",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    usuarioAtual.user_metadata = { invite_token: token };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBe("convite");
  });

  it("convite pra e-mail DIFERENTE (token de outra pessoa): recusa, nunca provisiona", async () => {
    const token = signInviteToken({
      invite_id: "00000000-0000-4000-8000-000000000001",
      email: "outra-pessoa@example.com",
      organization_id: "00000000-0000-4000-8000-000000000002",
      role: "agent",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    usuarioAtual.user_metadata = { invite_token: token };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBe("recusar");
  });

  it("convite expirado: recusa, nunca provisiona", async () => {
    const token = signInviteToken({
      invite_id: "00000000-0000-4000-8000-000000000001",
      email: usuarioAtual.email,
      organization_id: "00000000-0000-4000-8000-000000000002",
      role: "agent",
      exp: Math.floor(Date.now() / 1000) - 3600,
    });
    usuarioAtual.user_metadata = { invite_token: token };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBe("recusar");
  });

  it("conta sem invite_token E sem org_name: NÃO provisiona — ausência de sinal não é sinal de self-signup", async () => {
    // O caso achado ao vivo pelo e2e de convite: uma conta criada fora do
    // formulário de signup (seed de teste, criação direta por admin API) não
    // tem `invite_token` (decidirConviteDoSignup sozinha diria "provisionar")
    // MAS também não tem `org_name` — o sinal que só o formulário de
    // self-signup grava (`signupSchema`, campo obrigatório). Sem os dois,
    // não há prova de que a pessoa pediu uma empresa própria; abrir uma
    // fantasma seria pior do que não decidir nada.
    usuarioAtual.user_metadata = {};
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBeUndefined();
    expect(u?.sem_organizacao_org_name).toBeUndefined();
  });

  it("org_name em branco/só espaço conta como ausente — mesma recusa de provisionar", async () => {
    usuarioAtual.user_metadata = { org_name: "   " };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBeUndefined();
  });

  it("quem já tem organização não calcula nada disso (custo zero pro caso comum)", async () => {
    consultas.memberships = {
      data: [{ organization_id: "o1", role: "admin", organizations: { display_name: "Acme" } }],
      error: null,
    };
    const u = await loadAuthUser();
    expect(u?.sem_organizacao_decisao).toBeUndefined();
    expect(u?.sem_organizacao_org_name).toBeUndefined();
  });
});
