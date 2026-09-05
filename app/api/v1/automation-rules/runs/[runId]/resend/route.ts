/**
 * POST /api/v1/automation-rules/runs/[runId]/resend — RETOMA as ações que
 * falharam ou pularam neste run (qualquer tipo, não só `call_webhook`),
 * contra o evento original (`event_log` do run.event_id). As ações que já
 * tinham dado certo (ou que ficaram `postponed` — essas têm retry próprio
 * via reagendamento) ficam como estavam. Se o evento foi apagado (FK on
 * delete set null zera event_id) → 409 `event_gone`. Grava um run NOVO com
 * o resultado.
 *
 * Generalizado de uma versão anterior que só reenviava `call_webhook` — e
 * TODAS as ações desse tipo, não só as que tinham falhado. Duas correções
 * no mesmo PR: por tipo→por índice, e "todas"→"só as que falharam/pularam".
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildContext } from "@/lib/automation/engine";
import { getAction } from "@/lib/automation/actions";
// Side-effect: registra os executores. A versão anterior desta rota importava
// `executeCallWebhook` direto (sem passar pelo registro); a generalização
// pra `getAction(action.type)` genérico passou a depender do registro estar
// populado, e precisa do mesmo import que `engine.handler.ts` faz pro
// caminho de produção — esta rota não passa por ele.
import "@/lib/automation/actions/register-all";
import { decidirRetomada } from "@/lib/automation/retomar";
import { agregarStatusDoRun } from "@/lib/automation/agregar-status";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import type { EventRow } from "@/lib/event-log/dispatcher";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ runId: string }>;
}

interface RuleAction {
  type: string;
  config?: Record<string, unknown>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { runId } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const { user, org: activeOrg } = authz;

  const supabase = await createClient();

  const { data: run, error: runErr } = await supabase
    .from("automation_rule_runs")
    .select("id, rule_id, event_id, actions_result")
    .eq("id", runId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (runErr) return fail("internal_error", runErr.message, 500, { requestId });
  if (!run) return fail("not_found", "Run não encontrado.", 404, { requestId });

  if (!run.event_id) {
    return fail("event_gone", "O evento original deste run foi removido.", 409, { requestId });
  }

  const { data: rule, error: ruleErr } = await supabase
    .from("automation_rules")
    .select("id, name, actions")
    .eq("id", run.rule_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (ruleErr) return fail("internal_error", ruleErr.message, 500, { requestId });
  if (!rule) return fail("not_found", "Regra do run não encontrada.", 404, { requestId });

  const ruleActions = (rule.actions ?? []) as RuleAction[];
  const originalResults = (run.actions_result ?? []) as ActionResultDetail[];

  const decisao = decidirRetomada(ruleActions.length, originalResults);
  if (!decisao.ok) {
    if (decisao.codigo === "rule_changed") {
      return fail(
        "rule_changed",
        "Esta automação mudou desde essa execução — não dá para retomar com segurança. Rode a regra de novo (ou teste-a) para gerar um run atual.",
        409,
        { requestId },
      );
    }
    return fail(
      "no_actions_to_resend",
      "Nenhuma ação deste run falhou ou foi pulada — não há o que retomar.",
      409,
      { requestId },
    );
  }
  const indicesParaRetomar = decisao.indices;

  const { data: eventRow, error: eventErr } = await supabase
    .from("event_log")
    .select("*")
    .eq("id", run.event_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (eventErr) return fail("internal_error", eventErr.message, 500, { requestId });
  if (!eventRow) {
    return fail("event_gone", "O evento original deste run foi removido.", 409, { requestId });
  }

  const typedEvent = eventRow as unknown as EventRow;
  const context = await buildContext(supabase, typedEvent);

  // Admin real no ctx: mesmo motivo de sempre — algum executor decifra
  // segredo via RPC restrita a service_role (ex.: call_webhook), e o client
  // de sessão falharia ali sem avisar que o outbound saiu sem assinatura.
  const adminForActions = createAdminClient();
  const merged = [...originalResults];
  for (const i of indicesParaRetomar) {
    const action = ruleActions[i]!;
    const executor = getAction(action.type);
    const started_at = new Date().toISOString();
    if (!executor) {
      merged[i] = { type: action.type, status: "failed", error: "unknown_action", started_at, finished_at: started_at };
      continue;
    }
    const actionCtx: ActionCtx = {
      admin: adminForActions,
      organizationId: activeOrg.orgId,
      ruleId: rule.id,
      ruleName: (rule.name as string) ?? "Automação",
      event: typedEvent,
      context,
      requestId,
    };
    try {
      const result = await executor.execute(actionCtx, action.config ?? {});
      merged[i] = { ...result, started_at, finished_at: new Date().toISOString() };
    } catch (err) {
      merged[i] = {
        type: action.type,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        started_at,
        finished_at: new Date().toISOString(),
      };
    }
  }

  const status = agregarStatusDoRun(merged);

  // RLS: automation_rule_runs é select-only p/ authenticated (escrita é do
  // service_role, como no engine).
  const admin = createAdminClient();
  const { data: newRun, error: insErr } = await admin
    .from("automation_rule_runs")
    .insert({
      organization_id: activeOrg.orgId,
      rule_id: rule.id,
      event_id: typedEvent.id,
      status,
      actions_result: merged,
    })
    .select("*")
    .single();
  if (insErr || !newRun) {
    return fail("internal_error", insErr?.message ?? "run_insert_failed", 500, { requestId });
  }

  void audit({
    action: "automation.run_resent",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "automation_rule_run",
    resourceId: newRun.id,
    requestId,
    metadata: { original_run_id: runId, rule_id: rule.id, retried_indices: indicesParaRetomar },
  });

  return ok(newRun, { requestId, status: 201 });
}
