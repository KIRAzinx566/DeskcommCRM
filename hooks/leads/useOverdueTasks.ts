"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { TarefaAtrasada } from "@/app/api/v1/leads/tasks/overdue/route";

export type { TarefaAtrasada } from "@/app/api/v1/leads/tasks/overdue/route";

/** Seção do Radar — tarefas leves atrasadas da org. Mesmo polling do radar de risco. */
export function useOverdueTasks() {
  return useQuery({
    queryKey: ["lead-tasks-overdue"],
    refetchInterval: 60_000,
    queryFn: () =>
      apiClient
        .get<{ data: { items: TarefaAtrasada[]; total: number } }>("/api/v1/leads/tasks/overdue")
        .then((r) => r.data),
  });
}
