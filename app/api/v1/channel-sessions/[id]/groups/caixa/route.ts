/**
 * PATCH /api/v1/channel-sessions/[id]/groups/caixa — marca um grupo LIGADO como
 * grupo de vendas: cada venda/gasto escrito nele vira lançamento pago na conta
 * escolhida (migration 0613; consumidor em `lib/financeiro/lancamento-do-grupo.handler.ts`).
 *
 * Gerente ou administrador, como ligar o grupo. A organização vem da sessão; a
 * conta é conferida contra ela — uma conta de outra organização no corpo é 422,
 * nunca um lançamento no caixa alheio.
 *
 * Só grupo já ligado: marcar como "de vendas" um grupo que o CRM nem recebe
 * seria uma promessa que nada cumpre.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const corpoSchema = z
  .object({
    group_chat_id: z.string().regex(/^[\d-]+@g\.us$/),
    lanca_no_caixa: z.boolean(),
    conta_do_caixa_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((c) => !c.lanca_no_caixa || !!c.conta_do_caixa_id, { message: "conta obrigatória" });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "channel_session_groups" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const id = idSchema.safeParse((await ctx.params).id);
  const corpo = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!id.success || !corpo.success) {
    return fail("validation_failed", t("Escolha a conta em que o dinheiro do grupo cai."), 422, { requestId });
  }
  const org = authz.org.orgId;
  // Admin client: `channel_session_groups` não tem GRANT de escrita para
  // `authenticated` (migration 0482). O gate é o papel acima; o filtro é o org da sessão.
  const admin = createAdminClient();

  const { data: grupo, error: erroGrupo } = await admin
    .from("channel_session_groups")
    .select("id, enabled")
    .eq("organization_id", org)
    .eq("channel_session_id", id.data)
    .eq("group_chat_id", corpo.data.group_chat_id)
    .maybeSingle();
  if (erroGrupo) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });
  const linha = grupo as { id: string; enabled: boolean } | null;
  if (!linha || (corpo.data.lanca_no_caixa && !linha.enabled)) {
    return fail("grupo_desligado", t("Ligue o grupo antes de marcá-lo como grupo de vendas."), 409, { requestId });
  }

  const contaId = corpo.data.lanca_no_caixa ? corpo.data.conta_do_caixa_id! : null;
  if (contaId) {
    const { data: conta } = await admin
      .from("financial_accounts")
      .select("id")
      .eq("organization_id", org)
      .eq("id", contaId)
      .eq("is_active", true)
      .maybeSingle();
    if (!conta) return fail("validation_failed", t("Essa conta não existe ou está inativa."), 422, { requestId });
  }

  const { error } = await admin
    .from("channel_session_groups")
    .update({ lanca_no_caixa: corpo.data.lanca_no_caixa, conta_do_caixa_id: contaId })
    .eq("organization_id", org)
    .eq("id", linha.id);
  if (error) return fail("internal_error", t("Falha ao salvar."), 500, { requestId });

  void audit({
    action: "financeiro.grupo_de_vendas_configurado",
    actorUserId: authz.user.id,
    organizationId: org,
    resourceType: "channel_session_groups",
    resourceId: linha.id,
    requestId,
    metadata: { lanca_no_caixa: corpo.data.lanca_no_caixa, conta_do_caixa_id: contaId },
  });

  return ok({ lancaNoCaixa: corpo.data.lanca_no_caixa, contaDoCaixaId: contaId }, { requestId });
}
