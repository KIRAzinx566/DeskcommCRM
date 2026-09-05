/**
 * GET  /api/v1/billing/credentials — lista credenciais de gateway de pagamento
 *                                     da org ativa (manager+). Lê da view
 *                                     `billing_gateway_credentials_safe`, que
 *                                     NUNCA expõe campos cifrados.
 * POST /api/v1/billing/credentials — cria credencial ASAAS (admin). Plaintext
 *                                     da api_key entra só aqui, é cifrado
 *                                     AES-GCM (chave separada da de IA) e
 *                                     descartado da memória. O token de
 *                                     webhook é mostrado UMA VEZ, nesta
 *                                     resposta — depois só o hash sobrevive.
 *
 * Molde de `app/api/v1/ai/credentials/route.ts`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { guardarCredencialAsaas } from "@/lib/billing/credenciais/guardar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SAFE_COLUMNS =
  "id, organization_id, provider, environment, api_key_last4, asaas_cpf_cnpj, webhook_path_token, validated_at, validation_error, is_active, created_by, created_at, updated_at";

const createSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  api_key: z.string().trim().min(8).max(2048),
});

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "billing_credentials" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("billing_gateway_credentials_safe")
    .select(SAFE_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return fail("internal_error", "Erro ao listar credenciais.", 500, { requestId });
  }
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "billing_credentials" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return fail("invalid_request", "Body JSON inválido.", 400, { requestId });
  }

  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return fail("validation_failed", "Campos inválidos.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  const guardado = await guardarCredencialAsaas({
    admin: createAdminClient(),
    orgId: activeOrg.orgId,
    userId: authUser.id,
    environment: input.environment,
    apiKey: input.api_key,
    requestId,
  });

  if (!guardado.ok) {
    if (guardado.motivo === "ambiente_em_uso") {
      return fail(
        "environment_already_used",
        `Já existe uma credencial cadastrada para o ambiente "${input.environment}".`,
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao criar credencial.", 500, { requestId });
  }

  const { data: created } = await createAdminClient()
    .from("billing_gateway_credentials_safe")
    .select(SAFE_COLUMNS)
    .eq("id", guardado.id)
    .single();

  // ⚠️ ÚNICA vez em que o token de webhook em texto puro sai daqui. Depois
  // desta resposta só o hash sobrevive — se o usuário perder, cadastra uma
  // credencial nova (mesma régua de bearer token em `api_tokens`).
  return ok({ ...created, webhook_token: guardado.webhookToken }, { status: 201, requestId });
}
