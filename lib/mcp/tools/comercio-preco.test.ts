import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { crmSearchProducts } from "./comercio";
import type { McpContext } from "../types";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

/**
 * A RÉGUA DE PREÇO DA LOJA nas duas ferramentas que falam de dinheiro com o
 * cliente: a busca de produtos (tabela do dia) e a simulação de parcelas (taxas
 * do cartão). A regra pura está testada em `lib/catalogo/tabela-do-dia.test.ts`
 * e `lib/financeiro/parcelamento.test.ts`; aqui se mede o que o AGENTE recebe.
 */

const ORG = "22222222-2222-4222-8222-222222222222";

const IPHONE = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "IP15",
  nome: "iPhone 15",
  descricao: null,
  marca: "Apple",
  categoria: null,
  preco_cents: 500_000,
  moeda: "BRL",
  controla_estoque: false,
  quantidade: 0,
  ativo: true,
  fotos: null,
};

const TAXAS = { debito: 2.29, credito: { "1": 4.29, "10": 10.2 }, sem_acrescimo_ate: 0 };

/** Um ctx cujo banco responde por tabela, e registra os filtros de cada consulta. */
function ctxCom(organizacao: Record<string, unknown> | null, produtos = [IPHONE]) {
  const filtros: Array<[string, string, unknown]> = [];
  const supabase = {
    from: (tabela: string) => {
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          filtros.push([tabela, col, val]);
          return q;
        },
        order: () => q,
        range: async () => ({ data: produtos, error: null, count: produtos.length }),
        maybeSingle: async () => {
          if (tabela === "organizations") return { data: organizacao, error: null };
          const codigo = filtros.filter(([t, c]) => t === tabela && c === "codigo").at(-1)?.[2];
          return { data: produtos.find((p) => p.codigo === codigo) ?? null, error: null };
        },
      };
      return q;
    },
  };
  const ctx = {
    organizationId: ORG,
    role: "agent",
    actor: { type: "ai_agent", id: "run-1", agent_id: "agent-1" },
    apiTokenId: "33333333-3333-4333-8333-333333333333",
    requestId: "44444444-4444-4444-8444-444444444444",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
  } as McpContext;
  return { ctx, filtros };
}

const semNbsp = (s: string) => s.replace(/[  ]/g, " ");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T15:00:00.000Z")); // 12h em São Paulo
});
afterEach(() => {
  vi.useRealTimers();
});

describe("crm_search_products — a tabela do dia", () => {
  const buscar = (ctx: McpContext) =>
    crmSearchProducts.handler({ termo: "iphone", limite: 8, somente_disponiveis: true }, ctx) as Promise<{
      produtos: Array<Record<string, unknown>>;
      tabela_vencida?: boolean;
      mensagem?: string;
    }>;

  it("validade desligada (o padrão): o preço sai como sempre saiu", async () => {
    const { ctx } = ctxCom({ settings: {}, timezone: "America/Sao_Paulo", currency: "BRL" });
    const r = await buscar(ctx);
    expect(r.produtos[0]).toHaveProperty("preco_cents", 500_000);
    expect(r.tabela_vencida).toBeUndefined();
  });

  it("conferida hoje: o preço sai", async () => {
    const { ctx } = ctxCom({
      settings: { catalogo: { validade: "mesmo_dia", conferida_em: "2026-10-07T11:00:00.000Z" } },
      timezone: "America/Sao_Paulo",
    });
    const r = await buscar(ctx);
    expect(r.produtos[0]).toHaveProperty("preco_cents", 500_000);
  });

  it("conferida ontem: o produto volta SEM preço, e o agente é mandado chamar a equipe", async () => {
    const { ctx } = ctxCom({
      settings: { catalogo: { validade: "mesmo_dia", conferida_em: "2026-10-06T11:00:00.000Z" } },
      timezone: "America/Sao_Paulo",
    });
    const r = await buscar(ctx);
    expect(r.produtos[0]).toMatchObject({ codigo: "IP15", nome: "iPhone 15" });
    expect(r.produtos[0]).not.toHaveProperty("preco");
    expect(r.produtos[0]).not.toHaveProperty("preco_cents");
    expect(r.tabela_vencida).toBe(true);
    expect(r.mensagem).toContain("06/10");
    expect(r.mensagem).toContain("request_human_handoff");
  });

  it("a configuração é lida da organização do TOKEN, nunca de outra", async () => {
    const { ctx, filtros } = ctxCom({ settings: {}, timezone: null });
    await buscar(ctx);
    expect(filtros).toContainEqual(["organizations", "id", ORG]);
  });

  it("sem conseguir ler a organização, o comportamento é o de antes (falha aberta)", async () => {
    const { ctx } = ctxCom(null);
    const r = await buscar(ctx);
    expect(r.produtos[0]).toHaveProperty("preco_cents", 500_000);
  });
});

