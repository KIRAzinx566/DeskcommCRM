"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface CsatRecente {
  id: string;
  contato: string;
  nota: number | null;
  resposta: string | null;
  respondida_em: string | null;
}

export interface CsatMetrics {
  window: { from: string; to: string };
  enviadas: number;
  respondidas: number;
  media_nota: number | null;
  recentes: CsatRecente[];
}

/** Resumo de CSAT dos últimos 30 dias — ver app/api/v1/metrics/csat/route.ts. */
export function useCsatMetrics() {
  return useQuery({
    queryKey: ["metrics", "csat"],
    queryFn: async () => apiClient.get<{ data: CsatMetrics }>("/api/v1/metrics/csat"),
    staleTime: 30_000,
  });
}
