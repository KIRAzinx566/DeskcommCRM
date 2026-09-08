import { beforeEach, describe, expect, it, vi } from "vitest";

import { csatReplyHandler } from "./capturar-resposta";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/event-log/dispatcher";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";
const REQ_ID = "req-1";

interface StubState {
  pendente: { id: string; expires_at: string } | null;
  updates: Array<Record<string, unknown>>;
  updateError: string | null;
}

function makeAdminStub(state: StubState) {
  return {
    from: (table: string) => {
      if (table !== "csat_requests") throw new Error(`tabela inesperada no stub: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: state.pendente, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: () => {
            state.updates.push(patch);
            return Promise.resolve({ error: state.updateError ? { message: state.updateError } : null });
          },
        }),
      };
    },
  };
}

function baseRow(overrides: Partial<{ contact_id: string; body_preview: string }> = {}): EventRow {
  return {
    id: "e1",
    organization_id: ORG_ID,
    event_type: "message.received",
    entity_kind: "message",
    entity_id: "m1",
    payload: {
      contact_id: CONTACT_ID,
      body_preview: "5",
      ...overrides,
    },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

function setupState(overrides: Partial<StubState> = {}): StubState {
  return {
    pendente: { id: REQ_ID, expires_at: new Date(Date.now() + 60_000).toISOString() },
    updates: [],
    updateError: null,
    ...overrides,
  };
}

describe("csatReplyHandler", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
  });

  it("evento sem contact_id ou sem corpo de texto sai sem tocar nada", async () => {
    const result = await csatReplyHandler.handle(baseRow({ contact_id: undefined as unknown as string }));
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("sem_contato_ou_corpo");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("sem pesquisa pendente pro contato — mensagem segue seu caminho normal", async () => {
    const state = setupState({ pendente: null });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow());
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("sem_pesquisa_pendente");
  });

  it("pesquisa pendente mas já expirada — marca expired e não interpreta nota", async () => {
    const state = setupState({
      pendente: { id: REQ_ID, expires_at: new Date(Date.now() - 1000).toISOString() },
    });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow());
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("expirada");
    expect(state.updates).toEqual([{ status: "expired" }]);
  });

  it("resposta não interpretável como nota — deixa a pesquisa pending intacta", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow({ body_preview: "obrigado" }));
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("nao_interpretavel");
    expect(state.updates).toEqual([]);
  });

  it("resposta '5' vira nota e marca answered", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow({ body_preview: "5" }));
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("nota_5");
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ status: "answered", score: 5, raw_reply: "5" });
  });

  it("resposta em palavra ('Ótimo!') também vira nota", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow({ body_preview: "Ótimo!" }));
    expect(result.detail).toBe("nota_5");
    expect(state.updates[0]).toMatchObject({ score: 5 });
  });

  it("update falhou — devolve retry com retry_at no futuro", async () => {
    const state = setupState({ updateError: "conn lost" });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatReplyHandler.handle(baseRow({ body_preview: "3" }));
    expect(result.status).toBe("retry");
    expect(result.detail).toBe("conn lost");
    expect(result.retry_at).toBeDefined();
    expect(new Date(result.retry_at as string).getTime()).toBeGreaterThan(Date.now());
  });
});
