import type { ServiceBoundary } from "@/lib/atendimento/fronteira";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow } from "@/lib/event-log/dispatcher";

export interface ActionResultDetail {
  type: string;
  status: "success" | "failed" | "skipped" | "postponed";
  error?: string;
  detail?: Record<string, unknown>;
  /** Quando a ação rodou de verdade (não em `simulate`) — ISO. Par com `finished_at`, vira duração por passo na Central de atividade. */
  started_at?: string;
  finished_at?: string;
}

export interface ActionCtx {
  /** Privado à execução: nunca vem do payload nem do contexto de condições. */
  serviceBoundaries?: Map<string, Promise<ServiceBoundary>>;
  admin: SupabaseClient;
  organizationId: string;
  ruleId: string;
  /** Nome da regra como o operador a nomeou — entra nos avisos que ele lê. */
  ruleName: string;
  event: EventRow;
  context: Record<string, unknown>; // mesmo objeto avaliado pelas condições
  requestId: string;
  /**
   * Posição da ação em `rule.actions` (a lista inteira, não uma filtrada). Compõe
   * o id da entrega do webhook de saída (#1529). Opcional porque as fixtures de
   * teste montam `ActionCtx` sem ela; o motor e o Reenviar sempre a passam.
   */
  actionIndex?: number;
  /**
   * A lista inteira `rule.actions`, como gravada. Também compõe o id da entrega
   * (#1529): sem ela, depois de uma ação removida outra herdaria a posição e o
   * id. Opcional pelo mesmo motivo de `actionIndex`.
   */
  ruleActions?: ReadonlyArray<{ type: string; config?: Record<string, unknown> }>;
}

export interface ActionExecutor {
  type: string;
  /** Pré-checagem opcional: se retornar um ISO timestamp, o EVENTO INTEIRO é
   *  adiado para essa hora ANTES de qualquer ação executar (all-or-nothing —
   *  evita reexecução parcial no retry). Usada pelo throttle do WhatsApp. */
  postponeUntil?(ctx: ActionCtx, config: Record<string, unknown>): Promise<string | null>;
  execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail>;
  /**
   * Descreve o que ACONTECERIA sem fazer nada de verdade — zero linha
   * gravada, zero HTTP de saída, zero mensagem enviada. Usada pelo "Testar"
   * do editor de regras (`dryRunAutomationRule`). Executor sem `simulate`
   * cai no fallback genérico do motor (`skipped`, `detail.simulated: true`)
   * — nunca roda `execute` de verdade num teste por engano (falha fechado).
   */
  simulate?(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail>;
}
