/**
 * `/api/v1/billing/charges` — a rota, FINA.
 *
 * Autentica, valida a forma do corpo, e traduz o resultado (ou o `ApiError`)
 * em resposta HTTP. A decisão mora em `_handler.ts` — molde de
 * `app/api/v1/agenda/agendamentos/route.ts`: rota e tool MCP chamam a MESMA
 * função, nenhuma reimplementa a decisão.
 *
 * Piso `manager` na ESCRITA: a policy de `billing_charges` (migration 0208)
 * já recusa `insert`/`update` de quem é `agent` ou abaixo — a checagem aqui é
 * a mesma régua, não uma segunda fonte de verdade.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { ApiError } from "@/lib/api/types";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { criarCobrancaHandler, listarCobrancasHandler } from "./_handler";

const listarSchema = z.object({
  contact_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  status: z
    .enum(["pending", "awaiting_payment", "paid", "overdue", "cancelled", "refunded", "failed"])
    .optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});

const criarSchema = z.object({
  contact_id: z.string().uuid(),
  lead_id: z.string().uuid().optional(),
  method: z.enum(["boleto", "pix", "cartao"]),
  amount_cents: z.number().int().positive(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  description: z.string().max(500).optional(),
  cpf_cnpj: z.string().trim().min(11).max(18),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "billing_charges" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg, user } = authz;

  const url = new URL(req.url);
  const parsed = listarSchema.safeParse({
    contact_id: url.searchParams.get("contact_id") ?? undefined,
    lead_id: url.searchParams.get("lead_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limite: url.searchParams.get("limite") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Consulta inválida.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const supabase = await createClient();
  const cobrancas = await listarCobrancasHandler(
    supabase,
    { organization_id: activeOrg.orgId, actor: { type: "user", id: user.id }, requestId },
    {
      contact_id: parsed.data.contact_id,
      lead_id: parsed.data.lead_id,
      status: parsed.data.status,
      limite: parsed.data.limite ?? 20,
    },
  );

  return ok(cobrancas, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("manager", { requestId, resource: "billing_charges" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg, user } = authz;

  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  const supabase = await createClient();
  try {
    const cobranca = await criarCobrancaHandler(
      supabase,
      { organization_id: activeOrg.orgId, actor: { type: "user", id: user.id }, requestId },
      parsed.data,
    );
    return ok(cobranca, { requestId, status: 201 });
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
