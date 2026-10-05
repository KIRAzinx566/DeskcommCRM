/**
 * A SELEÇÃO ATUAL DO CANAL DIRETO — qual agente o dono está corrigindo agora.
 *
 * Persistida em `config_aviso_de_caso.canal_direto_agente_id`/
 * `canal_direto_selecionado_em`. A escrita é um UPDATE direto pelo client
 * ADMIN (service_role) — não passa pelo RPC `fn_definir_aviso_de_caso`, que
 * recusa quando `auth.uid()` é nulo. A autorização aqui já foi provada por
 * POSSE DO TELEFONE cadastrado (quem chega a esta função já passou pelo corte
 * de `ehNumeroInternoDeAviso` com `canal_direto_ligado = true`), não por
 * sessão logada.
 *
 * TTL em CÓDIGO, nunca em CHECK do banco: comparar com `now()` em CHECK é
 * instável entre réplicas e no `pg_dump` (doutrina de migrations).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** 2h — correção pedida de manhã não deve valer para uma mensagem solta à noite sobre outro agente. */
export const TTL_DA_SELECAO_MS = 2 * 60 * 60 * 1000;

export interface SelecaoAtual {
  agenteId: string;
  valida: boolean;
}

/** `null` = nenhuma seleção gravada ainda. `valida: false` = expirou pelo TTL. */
export function avaliarSelecao(
  agenteId: string | null,
  selecionadoEm: string | null,
): SelecaoAtual | null {
  if (!agenteId) return null;
  if (!selecionadoEm) return { agenteId, valida: true };
  const idade = Date.now() - new Date(selecionadoEm).getTime();
  return { agenteId, valida: idade < TTL_DA_SELECAO_MS };
}

export async function definirSelecao(
  admin: SupabaseClient,
  organizationId: string,
  agentId: string,
): Promise<void> {
  const { error } = await admin
    .from("config_aviso_de_caso")
    .update({ canal_direto_agente_id: agentId, canal_direto_selecionado_em: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}
