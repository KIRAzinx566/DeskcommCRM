/**
 * PATCH /api/v1/leads/[id]/tasks/[taskId] — mudar prazo/título, ou decidir
 * (concluir/descartar) uma tarefa leve (migration 0211).
 *
 * Concluir e descartar geram atividade na timeline do negócio — mesmo
 * critério de `next_action_approved`/`_dismissed`: as duas mudam o que
 * alguém faria a seguir, e "descartada" é sinal, não silêncio. Reabrir
 * (voltar para `pending`) não gera atividade própria: é correção de erro de
 * clique, não uma decisão nova sobre o negócio.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { TASK_STATUSES } from "@/lib/leads/lead-tasks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string; taskId: string }>;
}

const bodySchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    due_at: z.string().datetime({ offset: true }).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Nada para alterar." });

export async function PATCH(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_tasks" });
  if (!authz.ok) return authz.response;
  const { user } = authz;

  const { id: leadId, taskId } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", "Corpo não é JSON válido.", 400, { requestId });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", "Não entendi o que mudar nesta tarefa.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();

  const { data: atual, error: leErr } = await supabase
    .from("crm_lead_tasks")
    .select("id, organization_id, lead_id, title, status")
    .eq("id", taskId)
    .eq("lead_id", leadId)
    .maybeSingle();
  if (leErr) return fail("internal_error", leErr.message, 500, { requestId });
  if (!atual) return fail("not_found", "Tarefa não encontrada.", 404, { requestId });
  const tarefa = atual as { id: string; organization_id: string; lead_id: string; title: string; status: string };

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.due_at !== undefined) patch.due_at = parsed.data.due_at;
  if (parsed.data.status !== undefined) {
    patch.status = parsed.data.status;
    patch.completed_at = parsed.data.status === "done" ? new Date().toISOString() : null;
    patch.dismissed_at = parsed.data.status === "dismissed" ? new Date().toISOString() : null;
  }

  const { data: atualizada, error } = await supabase
    .from("crm_lead_tasks")
    .update(patch)
    .eq("id", taskId)
    .select(
      "id, lead_id, type, title, due_at, status, owner_user_id, created_by_user_id, completed_at, dismissed_at, created_at, updated_at",
    )
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  // Só a DECISÃO (concluir/descartar) vira atividade — mudar título/prazo é
  // ajuste de agenda, não um acontecimento do negócio.
  if (parsed.data.status === "done" || parsed.data.status === "dismissed") {
    const { data: leadRow } = await supabase
      .from("crm_leads")
      .select("contact_id")
      .eq("id", leadId)
      .maybeSingle();
    await emitLeadActivity(supabase, {
      organizationId: tarefa.organization_id,
      leadId: tarefa.lead_id,
      contactId: (leadRow as { contact_id: string | null } | null)?.contact_id ?? null,
      type: parsed.data.status === "done" ? "task_completed" : "task_dismissed",
      sourceModule: "crm_lead_tasks",
      sourceId: tarefa.id,
      actor: { type: "user", id: user.id },
      reason:
        parsed.data.status === "done"
          ? `Concluiu: ${tarefa.title}`
          : `Descartou: ${tarefa.title}`,
      payload: { task_id: tarefa.id, title: tarefa.title },
    });
  }

  void audit({
    action: "crm_lead_task.updated",
    actorUserId: user.id,
    organizationId: tarefa.organization_id,
    resourceType: "crm_lead_task",
    resourceId: tarefa.id,
    requestId,
    metadata: { lead_id: leadId, patch: parsed.data },
  });

  return ok({ task: atualizada }, { requestId });
}
