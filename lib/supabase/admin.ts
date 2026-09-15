/**
 * Supabase admin client (service role). BYPASSA RLS.
 *
 * REGRA CRÍTICA: handlers que usam este client DEVEM filtrar `organization_id`
 * manualmente, resolvido de fonte confiável (cookie, JWT validado, webhook
 * secret, path token) — NUNCA do request body.
 *
 * Uso permitido:
 *  - Webhook handlers (WAHA, Nuvemshop)
 *  - Cron / workers
 *  - Onboarding / admin operations explícitas
 *  - Health check (read-only)
 *
 * Uso PROIBIDO:
 *  - Qualquer rota acionada por usuário final em fluxo normal
 *  - Substituir auth por conveniência
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * NUNCA memoize este client num singleton de módulo — já foi `let _admin` com
 * cache, e isso travou de verdade em produção: `/api/v1/system/agent` (cron a
 * cada 5 min) errou "Gateway Timeout" em 100% das chamadas por horas, mesmo
 * LOGO DEPOIS de um restart do container. Um `fetch()` cru no mesmo processo
 * (o health check) continuava respondendo normalmente o tempo todo — só o
 * client cacheado ficava preso, o que aponta pro OBJETO em si (algum estado
 * interno do `@supabase/supabase-js` que uma rede ruim deixa travado e nunca
 * mais solta), não para o processo Node ou o pool de conexão dele.
 *
 * Construir o client é barato (é só um wrapper sobre `fetch`, sem handshake
 * nem pool próprio) — cachear aqui nunca comprou desempenho real, só o risco
 * de um cliente travado sobreviver para sempre até o próximo restart.
 */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "deskcomm-crm/admin",
      },
    },
  });
}
