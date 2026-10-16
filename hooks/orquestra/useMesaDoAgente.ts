"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { MesaDoAgente } from "@/lib/orquestra/agente";

/**
 * A mesa do agente selecionado no Mundo (`/api/v1/orquestra/agentes/:id`).
 * Mais curta que os 20s do painel: quem abriu a mesa está comandando, e uma
 * conversa que acabou de ser assumida precisa aparecer assim.
 */
export function useMesaDoAgente(agenteId: string | null) {
  return useQuery({
    queryKey: ["orquestra", "mesa", agenteId],
    enabled: agenteId !== null,
    queryFn: async () => (await apiClient.get<{ data: MesaDoAgente }>(`/api/v1/orquestra/agentes/${agenteId}`)).data,
    refetchInterval: 10_000,
  });
}

/**
 * Pausa ou retoma o automático de agentes — o mesmo `PATCH paused_at` do
 * cartão "Operação do agente" (`AgentOperation.tsx`), em lote para o botão
 * "Pausar todos". Em lote, um que falhe não esconde os outros: a falha volta
 * no erro, e o painel é relido de qualquer jeito.
 */
export function usePausarAgentes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, pausar }: { ids: string[]; pausar: boolean }) => {
      const resultados = await Promise.allSettled(
        ids.map((id) => apiClient.patch(`/api/v1/ai/agents/${id}`, { paused_at: pausar ? new Date().toISOString() : null })),
      );
      const falha = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (falha) throw falha.reason;
    },
    onError: (err) => showApiError(err),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["orquestra", "painel"] });
      qc.invalidateQueries({ queryKey: ["ai", "agents"] });
    },
  });
}
