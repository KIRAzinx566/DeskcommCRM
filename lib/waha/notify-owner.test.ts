import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendWAHA } from "./send";
import { notifyOwnerWhatsApp } from "./notify-owner";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("./send", () => ({ sendWAHA: vi.fn() }));

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeAdminStub(opts: {
  ownerNumber: string | null;
  sessionName: string | null;
  orgError?: boolean;
  sessionError?: boolean;
}) {
  return {
    from: (table: string) => {
      if (table === "organizations") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () =>
            opts.orgError
              ? { data: null, error: { message: "boom" } }
              : { data: { owner_whatsapp_number: opts.ownerNumber }, error: null },
        };
        return builder;
      }
      if (table === "channel_sessions") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () =>
            opts.sessionError
              ? { data: null, error: { message: "boom" } }
              : { data: opts.sessionName ? { waha_session_name: opts.sessionName } : null, error: null },
        };
        return builder;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyOwnerWhatsApp", () => {
  it("no-ops without calling WAHA when owner_whatsapp_number is not configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminStub({ ownerNumber: null, sessionName: "s1" }) as never,
    );

    await notifyOwnerWhatsApp(ORG_ID, "Reunião marcada");

    expect(sendWAHA).not.toHaveBeenCalled();
  });

  it("no-ops without calling WAHA when there is no WORKING channel session", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminStub({ ownerNumber: "+5511999999999", sessionName: null }) as never,
    );

    await notifyOwnerWhatsApp(ORG_ID, "Reunião marcada");

    expect(sendWAHA).not.toHaveBeenCalled();
  });

  it("sends via WAHA with a manually-built @c.us chatId when configured", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminStub({ ownerNumber: "+55 11 99999-9999", sessionName: "default" }) as never,
    );
    vi.mocked(sendWAHA).mockResolvedValue({ ok: true });

    await notifyOwnerWhatsApp(ORG_ID, "Reunião marcada para amanhã");

    expect(sendWAHA).toHaveBeenCalledWith({
      sessionName: "default",
      chatId: "5511999999999@c.us",
      text: "Reunião marcada para amanhã",
    });
  });

  it("never throws when the organizations read fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminStub({ ownerNumber: null, sessionName: null, orgError: true }) as never,
    );

    await expect(notifyOwnerWhatsApp(ORG_ID, "x")).resolves.toBeUndefined();
    expect(sendWAHA).not.toHaveBeenCalled();
  });

  it("never throws when the channel_sessions read fails", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeAdminStub({ ownerNumber: "+5511999999999", sessionName: null, sessionError: true }) as never,
    );

    await expect(notifyOwnerWhatsApp(ORG_ID, "x")).resolves.toBeUndefined();
    expect(sendWAHA).not.toHaveBeenCalled();
  });

  it("never throws when createAdminClient itself throws", async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error("no service role configured");
    });

    await expect(notifyOwnerWhatsApp(ORG_ID, "x")).resolves.toBeUndefined();
  });
});
