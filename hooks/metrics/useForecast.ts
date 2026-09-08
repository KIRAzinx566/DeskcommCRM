"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface PrevisaoPorEtapa {
  stage_id: string;
  stage_name: string;
  bruto_cents: number;
  ponderado_cents: number | null;
  probabilidade: number | null;
}

export interface PrevisaoPorPipeline {
  pipeline_id: string;
  pipeline_name: string;
  etapas: PrevisaoPorEtapa[];
  bruto_cents: number;
  ponderado_cents: number;
}

export interface Forecast {
  bruto_cents: number;
  ponderado_cents: number;
  por_pipeline: PrevisaoPorPipeline[];
}

/** manager+ (mesmo piso da rota) — a tela só chama isto quando `canCompare` já é true. */
export function useForecast(enabled: boolean) {
  return useQuery({
    queryKey: ["metrics", "forecast"],
    queryFn: async () => apiClient.get<{ data: Forecast }>("/api/v1/metrics/forecast"),
    staleTime: 30_000,
    enabled,
  });
}
