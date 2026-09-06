"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { TaskStatus, TaskType } from "@/lib/leads/lead-tasks";

export interface LeadTaskDTO {
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

const rota = (leadId: string) => `/api/v1/leads/${encodeURIComponent(leadId)}/tasks`;
const daTarefa = (leadId: string, taskId: string) => `${rota(leadId)}/${encodeURIComponent(taskId)}`;
const chave = (leadId: string) => ["lead-tasks", leadId] as const;

export function useLeadTasks(leadId: string | null) {
  return useQuery({
    queryKey: chave(leadId ?? ""),
    queryFn: async () =>
      apiClient
        .get<{ data: { tasks: LeadTaskDTO[] } }>(rota(leadId as string))
        .then((r) => r.data.tasks),
    enabled: !!leadId,
  });
}

export interface NovaTarefa {
  type: TaskType;
  title: string;
  due_at: string;
  owner_user_id?: string | null;
}

/**
 * `pipelineId` é opcional (o dossiê às vezes abre fora de um board — ex.:
 * futura tela de contato), mas QUANDO existe, invalida `["board", pipelineId]`
 * junto: o card do Kanban mostra a tarefa mais próxima (`next_task`), e sem
 * isto o badge só apareceria depois de um F5 — o mesmo cuidado que
 * `useCreateLead`/`useUpdateLead` já tomam para o board refletir a escrita.
 */
export function useCriarTarefa(leadId: string, pipelineId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NovaTarefa) =>
      apiClient.post<{ data: { task: LeadTaskDTO } }>(rota(leadId), input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chave(leadId) });
      if (pipelineId) void qc.invalidateQueries({ queryKey: ["board", pipelineId] });
    },
  });
}

export interface PatchDeTarefa {
  status?: TaskStatus;
  title?: string;
  due_at?: string;
}

export function usePatchTarefa(leadId: string, pipelineId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: PatchDeTarefa }) =>
      apiClient.patch<{ data: { task: LeadTaskDTO } }>(daTarefa(leadId, taskId), patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chave(leadId) });
      if (pipelineId) void qc.invalidateQueries({ queryKey: ["board", pipelineId] });
    },
  });
}
