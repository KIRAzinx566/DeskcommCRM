/**
 * GET/POST /api/v1/cron/sync-model-catalog-nvidia — o catálogo da NVIDIA que
 * se atualiza sozinho.
 *
 * Mesmo desenho do `sync-model-catalog` (OpenRouter) — arquivo irmão, não
 * generalização: as duas origens têm formas de resposta diferentes
 * (`ModeloDaOpenRouter` × `ModeloDaNvidia`) e a tradução de cada uma vive no
 * seu próprio módulo em `lib/ai/catalogo/`. A REGRA da conciliação
 * (`planejarSincronizacao`) é a mesma função pura das duas — só o I/O daqui
 * muda.
 *
 * `GET /v1/models` da NVIDIA (build.nvidia.com) é público, sem chave, como o
 * da OpenRouter — testado direto: responde 200 e lista os modelos sem
 * `Authorization`.
 *
 * Auth: mesmo contrato dos demais crons (Bearer `INTERNAL_CRON_SECRET` |
 * `INTERNAL_SECRET`, fail-closed).
 *
 * NOTA DE DEPLOY: agendamento no serviço `scheduler` do
 * `docker-compose.prod.yml`, junto do `sync-model-catalog`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import {
  FONTE_NVIDIA,
  traduzirCatalogoNvidia,
  type ModeloDaNvidia,
} from "@/lib/ai/catalogo/nvidia";
import {
  CatalogoSuspeitoError,
  planejarSincronizacao,
  type ModeloExistente,
} from "@/lib/ai/catalogo/sincronizar";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ENDPOINT_DO_CATALOGO = "https://integrate.api.nvidia.com/v1/models";
const TIMEOUT_MS = 20_000;

export interface ResultadoDaSincronizacaoNvidia {
  fonte: string;
  recebidos: number;
  gravados: number;
  depreciados: number;
  ressuscitados: number;
}

/**
 * Separado do handler para o teste exercitar a REGRA sem montar request/auth —
 * mesmo padrão do irmão OpenRouter.
 */
export async function sincronizarCatalogoNvidia(
  admin: ReturnType<typeof createAdminClient>,
  buscar: () => Promise<ModeloDaNvidia[]>,
): Promise<ResultadoDaSincronizacaoNvidia> {
  const daOrigem = traduzirCatalogoNvidia(await buscar());

  const { data: existentes, error: erroLeitura } = await admin
    .from("ai_models")
    .select("model_id, deprecated_at")
    .eq("source", FONTE_NVIDIA);
  if (erroLeitura) throw new Error(`catalogo_leitura_falhou: ${erroLeitura.message}`);

  const plano = planejarSincronizacao(daOrigem, (existentes ?? []) as ModeloExistente[]);

  const agora = new Date().toISOString();

  if (plano.paraGravar.length > 0) {
    const { error } = await admin.from("ai_models").upsert(
      plano.paraGravar.map((l) => ({ ...l, synced_at: agora, deprecated_at: null })),
      { onConflict: "provider,model_id" },
    );
    if (error) throw new Error(`catalogo_upsert_falhou: ${error.message}`);
  }

  if (plano.paraDepreciar.length > 0) {
    const { error } = await admin
      .from("ai_models")
      .update({ deprecated_at: agora })
      .eq("source", FONTE_NVIDIA)
      .in("model_id", plano.paraDepreciar);
    if (error) throw new Error(`catalogo_depreciacao_falhou: ${error.message}`);
  }

  return {
    fonte: FONTE_NVIDIA,
    recebidos: daOrigem.length,
    gravados: plano.paraGravar.length,
    depreciados: plano.paraDepreciar.length,
    ressuscitados: plano.paraRessuscitar.length,
  };
}

async function buscarDaNvidia(): Promise<ModeloDaNvidia[]> {
  const res = await fetch(ENDPOINT_DO_CATALOGO, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`catalogo_origem_status_${res.status}`);
  const json = (await res.json()) as { data?: ModeloDaNvidia[] };
  if (!Array.isArray(json.data)) {
    throw new Error("catalogo_origem_shape_inesperado — a resposta não trouxe `data` como lista");
  }
  return json.data;
}

function autorizado(req: NextRequest): boolean {
  const esperado = env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET;
  if (!esperado) return false; // fail-closed
  return req.headers.get("authorization") === `Bearer ${esperado}`;
}

async function handler(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizado(req)) {
    return fail("unauthorized", "cron secret ausente ou inválido", 401, { requestId });
  }
  try {
    const resultado = await sincronizarCatalogoNvidia(createAdminClient(), buscarDaNvidia);
    logger.info("[sync-model-catalog-nvidia] concluído", { ...resultado, request_id: requestId });
    return ok(resultado, { requestId });
  } catch (err) {
    if (err instanceof CatalogoSuspeitoError) {
      logger.warn("[sync-model-catalog-nvidia] rodada recusada pelo piso de sanidade", {
        recebidos: err.recebidos,
        conhecidos: err.conhecidos,
        request_id: requestId,
      });
      return ok(
        { fonte: FONTE_NVIDIA, recusado: true, motivo: err.message },
        { requestId },
      );
    }
    const detalhe = err instanceof Error ? err.message : String(err);
    logger.error("[sync-model-catalog-nvidia] falhou", { error: detalhe, request_id: requestId });
    return fail("cron_failed", detalhe, 500, { requestId });
  }
}

export const GET = handler;
export const POST = handler;
