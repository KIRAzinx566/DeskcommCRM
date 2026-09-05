/**
 * MCP server endpoint (Spec 11 §2 + §5.4).
 *
 * Streamable HTTP transport via `WebStandardStreamableHTTPServerTransport`
 * (Next.js App Router recebe Web `Request`). Stateless: cada request abre
 * um transport+server fresh. Auth via Bearer (`api_tokens`).
 *
 * NUNCA logamos plaintext do bearer. Em erro retornamos JSON-RPC 2.0
 * envelope com `error.code` MCP (-32001/-32002/etc).
 *
 * Rate limit por TOKEN (não por org): um cliente externo com token próprio
 * não pode afogar o token efêmero do agente interno da mesma organização, e
 * vice-versa (`lib/ai/runtime/mcp_token.ts` mints um token por run). Antes
 * desta linha esta rota tinha ZERO proteção — gap #4.3 do
 * `docs/current-state.md` ("rate limit HTTP praticamente inexistente") — e
 * abrir a porta pra cliente externo (Claude Desktop, Cursor) sem isso seria
 * irresponsável: um token vazado passaria a poder martelar o servidor sem
 * limite nenhum.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/mcp/server";
import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MCP_RATE_LIMIT_PER_MIN = 60;

function jsonRpcError(code: number, message: string, status: number, headers?: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "content-type": "application/json", ...headers },
    },
  );
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  let auth;
  try {
    auth = await validateBearerToken(req.headers.get("authorization"));
  } catch (err) {
    if (err instanceof McpAuthError) {
      return jsonRpcError(err.mcpCode, err.message, err.httpStatus);
    }
    const msg = err instanceof Error ? err.message : "auth_failed";
    return jsonRpcError(-32603, msg, 500);
  }

  const rl = await checkRateLimit(`mcp:${auth.apiTokenId}`, MCP_RATE_LIMIT_PER_MIN, 60);
  if (!rl.allowed) {
    return jsonRpcError(-32000, "Too many requests.", 429, { "Retry-After": "60" });
  }

  const transport = new WebStandardStreamableHTTPServerTransport({});
  const server = createMcpServer(auth, requestId);

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req as unknown as Request);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transport_error";
    return jsonRpcError(-32603, msg, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
