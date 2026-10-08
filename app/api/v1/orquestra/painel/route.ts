/**
 * GET /api/v1/orquestra/painel?periodo=hoje|7d|mes — a foto do momento da
 * operação que a Visão geral e o Mundo dos agentes desenham
 * (`lib/orquestra/painel.ts`).
 *
 * `viewer` lê: é a tela do dono e de quem acompanha, não de quem configura. O
 * cliente é o da SESSÃO — a RLS decide o que cada papel vê, e o diário com as
 * ferramentas usadas (auditoria) só é pedido para quem administra, porque é só
 * a quem administra que a policy de `api_audit_log` o entrega.
 *
 * Só leitura: não há mutação, então não há auditoria nem trava de suporte.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { roleAtLeast } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { carregarPainel, PERIODOS_DO_PAINEL } from "@/lib/orquestra/painel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const querySchema = z.object({ periodo: z.enum(PERIODOS_DO_PAINEL).default("mes") });

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "organizations" });
  if (!authz.ok) return authz.response;

  const parsed = querySchema.safeParse({ periodo: req.nextUrl.searchParams.get("periodo") ?? undefined });
  if (!parsed.success) {
    return fail("validation_failed", traduzir("Período inválido.", authz.user.idioma), 422, { requestId });
  }

  const painel = await carregarPainel(await createClient(), {
    orgId: authz.org.orgId,
    periodo: parsed.data.periodo,
    podeVerAuditoria: roleAtLeast(authz.org.role, "admin"),
  });
  return ok(painel, { requestId });
}
