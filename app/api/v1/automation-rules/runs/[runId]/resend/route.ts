import { requireSupportWrite } from "@/lib/impersonate/support";
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
 *
 * `call_webhook` especificamente preserva a MESMA ENTREGA (#1529): o id da
 * entrega é recalculado com a posição da ação na lista inteira da regra e
 * com a própria lista — igual ao do disparo original enquanto as ações não
 * mudarem; mudaram, sai um id novo, e nunca o de outra ação que o receptor já
 * processou —, o número da tentativa continua de onde os runs anteriores do
 * mesmo par (regra, evento) pararam, e o resultado aponta para o run clicado
 * em `detail.resent_from_run_id`.
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
// Side-effect: registra os executores. A generalização pra `getAction(action.type)`
// genérico depende do registro estar populado, e precisa do mesmo import que
// `engine.handler.ts` faz pro caminho de produção — esta rota não passa por ele.
import "@/lib/automation/actions/register-all";
import {
  executeCallWebhook,
  idDaEntrega,
  tentativasRegistradas,
} from "@/lib/automation/actions/call-webhook";
import { decidirRetomada } from "@/lib/automation/retomar";
import { agregarStatusDoRun } from "@/lib/automation/agregar-status";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ runId: string }>;
}

interface RuleAction {
  type: string;
  config?: Record<string, unknown>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { runId } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org: activeOrg } = authz;

  const supabase = await createClient();

  const { data: run, error: runErr } = await supabase
    .from("automation_rule_runs")
    .select("id, rule_id, event_id, actions_result")
    .eq("id", runId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (runErr) return fail("internal_error", runErr.message, 500, { requestId });
  if (!run) return fail("not_found", t("Run não encontrado."), 404, { requestId });

  if (!run.event_id) {
    return fail("event_gone", t("O evento original deste run foi removido."), 409, { requestId });
  }

  const { data: rule, error: ruleErr } = await supabase
    .from("automation_rules")
    .select("id, name, actions")
    .eq("id", run.rule_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (ruleErr) return fail("internal_error", ruleErr.message, 500, { requestId });
  if (!rule) return fail("not_found", t("Regra do run não encontrada."), 404, { requestId });

  const ruleActions = (rule.actions ?? []) as RuleAction[];
  const originalResults = (run.actions_result ?? []) as ActionResultDetail[];

  // `call_webhook` sai da conta de "só o que falhou": Reenviar existe para o
  // RECEPTOR receber de novo, e o receptor não sabe (nem importa) se o nosso
  // lado marcou sucesso — é o contrato de entrega do #1529. Por isso toda ação
  // deste tipo entra pela posição ATUAL da regra, sempre, mesmo quando a regra
  // mudou de tamanho: o id da entrega é recalculado da lista de hoje, e uma
  // ação removida nunca herda o id da que saiu (a que assume a posição ganha
  // id novo). As outras ações seguem a régua genérica — só failed/skipped, e só
  // quando dá para confiar no índice contra o resultado original.
  const indicesWebhookAtual = ruleActions
    .map((a, i) => (a.type === "call_webhook" ? i : -1))
    .filter((i) => i >= 0);

  const regraMudouDeTamanho = ruleActions.length !== originalResults.length;
  const decisaoGenerica = regraMudouDeTamanho
    ? null
    : decidirRetomada(ruleActions.length, originalResults);
  const indicesFalhosOuPulados = decisaoGenerica?.ok ? decisaoGenerica.indices : [];

  const indicesParaRetomar = [...new Set([...indicesFalhosOuPulados, ...indicesWebhookAtual])].sort(
    (a, b) => a - b,
  );

  if (indicesParaRetomar.length === 0) {
    if (regraMudouDeTamanho) {
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

  const { data: eventRow, error: eventErr } = await supabase
    .from("event_log")
    .select("*")
    .eq("id", run.event_id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (eventErr) return fail("internal_error", eventErr.message, 500, { requestId });
  if (!eventRow) {
    return fail("event_gone", t("O evento original deste run foi removido."), 409, { requestId });
  }

  const typedEvent = eventRow as unknown as EventRow;
  const context = await buildContext(supabase, typedEvent);

  // Todos os runs do par (regra, evento), não só o clicado: dois Reenviar
  // seguidos a partir do mesmo run original não podem repetir o Attempt de um
  // `call_webhook`. Dois cliques SIMULTÂNEOS ainda podem — leitura e escrita
  // sem trava —, e isso é aceitável: Attempt é informativo, a chave do
  // receptor é o Delivery.
  const { data: runsDoPar, error: runsErr } = await supabase
    .from("automation_rule_runs")
    .select("actions_result")
    .eq("organization_id", activeOrg.orgId)
    .eq("rule_id", rule.id)
    .eq("event_id", typedEvent.id);
  if (runsErr) return fail("internal_error", runsErr.message, 500, { requestId });

  // Admin real no ctx: mesmo motivo de sempre — algum executor decifra
  // segredo via RPC restrita a service_role (ex.: call_webhook usa
  // fn_decrypt_oauth), e o client de sessão falharia ali sem avisar que o
  // outbound saiu sem assinatura.
  //
  // Sem guarda separada de "nada a reenviar" aqui: `decidirRetomada` (acima)
  // já cobre isso de forma genérica (`no_actions_to_resend`) — a versão
  // anterior desta rota só sabia reenviar `call_webhook` e tinha uma guarda
  // duplicada checando só esse tipo; a generalização por índice a tornou
  // redundante e desatualizada (uma regra sem NENHUMA ação de nenhum tipo
  // também precisa cair em "não há o que retomar", não só sem webhook).
  const adminForActions = createAdminClient();
  const merged = [...originalResults];
  for (const i of indicesParaRetomar) {
    const action = ruleActions[i]!;
    const started_at = new Date().toISOString();
    const actionCtx: ActionCtx = {
      admin: adminForActions,
      organizationId: activeOrg.orgId,
      ruleId: rule.id,
      ruleName: (rule.name as string) ?? "Automação",
      event: typedEvent,
      context,
      requestId,
      actionIndex: i,
      ruleActions,
    };

    // `call_webhook` sai do executor genérico: só ele precisa preservar a
    // MESMA entrega (#1529) e continuar a contagem de tentativa a partir dos
    // runs anteriores do mesmo par (regra, evento) — nenhum outro tipo de
    // ação tem esse contrato de entrega com um receptor de fora.
    if (action.type === "call_webhook") {
      const entrega = idDaEntrega(typedEvent.id, rule.id, i, ruleActions);
      try {
        const resultado = await executeCallWebhook(actionCtx, action.config ?? {}, {
          primeiraTentativa: tentativasRegistradas(runsDoPar ?? [], entrega) + 1,
        });
        merged[i] = { ...resultado, detail: { ...resultado.detail, resent_from_run_id: runId } };
      } catch (err) {
        merged[i] = {
          type: action.type,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          started_at,
          finished_at: new Date().toISOString(),
        };
      }
      continue;
    }

    const executor = getAction(action.type);
    if (!executor) {
      merged[i] = { type: action.type, status: "failed", error: "unknown_action", started_at, finished_at: started_at };
      continue;
    }
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
