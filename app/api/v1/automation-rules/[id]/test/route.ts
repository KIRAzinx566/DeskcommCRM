/**
 * GET  /api/v1/automation-rules/[id]/test — lista eventos recentes do tenant
 *      compatíveis com o `trigger_event` da regra, pra popular o seletor do
 *      botão "Testar".
 * POST /api/v1/automation-rules/[id]/test — roda a regra em modo simulado
 *      (`dryRunAutomationRule`) contra um evento real já existente
 *      (`{ event_id }` no body). Nunca grava `automation_rule_runs`, nunca
 *      executa ação de verdade — ver o cabeçalho de `lib/automation/engine.ts`.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { dryRunAutomationRule, type RuleRow } from "@/lib/automation/engine";
// Side-effect: registra os executores (add_tag, call_webhook, ...) e seus
// `simulate()` — sem isto `getAction()` devolve undefined pra QUALQUER tipo,
// e todo teste cai no fallback "ação desconhecida". Mesmo import que
// `lib/automation/engine.handler.ts` faz pro caminho de produção; esta rota
// não passa por ele, então precisa do próprio.
import "@/lib/automation/actions/register-all";
import type { EventRow } from "@/lib/event-log/dispatcher";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const testBodySchema = z.object({ event_id: z.string().uuid() });

type RuleComTrigger = RuleRow & { trigger_event: string };

async function fetchRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  orgId: string,
): Promise<RuleComTrigger | null> {
  const { data } = await supabase
    .from("automation_rules")
    .select("id, name, trigger_event, conditions, actions")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data as unknown as RuleComTrigger) ?? null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const supabase = await createClient();
  const rule = await fetchRule(supabase, id, activeOrg.orgId);
  if (!rule) return fail("not_found", "Regra não encontrada.", 404, { requestId });

  // Últimos 20 eventos do MESMO trigger_event — é o universo contra o qual a
  // regra realmente decidiria algo. Eventos de outro tipo nunca casariam
  // mesmo, e listá-los só confundiria o seletor.
  const { data: events, error } = await supabase
    .from("event_log")
    .select("id, event_type, entity_kind, entity_id, created_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("event_type", rule.trigger_event)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok({ events: events ?? [] }, { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = testBodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("invalid_request", "Informe event_id.", 400, { requestId, details: parsed.error.flatten() });
  }

  const supabase = await createClient();
  const rule = await fetchRule(supabase, id, activeOrg.orgId);
  if (!rule) return fail("not_found", "Regra não encontrada.", 404, { requestId });

  const { data: eventRow, error: eventErr } = await supabase
    .from("event_log")
    .select("*")
    .eq("id", parsed.data.event_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (eventErr) return fail("internal_error", eventErr.message, 500, { requestId });
  if (!eventRow) return fail("not_found", "Evento não encontrado.", 404, { requestId });

  const resultado = await dryRunAutomationRule(supabase, rule, eventRow as unknown as EventRow);
  return ok(resultado, { requestId });
}
