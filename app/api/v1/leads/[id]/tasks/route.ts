/**
 * GET/POST /api/v1/leads/[id]/tasks — a tarefa leve com prazo do negócio
 * (migration 0211, `crm_lead_tasks`).
 *
 * O lead vem pela RLS do caller (`fn_can_view_lead`) — é ele que prova a
 * visibilidade, nunca o body. Piso agent: quem vê o dossiê pode marcar um
 * lembrete nele; viewer só lê.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { TASK_TYPES } from "@/lib/leads/lead-tasks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  type: z.enum(TASK_TYPES).default("other"),
  title: z.string().trim().min(1).max(200),
  due_at: z.string().datetime({ offset: true }),
  owner_user_id: z.string().uuid().nullable().optional(),
});

async function lerLead(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string) {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, organization_id, owner_user_id, contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; organization_id: string; owner_user_id: string | null; contact_id: string | null } | null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_tasks" });
  if (!authz.ok) return authz.response;

  const { id: leadId } = await ctx.params;
  const supabase = await createClient();

  let lead: Awaited<ReturnType<typeof lerLead>>;
  try {
    lead = await lerLead(supabase, leadId);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
  if (!lead) return fail("not_found", "Negócio não encontrado.", 404, { requestId });

  const { data, error } = await supabase
    .from("crm_lead_tasks")
    .select(
      "id, lead_id, type, title, due_at, status, owner_user_id, created_by_user_id, completed_at, dismissed_at, created_at, updated_at",
    )
    .eq("lead_id", leadId)
    .order("due_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok({ tasks: data ?? [] }, { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_tasks" });
  if (!authz.ok) return authz.response;
  const { user } = authz;

  const { id: leadId } = await ctx.params;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", "Corpo não é JSON válido.", 400, { requestId });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return fail("unprocessable_entity", "Dê um título e um prazo para a tarefa.", 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const supabase = await createClient();
  let lead: Awaited<ReturnType<typeof lerLead>>;
  try {
    lead = await lerLead(supabase, leadId);
  } catch (err) {
    return fail("internal_error", (err as Error).message, 500, { requestId });
  }
  if (!lead) return fail("not_found", "Negócio não encontrado.", 404, { requestId });

  const row = {
    organization_id: lead.organization_id,
    lead_id: lead.id,
    type: parsed.data.type,
    title: parsed.data.title,
    due_at: parsed.data.due_at,
    owner_user_id: parsed.data.owner_user_id !== undefined ? parsed.data.owner_user_id : lead.owner_user_id,
    created_by_user_id: user.id,
  };

  const { data: criada, error } = await supabase
    .from("crm_lead_tasks")
    .insert(row)
    .select(
      "id, lead_id, type, title, due_at, status, owner_user_id, created_by_user_id, completed_at, dismissed_at, created_at, updated_at",
    )
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "crm_lead_task.created",
    actorUserId: user.id,
    organizationId: lead.organization_id,
    resourceType: "crm_lead_task",
    resourceId: (criada as { id: string }).id,
    requestId,
    metadata: { lead_id: lead.id, title: row.title, due_at: row.due_at, type: row.type },
  });

  return ok({ task: criada }, { status: 201, requestId });
}
