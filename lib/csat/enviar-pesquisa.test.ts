import { beforeEach, describe, expect, it, vi } from "vitest";

import { csatSurveyHandler } from "./enviar-pesquisa";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { EventRow } from "@/lib/event-log/dispatcher";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const CONV_ID = "44444444-4444-4444-8444-444444444444";
const CONTACT_ID = "55555555-5555-4555-8555-555555555555";

interface StubState {
  org: { settings: Record<string, unknown> } | null;
  existente: { id: string } | null;
  insertError: string | null;
  inserted: Record<string, unknown> | null;
}

function makeAdminStub(state: StubState) {
  return {
    from: (table: string) => {
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: state.org, error: null }),
            }),
          }),
        };
      }
      if (table === "csat_requests") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                maybeSingle: () => Promise.resolve({ data: state.existente, error: null }),
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            state.inserted = row;
            return Promise.resolve({ error: state.insertError ? { message: state.insertError } : null });
          },
        };
      }
      throw new Error(`tabela inesperada no stub: ${table}`);
    },
  };
}

function baseRow(overrides: Partial<EventRow["payload"]> = {}): EventRow {
  return {
    id: "e1",
    organization_id: ORG_ID,
    event_type: "conversation.closed",
    entity_kind: "conversation",
    entity_id: CONV_ID,
    payload: {
      contact_id: CONTACT_ID,
      channel_session_id: "sess-1",
      had_inbound: true,
      ...overrides,
    },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

function setupState(overrides: Partial<StubState> = {}): StubState {
  return {
    org: { settings: {} },
    existente: null,
    insertError: null,
    inserted: null,
    ...overrides,
  };
}

describe("csatSurveyHandler", () => {
  beforeEach(() => {
    vi.mocked(sendMessageHandler).mockReset();
    vi.mocked(sendMessageHandler).mockResolvedValue(undefined as never);
  });

  it("sem conversa (entity_id ausente) sai sem enviar", async () => {
    const row = { ...baseRow(), entity_id: null };
    const result = await csatSurveyHandler.handle(row);
    expect(result.status).toBe("ok");
    expect(result.detail).toBe("sem_conversation_id");
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("conversa sem mensagem inbound não tem o que avaliar", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const row = baseRow({ had_inbound: false });
    const result = await csatSurveyHandler.handle(row);
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("sem_mensagem_inbound");
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("csat desligado nas configurações da org", async () => {
    const state = setupState({ org: { settings: { csat: { enabled: false } } } });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatSurveyHandler.handle(baseRow());
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("csat_desligado");
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("já perguntou nesta conversa recentemente — não duplica", async () => {
    const state = setupState({ existente: { id: "req-1" } });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatSurveyHandler.handle(baseRow());
    expect(result.status).toBe("skipped");
    expect(result.detail).toBe("ja_perguntado");
    expect(sendMessageHandler).not.toHaveBeenCalled();
  });

  it("envia a pergunta padrão e grava csat_requests pending", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatSurveyHandler.handle(baseRow());
    expect(result.status).toBe("ok");
    expect(sendMessageHandler).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendMessageHandler).mock.calls[0];
    if (!call) throw new Error("sendMessageHandler não foi chamado");
    const [, , input] = call;
    expect(input).toMatchObject({ conversation_id: CONV_ID, type: "text" });
    expect(state.inserted).toMatchObject({
      organization_id: ORG_ID,
      conversation_id: CONV_ID,
      contact_id: CONTACT_ID,
      status: "pending",
    });
  });

  it("usa a pergunta customizada da org quando configurada", async () => {
    const state = setupState({
      org: { settings: { csat: { enabled: true, pergunta: "De 1 a 5, como foi?" } } },
    });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    await csatSurveyHandler.handle(baseRow());
    const call = vi.mocked(sendMessageHandler).mock.calls[0];
    if (!call) throw new Error("sendMessageHandler não foi chamado");
    const [, , input] = call;
    expect((input as { body: string }).body).toBe("De 1 a 5, como foi?");
  });

  it("envio falhou — não grava csat_requests pendente pra pergunta que nunca chegou", async () => {
    const state = setupState();
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    vi.mocked(sendMessageHandler).mockRejectedValue(new Error("contato bloqueado"));
    const result = await csatSurveyHandler.handle(baseRow());
    expect(result.status).toBe("error");
    expect(result.detail).toBe("envio_falhou");
    expect(state.inserted).toBeNull();
  });

  it("insert falhou depois do envio — reporta erro", async () => {
    const state = setupState({ insertError: "duplicate key" });
    vi.mocked(createAdminClient).mockReturnValue(makeAdminStub(state) as never);
    const result = await csatSurveyHandler.handle(baseRow());
    expect(result.status).toBe("error");
    expect(result.detail).toBe("duplicate key");
  });
});
