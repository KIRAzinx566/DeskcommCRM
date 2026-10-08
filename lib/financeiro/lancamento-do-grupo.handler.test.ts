import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import type { EventRow } from "@/lib/event-log/dispatcher";

import { lancamentoDoGrupoHandler } from "./lancamento-do-grupo.handler";

vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const MENSAGEM = "44444444-4444-4444-8444-444444444444";
const CONTA = "55555555-5555-4555-8555-555555555555";

interface Mundo {
  grupo: Record<string, unknown> | null;
  conta: Record<string, unknown> | null;
  mensagem: Record<string, unknown> | null;
  inseridos: Array<Record<string, unknown>>;
  /** source_line já gravadas (para simular o 23505 do índice único). */
  jaGravadas: Set<number>;
  filtros: Array<[string, string, unknown]>;
}

let mundo: Mundo;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(tabela: string) {
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          mundo.filtros.push([tabela, col, val]);
          return q;
        },
        maybeSingle: async () => ({
          data:
            tabela === "channel_session_groups"
              ? mundo.grupo
              : tabela === "financial_accounts"
                ? mundo.conta
                : tabela === "messages"
                  ? mundo.mensagem
                  : tabela === "organizations"
                    ? { timezone: "America/Sao_Paulo" }
                    : null,
          error: null,
        }),
        insert: async (linha: Record<string, unknown>) => {
          const n = linha.source_line as number;
          if (mundo.jaGravadas.has(n)) return { error: { code: "23505", message: "duplicate" } };
          mundo.jaGravadas.add(n);
          mundo.inseridos.push(linha);
          return { error: null };
        },
      };
      return q;
    },
  }),
}));

const evento = (): EventRow =>
  ({
    id: "e1",
    organization_id: ORG,
    event_type: "message.group_received",
    entity_id: MENSAGEM,
    payload: { message_id: MENSAGEM, conversation_id: CONVERSA },
  }) as unknown as EventRow;

beforeEach(() => {
  vi.clearAllMocks();
  mundo = {
    grupo: { id: "g1", conta_do_caixa_id: CONTA },
    conta: { id: CONTA, currency: "BRL", is_active: true },
    mensagem: {
      id: MENSAGEM,
      direction: "inbound",
      // 23h de São Paulo do dia 7 = 02h UTC do dia 8: o lançamento é do dia 7.
      sent_at: "2026-10-08T02:00:00.000Z",
      body: "bom dia\niPhone 13 128GB vendido por R$ 2.100 no pix\npaguei motoboy R$ 25",
    },
    inseridos: [],
    jaGravadas: new Set(),
    filtros: [],
  };
});

describe("lancamentoDoGrupoHandler", () => {
  it("consome só message.group_received e roda com a organização parada (escrita interna)", () => {
    expect(lancamentoDoGrupoHandler.events).toEqual(["message.group_received"]);
    expect(lancamentoDoGrupoHandler.naOrgParada).toBe("roda");
  });

  it("grupo de vendas: cada linha lida vira um lançamento pago, na conta e no dia da mensagem", async () => {
    const r = await lancamentoDoGrupoHandler.handle(evento());
    expect(r.status).toBe("ok");
    expect(mundo.inseridos).toEqual([
      expect.objectContaining({
        organization_id: ORG,
        account_id: CONTA,
        direction: "in",
        amount_cents: 210_000,
        status: "paid",
        paid_at: "2026-10-08T02:00:00.000Z",
        entry_date: "2026-10-07",
        origin: "grupo",
        source_message_id: MENSAGEM,
        source_line: 1,
      }),
      expect.objectContaining({ direction: "out", amount_cents: 2_500, source_line: 2 }),
    ]);
    expect(vi.mocked(audit)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "financeiro.lancamento_do_grupo", metadata: expect.objectContaining({ criados: 2 }) }),
    );
  });

  it("toda leitura filtra pela organização do EVENTO", async () => {
    await lancamentoDoGrupoHandler.handle(evento());
    for (const t of ["channel_session_groups", "financial_accounts", "messages"]) {
      expect(mundo.filtros).toContainEqual([t, "organization_id", ORG]);
    }
  });

  it("replay: o que já foi lançado não lança de novo nem audita", async () => {
    await lancamentoDoGrupoHandler.handle(evento());
    vi.mocked(audit).mockClear();
    const r = await lancamentoDoGrupoHandler.handle(evento());
    expect(r).toMatchObject({ status: "ok", detail: "criados:0;ja_existiam:2;ignoradas:0" });
    expect(mundo.inseridos).toHaveLength(2);
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("grupo que não é de vendas: nada acontece", async () => {
    mundo.grupo = null;
    const r = await lancamentoDoGrupoHandler.handle(evento());
    expect(r).toMatchObject({ status: "skipped", detail: "grupo_nao_lanca_no_caixa" });
    expect(mundo.inseridos).toEqual([]);
  });

  it("conta desativada depois de configurar: não lança", async () => {
    mundo.conta = { id: CONTA, currency: "BRL", is_active: false };
    expect((await lancamentoDoGrupoHandler.handle(evento())).detail).toBe("conta_inativa");
    expect(mundo.inseridos).toEqual([]);
  });

  it("mensagem só de conversa: skipped, sem auditoria", async () => {
    mundo.mensagem = { ...mundo.mensagem, body: "quem fecha hoje?" };
    const r = await lancamentoDoGrupoHandler.handle(evento());
    expect(r).toMatchObject({ status: "skipped", detail: "sem_lancamento" });
    expect(vi.mocked(audit)).not.toHaveBeenCalled();
  });

  it("venda ambígua: não lança e diz quantas ignorou", async () => {
    mundo.mensagem = { ...mundo.mensagem, body: "vendi 2 capinhas por 50 e 1 película por 30" };
    expect((await lancamentoDoGrupoHandler.handle(evento())).detail).toBe("ignoradas:1");
  });
});
