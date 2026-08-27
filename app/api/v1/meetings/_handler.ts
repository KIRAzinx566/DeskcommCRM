/**
 * Core handlers para /api/v1/meetings (migration 0167).
 *
 * Cobre createMeetingHandler (POST), listMeetingsHandler (GET),
 * updateMeetingHandler (PATCH). Sem emit_event: não há hoje nenhum consumer
 * para um evento de reunião (anti-pattern 3 do CLAUDE.md — evento sem
 * consumer), então o efeito colateral (aviso ao dono) é chamado direto, não
 * via barramento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import type { Actor, HandlerCtx } from "@/lib/api/handlers/types";
import { audit } from "@/lib/audit";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { notifyOwnerWhatsApp } from "@/lib/channels";
import type { CreateMeetingInput, ListMeetingsQuery, UpdateMeetingInput } from "@/lib/schemas/meetings";

type SB = SupabaseClient;

const MEETING_COLS = "*";

function actorAuditPayload(actor: Actor): {
  actorUserId: string | null;
  metadataActor: Record<string, unknown>;
} {
  if (actor.type === "user") {
    return { actorUserId: actor.id, metadataActor: { actor_type: "user" } };
  }
  if (actor.type === "webhook_source") {
    return { actorUserId: null, metadataActor: { actor_type: "webhook_source", actor_id: actor.id } };
  }
  return {
    actorUserId: null,
    metadataActor: { actor_type: "ai_agent", actor_id: actor.id, ...(actor.api_token_id ? { actor_api_token_id: actor.api_token_id } : {}) },
  };
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface ListMeetingsResult {
  meetings: Array<Record<string, unknown>>;
  cursor: string | null;
  has_more: boolean;
}

interface MeetingCursor {
  starts_at: string;
  id: string;
}
function encCursor(p: MeetingCursor): string {
  return Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
}
function decCursor(raw: string): MeetingCursor | null {
  try {
    const p = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as MeetingCursor;
    if (typeof p.id !== "string" || typeof p.starts_at !== "string") return null;
    return p;
  } catch {
    return null;
  }
}

export async function listMeetingsHandler(
  supabase: SB,
  ctx: HandlerCtx,
  q: ListMeetingsQuery,
): Promise<ListMeetingsResult> {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);

  // Mesmo motivo de listLeadsHandler: filtro de organização é a PRIMEIRA
  // cláusula — pelo MCP (se este handler algum dia servir o MCP) o client
  // pode ser service-role e a RLS não vale sozinha.
  let query = supabase
    .from("crm_meetings")
    .select(MEETING_COLS)
    .eq("organization_id", ctx.organization_id)
    .order("starts_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (q.lead_id) query = query.eq("lead_id", q.lead_id);
  if (q.status) query = query.eq("status", q.status);
  if (q.from) query = query.gte("starts_at", q.from);
  if (q.to) query = query.lte("starts_at", q.to);

  if (q.cursor) {
    const c = decCursor(q.cursor);
    if (!c) {
      throw new ApiError(400, "invalid_cursor", undefined, ctx.requestId, "Cursor inválido.");
    }
    query = query.or(`starts_at.gt.${c.starts_at},and(starts_at.eq.${c.starts_at},id.gt.${c.id})`);
  }

  const { data, error } = await query;
  if (error) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const cursor =
    hasMore && last ? encCursor({ starts_at: String(last.starts_at), id: String(last.id) }) : null;
  return { meetings: page, cursor, has_more: hasMore };
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export async function createMeetingHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: CreateMeetingInput,
): Promise<Record<string, unknown>> {
  // crm_meetings.contact_id é NOT NULL (0167): a UI oferece um lead, o
  // handler deriva o contato dele. Lead sem contato vinculado não tem onde a
  // reunião "morar" — 422, não adivinhação.
  const { data: lead, error: leadErr } = await supabase
    .from("crm_leads")
    .select("id, organization_id, contact_id, title")
    .eq("id", input.lead_id)
    .maybeSingle();
  if (leadErr) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, leadErr.message);
  }
  if (!lead || lead.organization_id !== ctx.organization_id) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId, "Lead não encontrado.");
  }
  if (!lead.contact_id) {
    throw new ApiError(
      422,
      "lead_without_contact",
      undefined,
      ctx.requestId,
      "Este lead não tem um contato vinculado — não é possível marcar reunião sem um contato.",
    );
  }

  const { data: meeting, error: insErr } = await supabase
    .from("crm_meetings")
    .insert({
      organization_id: ctx.organization_id,
      contact_id: lead.contact_id,
      lead_id: lead.id,
      title: input.title ?? null,
      starts_at: input.starts_at,
      ends_at: input.ends_at ?? null,
      modality: input.modality,
      meeting_link: input.meeting_link ?? null,
      location: input.location ?? null,
      notes: input.notes ?? null,
      assigned_to: input.assigned_to ?? null,
      source: "manual",
      created_by: ctx.actor.type === "user" ? ctx.actor.id : null,
    })
    .select(MEETING_COLS)
    .single();
  if (insErr || !meeting) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, insErr?.message ?? "Falha ao marcar reunião.");
  }
  const meetingId = (meeting as { id: string }).id;

  // A REUNIÃO ENTRA NA TIMELINE DO NEGÓCIO — mesmo critério de lead_edited/
  // stage_changed: muda o que alguém faria a seguir, então é acontecimento.
  const atividade = await emitLeadActivity(supabase, {
    organizationId: ctx.organization_id,
    leadId: lead.id,
    contactId: lead.contact_id,
    type: "meeting_scheduled",
    sourceModule: "crm_meetings",
    sourceId: meetingId,
    actor: ctx.actor,
    reason: input.title ? `Reunião marcada — ${input.title}` : "Reunião marcada",
    payload: { starts_at: input.starts_at, modality: input.modality },
  });
  if (!atividade.ok) {
    // Falha BAIXO (mesma doutrina de lead_edited): a reunião já existe, e
    // bloquear a resposta deixaria o usuário sem confirmação por causa de uma
    // linha de timeline. Fica só no console/Sentry via audit de falha aqui.
    console.error("[meeting.create] emitLeadActivity failed", atividade.error);
  }

  // Aviso ao dono é side effect não-crítico (notifyOwnerWhatsApp já engole os
  // próprios erros) — nunca bloqueia nem falha a criação da reunião.
  await notifyOwnerWhatsApp(
    ctx.organization_id,
    `Reunião marcada${input.title ? ` — ${input.title}` : ""} para ${new Date(input.starts_at).toISOString()} (UTC).`,
  );

  const a = actorAuditPayload(ctx.actor);
  await audit({
    action: "meeting.scheduled",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "crm_meeting",
    resourceId: meetingId,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, lead_id: lead.id, starts_at: input.starts_at },
  });

  return meeting as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

export async function updateMeetingHandler(
  supabase: SB,
  ctx: HandlerCtx,
  meetingId: string,
  input: UpdateMeetingInput,
): Promise<Record<string, unknown>> {
  const { data: existing, error: selErr } = await supabase
    .from("crm_meetings")
    .select("*")
    .eq("organization_id", ctx.organization_id)
    .eq("id", meetingId)
    .maybeSingle();
  if (selErr) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, selErr.message);
  }
  if (!existing) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId, "Reunião não encontrada.");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) patch.title = input.title;
  if (input.starts_at !== undefined) patch.starts_at = input.starts_at;
  if (input.ends_at !== undefined) patch.ends_at = input.ends_at;
  if (input.modality !== undefined) patch.modality = input.modality;
  if (input.meeting_link !== undefined) patch.meeting_link = input.meeting_link;
  if (input.location !== undefined) patch.location = input.location;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.outcome_notes !== undefined) patch.outcome_notes = input.outcome_notes;
  if (input.status !== undefined) patch.status = input.status;
  if (input.assigned_to !== undefined) patch.assigned_to = input.assigned_to;

  const { data: updated, error: updErr } = await supabase
    .from("crm_meetings")
    .update(patch)
    .eq("organization_id", ctx.organization_id)
    .eq("id", meetingId)
    .select(MEETING_COLS)
    .maybeSingle();
  if (updErr) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, updErr.message);
  }
  if (!updated) {
    throw new ApiError(404, "not_found", undefined, ctx.requestId, "Reunião não encontrada.");
  }

  const becameCancelled = input.status === "cancelada" && existing.status !== "cancelada";
  if (becameCancelled && existing.lead_id) {
    const atividade = await emitLeadActivity(supabase, {
      organizationId: ctx.organization_id,
      leadId: existing.lead_id as string,
      contactId: (existing.contact_id as string | null) ?? null,
      type: "meeting_cancelled",
      sourceModule: "crm_meetings",
      sourceId: meetingId,
      actor: ctx.actor,
      reason: "Reunião cancelada",
      payload: {},
    });
    if (!atividade.ok) {
      console.error("[meeting.update] emitLeadActivity failed", atividade.error);
    }
  }

  const a = actorAuditPayload(ctx.actor);
  await audit({
    action: becameCancelled ? "meeting.cancelled" : "meeting.updated",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "crm_meeting",
    resourceId: meetingId,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return updated as Record<string, unknown>;
}
