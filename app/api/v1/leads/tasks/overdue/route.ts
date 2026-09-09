/**
 * GET /api/v1/leads/tasks/overdue — tarefas leves atrasadas da org inteira
 * (migration 0211), para a seção nova do Radar.
 *
 * Deliberadamente uma lista SEPARADA de `lib/leads/radar-de-risco.ts`: não
 * mexe no critério de "esfriou" que já existe e é testado — atraso de tarefa
 * é outro sinal, sobre outra coisa (um compromisso que alguém assumiu, não o
 * silêncio do negócio). Client de sessão: a RLS de `crm_lead_tasks` (EXISTS +
 * `fn_can_view_lead`) já escopa certo, sem precisar de admin client.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export interface TarefaAtrasada {
  id: string;
  lead_id: string;
  lead_title: string;
  pipeline_id: string | null;
  title: string;
  due_at: string;
  type: string;
}

interface LeadEmbed {
  title: string;
  pipeline_id: string;
}

interface Row {
  id: string;
  lead_id: string;
  title: string;
  due_at: string;
  type: string;
  crm_leads: LeadEmbed | LeadEmbed[] | null;
}

function leadEmbutido(row: Row): LeadEmbed | null {
  return Array.isArray(row.crm_leads) ? (row.crm_leads[0] ?? null) : row.crm_leads;
}

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_tasks" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_lead_tasks")
    .select("id, lead_id, title, due_at, type, crm_leads:lead_id(title, pipeline_id)")
    .eq("organization_id", org.orgId)
    .eq("status", "pending")
    .lt("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rows = (data ?? []) as unknown as Row[];
  const items: TarefaAtrasada[] = rows.map((r) => {
    const lead = leadEmbutido(r);
    return {
      id: r.id,
      lead_id: r.lead_id,
      lead_title: lead?.title ?? "—",
      pipeline_id: lead?.pipeline_id ?? null,
      title: r.title,
      due_at: r.due_at,
      type: r.type,
    };
  });

  return ok({ items, total: items.length }, { requestId });
}
