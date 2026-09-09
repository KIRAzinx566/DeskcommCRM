/**
 * Tarefa leve com prazo por lead (`crm_lead_tasks`, migration 0211) — regras
 * puras, sem banco.
 *
 * Deliberadamente mais simples que `calendar_appointments`: sem hora marcada,
 * sem fuso, sem sincronização — só "o que fazer" e "até quando".
 */

export const TASK_TYPES = ["call", "whatsapp_message", "meeting", "follow_up", "other"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["pending", "done", "dismissed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface LeadTask {
  id: string;
  lead_id: string;
  type: TaskType;
  title: string;
  due_at: string;
  status: TaskStatus;
  owner_user_id: string | null;
  created_by_user_id: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A tarefa que o card/badge mostra: a PENDENTE de prazo mais próximo.
 *
 * Pode haver várias pendentes por lead — a UI nunca soma nem empilha, sempre
 * mostra uma só, a mais urgente. `null` quando não há nenhuma pendente (feita,
 * descartada, ou nunca criada — os três são "nada a mostrar aqui").
 */
export function escolherTarefaMaisProxima<T extends { due_at: string; status: string }>(
  tarefas: T[],
): T | null {
  let escolhida: T | null = null;
  for (const t of tarefas) {
    if (t.status !== "pending") continue;
    if (!escolhida || new Date(t.due_at).getTime() < new Date(escolhida.due_at).getTime()) {
      escolhida = t;
    }
  }
  return escolhida;
}

/** Atrasada = pendente com prazo no passado. Feita/descartada nunca é "atrasada" — já foi decidida. */
export function estaAtrasada(tarefa: Pick<LeadTask, "status" | "due_at">, agora: Date = new Date()): boolean {
  return tarefa.status === "pending" && new Date(tarefa.due_at).getTime() < agora.getTime();
}