describe("crm_search_products — parcelas no cartão (`vezes`)", () => {
  type Resposta = {
    produtos: Array<{
      codigo: string;
      preco?: string;
      parcelamento?: { opcao: string; total: string; parcela?: string; sem_juros?: boolean };
    }>;
    tabela_vencida?: boolean;
    mensagem?: string;
  };
  const buscar = (vezes: number | "debito" | undefined, ctx: McpContext) =>
    crmSearchProducts.handler(
      { termo: "iphone", limite: 8, somente_disponiveis: true, ...(vezes !== undefined ? { vezes } : {}) },
      ctx,
    ) as Promise<Resposta>;
  const lojaComTaxas = (extra: Record<string, unknown> = {}) =>
    ctxCom({ settings: { parcelamento: TAXAS, ...extra }, timezone: "America/Sao_Paulo", currency: "BRL" }).ctx;

  it("em 10x: cada produto volta com o valor exato da parcela, com a taxa da loja", async () => {
    const r = await buscar(10, lojaComTaxas());
    // 5000 / (1 - 0,102) = 5567,93 → 10x de 556,79
    expect(r.produtos[0]!.parcelamento).toMatchObject({ opcao: "10x" });
    expect(semNbsp(r.produtos[0]!.parcelamento!.total)).toBe("R$ 5.567,93");
    expect(semNbsp(r.produtos[0]!.parcelamento!.parcela!)).toBe("R$ 556,79");
  });

  it("no débito: total, sem 'parcela'", async () => {
    const r = await buscar("debito", lojaComTaxas());
    expect(r.produtos[0]!.parcelamento).toMatchObject({ opcao: "débito" });
    expect(r.produtos[0]!.parcelamento).not.toHaveProperty("parcela");
    expect(semNbsp(r.produtos[0]!.parcelamento!.total)).toBe("R$ 5.117,18");
  });

  it("sem `vezes`, a busca é a de sempre: nenhum `parcelamento`", async () => {
    const r = await buscar(undefined, lojaComTaxas());
    expect(r.produtos[0]).not.toHaveProperty("parcelamento");
    expect(r.mensagem).toBeUndefined();
  });

  it("opção que a loja não cadastrou: sem `parcelamento` e a ordem de não estimar", async () => {
    const r = await buscar(12, lojaComTaxas());
    expect(r.produtos[0]).not.toHaveProperty("parcelamento");
    expect(r.produtos[0]).toHaveProperty("preco");
    expect(r.mensagem).toContain("NÃO estime");
  });

  it("loja sem taxa nenhuma: diz que não há como calcular", async () => {
    const { ctx } = ctxCom({ settings: {}, timezone: "America/Sao_Paulo" });
    const r = await buscar(10, ctx);
    expect(r.produtos[0]).not.toHaveProperty("parcelamento");
    expect(r.mensagem).toContain("não cadastrou as taxas");
  });

  it("tabela do dia vencida: nem preço nem parcela", async () => {
    const r = await buscar(10, lojaComTaxas({ catalogo: { validade: "mesmo_dia", conferida_em: null } }));
    expect(r.produtos[0]).not.toHaveProperty("preco");
    expect(r.produtos[0]).not.toHaveProperty("parcelamento");
    expect(r.tabela_vencida).toBe(true);
  });

  it("'até 3x sem juros': o sem_juros aparece e o total é o preço", async () => {
    const ctx = ctxCom({
      settings: { parcelamento: { ...TAXAS, credito: { ...TAXAS.credito, "3": 5.78 }, sem_acrescimo_ate: 3 } },
      timezone: "America/Sao_Paulo",
    }).ctx;
    const r = await buscar(3, ctx);
    expect(r.produtos[0]!.parcelamento).toMatchObject({ opcao: "3x", sem_juros: true });
    expect(semNbsp(r.produtos[0]!.parcelamento!.total)).toBe("R$ 5.000,00");
  });
});
