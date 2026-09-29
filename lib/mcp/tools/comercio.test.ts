import { describe, expect, it, vi } from "vitest";

import { crmSearchProducts, crmUpdateProductPrice } from "./comercio";
import type { McpContext } from "../types";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

/** Só o formato do campo que este arquivo mede — não o contrato inteiro. */
interface RespostaBusca {
  produtos: Array<{ preco: string }>;
}

/**
 * O PREÇO QUE O AGENTE COTA AO CLIENTE — NA CONVENÇÃO DA MOEDA DA LOJA.
 *
 * `precoLegivel()` era uma SEXTA cópia de formatador de dinheiro, não
 * declarada no comentário de `lib/money.ts` que lista as cinco conhecidas — e
 * a mais grave das seis: é o texto que `crm_search_products` devolve ao
 * agente, que é quem fala com o cliente por WhatsApp. A pantalla de Produtos
 * já mostrava `$249.90` para uma loja em MXN; o agente, com `precoLegivel`,
 * continuava dizendo `MXN 249,90` — o mesmo defeito que a migration 0234
 * documenta ter corrigido, sobrevivendo no único canal que fala com o
 * cliente de verdade.
 */

function ctxCom(produtos: Array<Record<string, unknown>>): McpContext {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: async () => ({ data: produtos, error: null, count: produtos.length }),
  };
  return {
    organizationId: "22222222-2222-4222-8222-222222222222",
    role: "agent",
    actor: { type: "ai_agent", id: "run-1", agent_id: "agent-1" },
    apiTokenId: "33333333-3333-4333-8333-333333333333",
    requestId: "44444444-4444-4444-8444-444444444444",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: () => query } as any,
  } as McpContext;
}


/** O `Intl` emite NBSP (U+00A0) ou narrow NBSP (U+202F) entre símbolo e número. */
const semNbsp = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

const PRODUTO_MXN = {
  id: "11111111-1111-4111-8111-111111111111",
  codigo: "IP15",
  nome: "iPhone 15",
  descricao: null,
  marca: null,
  categoria: null,
  preco_cents: 24990,
  moeda: "MXN",
  controla_estoque: false,
  quantidade: 0,
  ativo: true,
};

describe("crm_search_products — preço na convenção da moeda", () => {
  it("cota o preço em MXN como um comerciante mexicano lê, não em pt-BR", async () => {
    const resultado = (await crmSearchProducts.handler(
      { termo: "iphone", limite: 8, somente_disponiveis: true },
      ctxCom([PRODUTO_MXN]),
    )) as RespostaBusca;

    expect(resultado.produtos).toHaveLength(1);
    // Ponto decimal e cifrão — não `MXN 249,90`, que era o que precoLegivel()
    // devolvia (vírgula decimal brasileira com o código colado na frente).
    expect(resultado.produtos[0]!.preco).toBe("$249.90");
    expect(resultado.produtos[0]!.preco).not.toContain("MXN 249,90");
  });

  it("continua certo em BRL — a troca não pode mudar o que já funcionava", async () => {
    const resultado = (await crmSearchProducts.handler(
      { termo: "iphone", limite: 8, somente_disponiveis: true },
      ctxCom([{ ...PRODUTO_MXN, moeda: "BRL" }]),
    )) as RespostaBusca;

    expect(semNbsp(resultado.produtos[0]!.preco)).toBe("R$ 249,90");
  });
});

describe("crm_update_product_price", () => {
  function ctxComUpdate(produto: Record<string, unknown> | null) {
    const eqChamadas: unknown[][] = [];
    const query = {
      update: (patch: Record<string, unknown>) => {
        (query as { _patch?: unknown })._patch = patch;
        return query;
      },
      eq: (...args: unknown[]) => {
        eqChamadas.push(args);
        return query;
      },
      select: () => query,
      maybeSingle: async () => ({ data: produto, error: null }),
    };
    const ctx = {
      organizationId: "22222222-2222-4222-8222-222222222222",
      role: "agent",
      actor: { type: "ai_agent", id: "run-1", agent_id: "agent-1" },
      apiTokenId: "33333333-3333-4333-8333-333333333333",
      requestId: "44444444-4444-4444-8444-444444444444",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { from: () => query } as any,
    } as McpContext;
    return { ctx, eqChamadas, query };
  }

  it("atualiza o preço e filtra por organização E código, nunca só um dos dois", async () => {
    const { ctx, eqChamadas } = ctxComUpdate({
      id: "11111111-1111-4111-8111-111111111111",
      codigo: "ABC123",
      nome: "Camiseta",
      preco_cents: 5990,
      moeda: "BRL",
    });

    const resultado = (await crmUpdateProductPrice.handler(
      { codigo: "ABC123", novo_preco: "59,90" },
      ctx,
    )) as { preco_cents: number; produto: { codigo: string } };

    expect(resultado.preco_cents).toBe(5990);
    expect(resultado.produto.codigo).toBe("ABC123");
    expect(eqChamadas).toContainEqual(["organization_id", ctx.organizationId]);
    expect(eqChamadas).toContainEqual(["codigo", "ABC123"]);
  });

  it("recusa um código que não existe nesta loja", async () => {
    const { ctx } = ctxComUpdate(null);
    await expect(
      crmUpdateProductPrice.handler({ codigo: "NAO-EXISTE", novo_preco: "10" }, ctx),
    ).rejects.toThrow(/produto_nao_encontrado/);
  });

  it("recusa um preço que não consegue entender, sem chegar a tocar o banco", async () => {
    const { ctx, query } = ctxComUpdate({ id: "x", codigo: "ABC123" });
    const espiaUpdate = vi.spyOn(query, "update");

    await expect(
      crmUpdateProductPrice.handler({ codigo: "ABC123", novo_preco: "não sei" }, ctx),
    ).rejects.toThrow(/preco_nao_entendido/);
    expect(espiaUpdate).not.toHaveBeenCalled();
  });
});
