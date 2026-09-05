/**
 * POST /api/v1/billing/charges/:id/cancel (manager+)
 *
 * Sub-rota de ação, não verbo HTTP genérico: cancelar cobrança exige um
 * motivo (`reason`), então não é um DELETE sem corpo. Chama o MESMO
 * `cancelarCobrancaHandler` que a tool MCP `crm_cancelar_cobranca` usa.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { cancelarCobrancaHandler } from "../../_handler";

const cancelarSchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("manager", { requestId, resource: "billing_charges" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg, user } = authz;

  const parsed = cancelarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const supabase = await createClient();
  try {
    const cobranca = await cancelarCobrancaHandler(
      supabase,
      { organization_id: activeOrg.orgId, actor: { type: "user", id: user.id }, requestId },
      { id, reason: parsed.data.reason },
    );
    return ok(cobranca, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }
}
