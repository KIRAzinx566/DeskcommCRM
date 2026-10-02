/**
 * CANAL DIRETO DO DONO — RLS (migration 0507).
 *
 * ## Os dois eixos medidos aqui
 *
 *   1. `canal_direto_mensagens` — a transcrição dono↔IA. Leitura só `admin`
 *      da própria organização (mais restrito que o histórico de aviso, que é
 *      `manager`: aqui é a correção viva de um agente em produção). Escrita
 *      nenhuma para `authenticated` — só `service_role` (o ingestor e o
 *      worker), nunca uma rota autenticada.
 *   2. **O conserto de segurança**: `org_memory_entries`/`org_memory_pointers`/
 *      `org_memory_versions` nunca tiveram `enable row level security` nem
 *      `revoke` — o mesmo padrão do incidente do `api_audit_log` (migration
 *      0267). Antes desta migration, `anon`/`authenticated` tinham GRANT ALL
 *      por `ALTER DEFAULT PRIVILEGES` do baseline, sem RLS para filtrar — ou
 *      seja, qualquer um com a `anon key` pública lia/escrevia/apagava a
 *      memória de IA de QUALQUER organização via PostgREST direto. Aqui se
 *      prova que `anon` e `authenticated` não têm NENHUM privilégio de
 *      tabela nas três (não é "RLS filtra", é "a porta não existe") — mesmo
 *      padrão do `has_function_privilege` que `aviso-de-caso-escrita.test.ts`
 *      já usa para funções.
 *
 * ## Sabotagens previstas
 *
 *   · remover a policy `leitura_canal_direto_mensagens` → o CONTROLE POSITIVO
 *     do admin vermelho, os demais (que já esperavam 0) continuam verdes —
 *     prova que o caso certo mede a policy, não tabela vazia;
 *   · `grant select on org_memory_entries to anon` → só o caso de
 *     `has_table_privilege('anon', ...)` vermelho.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { motivoDoErro, sql } from "./psql-transporte";

const ORG_A = "05070000-0000-4000-8000-000000000001";
const ORG_B = "05070000-0000-4000-8000-000000000002";
const ADMIN_A = "05070000-1111-4000-8000-000000000001";
const GESTOR_A = "05070000-1111-4000-8000-000000000002";
const LEITOR_A = "05070000-1111-4000-8000-000000000003";
const ADMIN_B = "05070000-1111-4000-8000-000000000004";
const SESSAO_A = "05070000-2222-4000-8000-000000000001";
const AGENTE_A = "05070000-3333-4000-8000-000000000001";
const MSG_A = "05070000-4444-4000-8000-000000000001";

function comoMembro(userId: string): string {
  return `set role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${userId}"}', false);`;
}

function contaComoMembro(userId: string, consulta: string): number {
  const saida = sql(`${comoMembro(userId)}\n${consulta};`).trim();
  const ultima = saida.split("\n").at(-1) ?? "";
  if (!/^\d+$/.test(ultima)) throw new Error(`saída inesperada do psql: ${saida}`);
  return Number(ultima);
}

function valor(consulta: string): string {
  return (sql(consulta).trim().split("\n").at(-1) ?? "").trim();
}

function booleano(consulta: string): boolean {
  const cru = valor(consulta);
  if (cru === "t" || cru === "true") return true;
  if (cru === "f" || cru === "false") return false;
  throw new Error(`INSTRUMENTO: o psql não devolveu um booleano: ${JSON.stringify(cru)}`);
}

const MENSAGENS_VISIVEIS = "select count(*) from public.canal_direto_mensagens";

beforeAll(() => {
  sql(`
    insert into auth.users (id, email) values
      ('${ADMIN_A}',  'canal-direto-0507-admin-a@invariant.test'),
      ('${GESTOR_A}', 'canal-direto-0507-gestor-a@invariant.test'),
      ('${LEITOR_A}', 'canal-direto-0507-viewer-a@invariant.test'),
      ('${ADMIN_B}',  'canal-direto-0507-admin-b@invariant.test')
      on conflict do nothing;

    insert into public.organizations (id, slug, legal_name, display_name) values
      ('${ORG_A}', 'canal-direto-0507-a', 'Canal Direto 0507 A', 'Canal Direto 0507 A'),
      ('${ORG_B}', 'canal-direto-0507-b', 'Canal Direto 0507 B', 'Canal Direto 0507 B')
      on conflict do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${ADMIN_A}',  '${ORG_A}', 'admin',   now()),
      ('${GESTOR_A}', '${ORG_A}', 'manager', now()),
      ('${LEITOR_A}', '${ORG_A}', 'viewer',  now()),
      ('${ADMIN_B}',  '${ORG_B}', 'admin',   now())
      on conflict do nothing;

    do $seed$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO_A}', '${ORG_A}', 'canal-direto-0507-a', '\\x00'::bytea);
    exception when unique_violation then null; end $seed$;

    insert into public.ai_agents (id, organization_id, name, system_prompt)
      values ('${AGENTE_A}', '${ORG_A}', 'Agente 0507', 'Prompt de teste.')
      on conflict do nothing;

    insert into public.canal_direto_mensagens
        (id, organization_id, agent_id, channel_session_id, autor, corpo)
      values ('${MSG_A}', '${ORG_A}', '${AGENTE_A}', '${SESSAO_A}', 'dono', 'Pare de oferecer desconto.')
      on conflict do nothing;
  `);
});

describe("0507 — canal_direto_mensagens: leitura só admin, por organização", () => {
  it("CONTROLE POSITIVO: o admin de A lê a própria transcrição", () => {
    expect(contaComoMembro(ADMIN_A, MENSAGENS_VISIVEIS)).toBe(1);
  });

  it("o admin do VIZINHO não lê a transcrição de A", () => {
    expect(contaComoMembro(ADMIN_B, MENSAGENS_VISIVEIS)).toBe(0);
  });

  it("`manager` e `viewer` da MESMA organização não leem — é mais restrito que o histórico de aviso", () => {
    expect(contaComoMembro(GESTOR_A, MENSAGENS_VISIVEIS)).toBe(0);
    expect(contaComoMembro(LEITOR_A, MENSAGENS_VISIVEIS)).toBe(0);
  });
});

describe("0507 — canal_direto_mensagens: `authenticated` não escreve, em papel nenhum", () => {
  const escritas: Array<[string, string]> = [
    [
      "insert",
      `insert into public.canal_direto_mensagens (organization_id, autor, corpo) values ('${ORG_A}', 'dono', 'x')`,
    ],
    [
      "update",
      `update public.canal_direto_mensagens set corpo = 'x' where organization_id = '${ORG_A}'`,
    ],
    [
      "delete",
      `delete from public.canal_direto_mensagens where organization_id = '${ORG_A}'`,
    ],
  ];

  for (const [nome, comando] of escritas) {
    it(`${nome} é recusado até para o admin`, () => {
      let erro = "";
      try {
        sql(`${comoMembro(ADMIN_A)}\n${comando};`);
      } catch (e) {
        erro = motivoDoErro(e);
      }
      expect(erro, `${nome} passou — a tabela ganhou uma porta de escrita`).not.toBe("");
      expect(erro).toMatch(/permission denied|row-level security|violates/i);
    });
  }
});

describe("0507 — CONSERTO DE SEGURANÇA: org_memory_entries/pointers/versions não têm porta para anon/authenticated", () => {
  const TABELAS = ["org_memory_entries", "org_memory_pointers", "org_memory_versions"];
  const PAPEIS = ["anon", "authenticated"] as const;
  const VERBOS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;

  for (const tabela of TABELAS) {
    for (const papel of PAPEIS) {
      for (const verbo of VERBOS) {
        // `authenticated` É dono de SELECT (ver o describe seguinte, via RLS) —
        // aqui a pergunta é sobre o GRANT de tabela puro, sem papel assumido.
        if (papel === "authenticated" && verbo === "SELECT") continue;
        it(`${papel} não tem ${verbo} em ${tabela}`, () => {
          expect(
            booleano(
              `select has_table_privilege('${papel}', 'public.${tabela}', '${verbo}')::text`,
            ),
            `${tabela} nasceu exposta a ${papel} para ${verbo} — a mesma classe do incidente do api_audit_log`,
          ).toBe(false);
        });
      }
    }
    it(`anon não tem SELECT em ${tabela}`, () => {
      expect(
        booleano(`select has_table_privilege('anon', 'public.${tabela}', 'SELECT')::text`),
        `${tabela} está exposta a anon — qualquer um com a anon key pública lê a memória de IA de qualquer organização`,
      ).toBe(false);
    });
  }
});

describe("0507 — org_memory_entries: a RLS isola por organização (authenticated TEM select, mas só o seu)", () => {
  const ENTRY_A = "05070000-5555-4000-8000-000000000001";

  beforeAll(() => {
    sql(`
      insert into public.org_memory_entries (id, organization_id, title, body, source, status, agent_id)
        values ('${ENTRY_A}', '${ORG_A}', 'Teste', 'Corpo de teste.', 'manual', 'active', null)
        on conflict do nothing;
    `);
  });

  it("CONTROLE POSITIVO: manager de A (acima do piso 'agent') lê a entry de A", () => {
    expect(
      contaComoMembro(GESTOR_A, `select count(*) from public.org_memory_entries where id = '${ENTRY_A}'`),
    ).toBe(1);
  });

  it("`viewer` (abaixo do piso 'agent') não lê — mesmo piso da rota GET /api/v1/ai/memory", () => {
    expect(
      contaComoMembro(LEITOR_A, `select count(*) from public.org_memory_entries where id = '${ENTRY_A}'`),
    ).toBe(0);
  });

  it("o admin do VIZINHO não lê a entry de A", () => {
    expect(
      contaComoMembro(ADMIN_B, `select count(*) from public.org_memory_entries where id = '${ENTRY_A}'`),
    ).toBe(0);
  });
});
