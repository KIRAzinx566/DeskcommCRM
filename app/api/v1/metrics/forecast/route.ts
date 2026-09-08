/**
 * GET /api/v1/metrics/forecast — previsão de receita por etapa, em TODOS os
 * funis da org (Odoo-style). Bruto (soma direta de `value_cents`) e ponderado
 * (× probabilidade de fechar, `crm_stages.win_probability`, migration 0210).
 *
 * Cálculo puro em `lib/kanban/previsao.ts` — aqui só há leitura e transporte.
 * Piso manager+: mesma régua de `/api/v1/pipelines` (é visão agregada entre
 * funis, não o card individual que o agent já vê no próprio Kanban).
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { previsaoPorEtapa } from "@/lib/kanban/previsao";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "metrics_forecast" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const supabase = await createClient();

  const [
    { data: pipelines, error: pipeErr },
    { data: stages, error: stagesErr },
    { data: leads, error: leadsErr },
  ] = await Promise.all([
    supabase
      .from("crm_pipelines")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_archived", false),
    supabase.from("crm_stages").select("*").eq("organization_id", orgId).eq("is_archived", false),
    supabase.from("crm_leads").select("*").eq("organization_id", orgId).neq("status", "archived"),
  ]);

  if (pipeErr) return fail("internal_error", pipeErr.message, 500, { requestId });
  if (stagesErr) return fail("internal_error", stagesErr.message, 500, { requestId });
  if (leadsErr) return fail("internal_error", leadsErr.message, 500, { requestId });

  const todasEtapas = (stages ?? []) as unknown as Stage[];
  const todosLeads = (leads ?? []) as unknown as Lead[];
  const nomePorPipeline = new Map((pipelines ?? []).map((p) => [p.id as string, p.name as string]));

  const previsao = previsaoPorEtapa(todosLeads, todasEtapas);
  const etapaPorId = new Map(todasEtapas.map((s) => [s.id, s]));

  return ok(
    {
      bruto_cents: previsao.bruto_cents,
      ponderado_cents: previsao.ponderado_cents,
      por_pipeline: (pipelines ?? []).map((p) => {
        const etapasDoFunil = previsao.porEtapa.filter(
          (e) => etapaPorId.get(e.stage_id)?.pipeline_id === p.id,
        );
        return {
          pipeline_id: p.id as string,
          pipeline_name: nomePorPipeline.get(p.id as string) ?? (p.name as string),
          etapas: etapasDoFunil,
          bruto_cents: etapasDoFunil.reduce((s, e) => s + e.bruto_cents, 0),
          ponderado_cents: etapasDoFunil.reduce((s, e) => s + (e.ponderado_cents ?? 0), 0),
        };
      }),
    },
    { requestId },
  );
}
