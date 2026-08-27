import { describe, expect, it } from "vitest";

import { countAs, sql, writeCountAs } from "./gov-helpers";

/**
 * O que a migration 0167 promete, cobrado no banco que o CLONE recebe (mesmo
 * motivo/formato de meta-templates-rls.test.ts): lê o Postgres descartável do
 * `supabase/baseline.sql`, não o banco de dev.
 *
 * O que está sob prova:
 *
 *  1. **Isolamento nas duas direções.** `crm_meetings` guarda horário e conteúdo
 *     de reunião de um tenant — vazamento aqui é vazamento de agenda comercial.
 *     O `with check` (org B escrevendo COM o `organization_id` da org A) é o
 *     lado que uma policy só com `using` deixaria passar.
 *
 *  2. **`ends_at > starts_at` é CHECK, não validação de aplicação.** Um dado
 *     inconsistente aqui quebraria qualquer leitura futura que assuma a ordem
 *     (ex.: calcular duração) — a trava vive no banco porque `crm_meetings` é
 *     escrita por dois caminhos (rota REST humana e tool do agente) e a regra
 *     não pode valer só onde alguém lembrou de checar.
 *
 *  3. **`lead_id` nulo é aceito.** Reunião sem negócio aberto resolvido
 *     (0167 §"por que lead_id é opcional") não é erro — é o desenho.
 */

const CM_ORG_A = "0167aaaa-0000-4000-8000-000000000001";
const CM_ORG_B = "0167bbbb-0000-4000-8000-000000000002";
const CM_MEMBER_A = "0167aaaa-1111-4000-8000-000000000001";
const CM_MEMBER_B = "0167bbbb-1111-4000-8000-000000000002";
const CM_CONTACT_A = "0167aaaa-2222-4000-8000-000000000001";
const CM_CONTACT_B = "0167bbbb-2222-4000-8000-000000000002";

function seed(): void {
  sql(`
    insert into auth.users (id, email) values
      ('${CM_MEMBER_A}', 'cm-member-a@invariant.test'),
      ('${CM_MEMBER_B}', 'cm-member-b@invariant.test')
      on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${CM_ORG_A}', 'cm-inv-a', 'CRM Meetings Inv A', 'CM Inv A'),
      ('${CM_ORG_B}', 'cm-inv-b', 'CRM Meetings Inv B', 'CM Inv B')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${CM_MEMBER_A}', '${CM_ORG_A}', 'manager', now()),
      ('${CM_MEMBER_B}', '${CM_ORG_B}', 'manager', now())
      on conflict do nothing;
    insert into public.contacts (id, organization_id, display_name) values
      ('${CM_CONTACT_A}', '${CM_ORG_A}', 'CM Invariant Contact A'),
      ('${CM_CONTACT_B}', '${CM_ORG_B}', 'CM Invariant Contact B')
      on conflict do nothing;
  `);
}

function values(org: string, contact: string, startsAt = "2026-09-01T14:00:00Z"): string {
  return `('${org}', '${contact}', '${startsAt}')`;
}
const COLS = "(organization_id, contact_id, starts_at)";

function erroDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; message?: string };
    return String(err.stderr ?? "") + String(err.message ?? "");
  }
  throw new Error("o INSERT passou — a trava não existe neste banco");
}

describe("0167 · agenda de reuniões chega ao clone com RLS", () => {
  it("a tabela nasce com RLS ligada e o par SELECT/write com papel", () => {
    seed();
    expect(sql(`select relrowsecurity from pg_class where relname = 'crm_meetings'`)).toBe("t");
    // Migration 0168: a policy ALL só-tenancy original (`tenant_isolation_
    // crm_meetings_all`) virou o par que `tests/invariants/rbac-config-ia-
    // canais.test.ts` exige de toda tabela nova — SELECT só-tenancy +
    // escrita com `fn_role_at_least`, mesmo piso 'agent' que a rota já aplica.
    expect(
      sql(`select policyname from pg_policies
            where schemaname = 'public' and tablename = 'crm_meetings' order by 1`),
    ).toBe("crm_meetings_tenant_select\ncrm_meetings_tenant_write");
  });

  it("membro da org A marca reunião na própria org e lê de volta", () => {
    expect(
      writeCountAs(CM_MEMBER_A, `insert into public.crm_meetings ${COLS} values ${values(CM_ORG_A, CM_CONTACT_A)}`),
    ).toBe(1);
    expect(
      countAs(CM_MEMBER_A, `select count(*) from public.crm_meetings where organization_id = '${CM_ORG_A}';`),
    ).toBe(1);
  });

  it("membro da org B NÃO vê a reunião da org A", () => {
    expect(
      countAs(CM_MEMBER_B, `select count(*) from public.crm_meetings where organization_id = '${CM_ORG_A}';`),
    ).toBe(0);
  });

  it("membro da org B NÃO escreve COM o organization_id da org A (o lado `with check`)", () => {
    expect(
      writeCountAs(
        CM_MEMBER_B,
        `insert into public.crm_meetings ${COLS} values ${values(CM_ORG_A, CM_CONTACT_A, "2026-09-02T10:00:00Z")}`,
      ),
    ).toBe(0);
    expect(
      sql(`select count(*) from public.crm_meetings where organization_id = '${CM_ORG_A}' and starts_at = '2026-09-02T10:00:00Z'`),
    ).toBe("0");
  });

  it("lead_id nulo é aceito — reunião sem negócio resolvido não é erro", () => {
    sql(
      `insert into public.crm_meetings ${COLS} values ${values(CM_ORG_A, CM_CONTACT_A, "2026-09-03T10:00:00Z")};`,
    );
    expect(
      sql(`select lead_id is null from public.crm_meetings where organization_id = '${CM_ORG_A}' and starts_at = '2026-09-03T10:00:00Z'`),
    ).toBe("t");
  });

  it("ends_at <= starts_at é rejeitado pelo CHECK — a ordem não depende de quem escreve", () => {
    const erro = erroDe(() =>
      sql(`
        insert into public.crm_meetings (organization_id, contact_id, starts_at, ends_at)
        values ('${CM_ORG_A}', '${CM_CONTACT_A}', '2026-09-04T14:00:00Z', '2026-09-04T13:00:00Z');
      `),
    );
    expect(erro).toContain("crm_meetings_ends_after_starts");
  });
});
