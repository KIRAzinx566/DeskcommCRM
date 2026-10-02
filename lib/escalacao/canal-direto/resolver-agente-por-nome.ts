/**
 * RESOLVE "#agente <nome>" PARA UM AGENTE DE VERDADE.
 *
 * Compara por normalização (trim + minúsculas + sem acento) contra
 * `ai_agents.name`, entre os agentes não-arquivados da organização. Aceita
 * match EXATO; sem exato, tenta SUBSTRING (o nome digitado está contido no
 * nome do agente, ou vice-versa) — "clínica" acha "Agente Clínica Bela Vista"
 * sem o dono precisar digitar o nome inteiro.
 *
 * Nunca inventa agente: devolve os nomes REAIS para a resposta montar a lista,
 * nunca um texto genérico.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AgenteCandidato {
  id: string;
  name: string;
}

export type ResultadoDaResolucao =
  | { status: "unico"; agente: AgenteCandidato }
  | { status: "nenhum" }
  | { status: "ambiguo"; candidatos: AgenteCandidato[] };

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function resolverAgentePorNome(
  db: SupabaseClient,
  organizationId: string,
  nomeDigitado: string,
): Promise<ResultadoDaResolucao> {
  const { data, error } = await db
    .from("ai_agents")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);

  const agentes = (data ?? []) as AgenteCandidato[];
  const alvo = normalizar(nomeDigitado);

  const exatos = agentes.filter((a) => normalizar(a.name) === alvo);
  if (exatos.length === 1) return { status: "unico", agente: exatos[0]! };
  if (exatos.length > 1) return { status: "ambiguo", candidatos: exatos };

  const porSubstring = agentes.filter((a) => {
    const nomeNormalizado = normalizar(a.name);
    return nomeNormalizado.includes(alvo) || alvo.includes(nomeNormalizado);
  });
  if (porSubstring.length === 1) return { status: "unico", agente: porSubstring[0]! };
  if (porSubstring.length > 1) return { status: "ambiguo", candidatos: porSubstring };

  return { status: "nenhum" };
}

/** Lista para a resposta de `#agentes` — nomes reais, nunca inventados. */
export async function listarAgentesDaOrganizacao(
  db: SupabaseClient,
  organizationId: string,
): Promise<AgenteCandidato[]> {
  const { data, error } = await db
    .from("ai_agents")
    .select("id, name")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AgenteCandidato[];
}
