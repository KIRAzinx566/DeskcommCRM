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
  admin: SupabaseClient;
  organizationId: string;
  ruleId: string;
  /** Nome da regra como o operador a nomeou — entra nos avisos que ele lê. */
  ruleName: string;
  event: EventRow;
  context: Record<string, unknown>; // mesmo objeto avaliado pelas condições
  requestId: string;
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
