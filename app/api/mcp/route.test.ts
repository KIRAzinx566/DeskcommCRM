import { describe, expect, it, vi, beforeEach } from "vitest";

const authResult = {
  organizationId: "org-1",
  role: "manager" as const,
  actor: { type: "user" as const, id: "user-1", role: "manager" as const },
  apiTokenId: "token-1",
  scopes: ["mcp:read", "mcp:write"],
};

vi.mock("@/lib/mcp/auth", () => ({
  McpAuthError: class McpAuthError extends Error {
    constructor(
      public mcpCode: number,
      public httpStatus: number,
      message: string,
    ) {
      super(message);
    }
  },
  validateBearerToken: vi.fn(async () => authResult),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit }));

const connect = vi.fn(async () => {});
const createMcpServer = vi.fn(() => ({ connect }));
vi.mock("@/lib/mcp/server", () => ({ createMcpServer }));

function fakeRequest(): { headers: { get: (k: string) => string | null } } {
  return { headers: { get: (k: string) => (k.toLowerCase() === "authorization" ? "Bearer dsk_x" : null) } };
}

describe("POST /api/mcp — rate limit por token", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    createMcpServer.mockClear();
    connect.mockClear();
  });

  it("acima do limite: 429 JSON-RPC, NUNCA chega a criar o server MCP", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, count: 61, limit: 60, window_sec: 60 });
    const { POST } = await import("./route");

    const res = await POST(fakeRequest() as never);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error).toBeTruthy();
    // A trava é ANTES de tudo — se o server chegasse a ser criado, um cliente
    // acima do limite ainda consumiria os recursos que a trava existe pra
    // poupar (conexão do transport, etc).
    expect(createMcpServer).not.toHaveBeenCalled();
  });

  it("bucket é por TOKEN, não por org — dois tokens da mesma org não compartilham teto", async () => {
    checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 60, window_sec: 60 });
    const { POST } = await import("./route");

    // connect() lança de propósito — não precisamos completar o handshake
    // MCP real pra provar QUE bucket foi consultado, só interceptar antes.
    connect.mockRejectedValueOnce(new Error("stop-here"));
    await POST(fakeRequest() as never);

    expect(checkRateLimit).toHaveBeenCalledWith(`mcp:${authResult.apiTokenId}`, 60, 60);
  });
});
