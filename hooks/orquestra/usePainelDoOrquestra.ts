"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { PainelDoOrquestra, PeriodoDoPainel } from "@/lib/orquestra/painel";

/**
 * A foto do momento da operação (`/api/v1/orquestra/painel`). Relida a cada 20s:
 * é o mesmo ritmo do painel original do Orquestra, e o Mundo dos agentes vive
 * dela — mais rápido que isso só gastaria consulta para desenhar o mesmo quadro.
 */
export function usePainelDoOrquestra(periodo: PeriodoDoPainel) {
  return useQuery({
    queryKey: ["orquestra", "painel", periodo],
    queryFn: async () => (await apiClient.get<{ data: PainelDoOrquestra }>(`/api/v1/orquestra/painel?periodo=${periodo}`)).data,
    refetchInterval: 20_000,
    staleTime: 10_000,
  });
}
