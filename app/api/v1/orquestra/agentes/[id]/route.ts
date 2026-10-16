/**
 * GET /api/v1/orquestra/agentes/:id — a mesa de um agente no Mundo dos agentes:
 * as conversas em que ele é o agente ativo e os pedidos de ajuda que abriu
 * (`lib/orquestra/agente.ts`).
 *
 * `agent` lê: é o mesmo piso das ações que a mesa oferece (responder caso,
 * assumir/devolver conversa). A sessão decide o resto — a RLS de
 * `conversations` recorta o que cada papel vê.
 *
 * Só leitura: os comandos vão pelas rotas que já existem, então não há mutação,
 * auditoria nem trava de suporte aqui.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { carregarMesa } from "@/lib/orquestra/agente";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("agent", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;

  try {
    const mesa = await carregarMesa(await createClient(), { orgId: authz.org.orgId, agenteId: id });
    return ok(mesa, { requestId });
  } catch (erro) {
    logger.error("[orquestra/agente] a mesa do agente não carregou", {
      requestId,
      organizationId: authz.org.orgId,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return fail("internal_error", traduzir("Não deu para carregar a mesa do agente.", authz.user.idioma), 500, {
      requestId,
    });
  }
}
