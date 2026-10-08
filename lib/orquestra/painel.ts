/**
 * O PAINEL DO ORQUESTRA — a foto do momento da operação, na língua de quem é
 * dono da empresa e não de quem opera o CRM.
 *
 * Vem do Orquestra (o painel de agentes da agência): uma Visão geral com o que
 * entrou no caixa, quem está esperando a equipe, o funil, o que está ligado e o
 * que cada agente de IA está fazendo — e o Mundo dos agentes, que desenha essa
 * mesma foto como um escritório. Lá os números vinham de um banco próprio e
 * metade era demonstração; aqui TODO número sai de uma tabela do produto, e o
 * que o produto não registra não aparece (a cerca de `telas-sem-dado-de-mentira`
 * vale para esta tela como para as outras).
 *
 * ─── Cliente da SESSÃO, sempre ─────────────────────────────────────────────
 *
 * Nenhuma consulta daqui usa service role: a RLS decide o que cada papel vê, e
 * uma seção que o papel não alcança volta `null` — a tela a omite, em vez de
 * mostrar zero. É o caso do DIÁRIO montado da auditoria (`mcp.tool_called`),
 * que a policy de `api_audit_log` só entrega a quem administra: para os demais,
 * o diário é feito dos turnos (`llm_calls`), que dizem QUANDO o agente atendeu
 * mas não O QUE fez.
 *
 * ─── De onde vem cada coisa (e de onde NÃO vem) ────────────────────────────
 *
 *   - Turnos do agente: `llm_calls` com `purpose='agent_turn'` e `agent_id`.
 *     NÃO `ai_agent_runs` — essa tabela nenhum motor vivo escreve (o cabeçalho
 *     de `app/api/v1/ai/agents/[id]/runs/route.ts` mediu: 0 linhas em produção
 *     com o agente respondendo).
 *   - O que o agente fez: `api_audit_log`, ação `mcp.tool_called`, onde o
 *     `metadata.actor_id` é o id do agente (`lib/agent-engine/edge/crm/mcp-tools.ts`)
 *     e o nome da ferramenta vira o rótulo humano do catálogo de capacidades.
 *   - Caixa: `financial_entries` PAGOS, na moeda da organização.
 *   - Fila: não é calculada aqui. A tela usa `useConversationCounts`, a MESMA
 *     definição do Inbox (`tests/unit/fila-tem-uma-definicao-so.test.ts`).
 *
 * Nunca lança: cada seção falha sozinha, com log, e a tela desenha o resto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { TOOL_CATALOG } from "@/lib/mcp/tools/catalog";
import { isoLocalComOffset } from "@/lib/tempo/agora";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

export const PERIODOS_DO_PAINEL = ["hoje", "7d", "mes"] as const;
export type PeriodoDoPainel = (typeof PERIODOS_DO_PAINEL)[number];

export interface DiaDoCaixa {
  /** AAAA-MM-DD, no fuso da organização. */
  dia: string;
  entradasCents: number;
  saidasCents: number;
}

export interface AgenteNoPainel {
  id: string;
  nome: string;
  ativo: boolean;
  /** Turnos de atendimento hoje (no fuso da organização). */
  turnosHoje: number;
  /** Turnos que terminaram em erro hoje. */
  falhasHoje: number;
  ultimoTurnoEm: string | null;
  /** A última ferramenta que ele usou, em português de gente. Só para quem administra. */
  ultimaAcao: { rotulo: string; em: string } | null;
}

export interface EntradaDoDiario {
  em: string;
  agenteId: string | null;
  agente: string;
  texto: string;
}

export interface PainelDoOrquestra {
  geradoEm: string;
  fuso: string;
  moeda: string;
  periodo: PeriodoDoPainel;
  /** `null` = o papel não alcança o caixa, ou a leitura falhou. */
  caixa: {
    entradasCents: number;
    saidasCents: number;
    porDia: DiaDoCaixa[];
    lancamentosHoje: number;
  } | null;
  funil: {
    nome: string;
    etapas: Array<{ nome: string; cor: string | null; quantidade: number; valorCents: number }>;
  } | null;
  canais: Array<{ nome: string; telefone: string | null; conectado: boolean; status: string }> | null;
  agentes: AgenteNoPainel[] | null;
  /** Conversas que passaram para uma pessoa hoje. */
  passagensHoje: number | null;
  produtosAtivos: number | null;
  diario: EntradaDoDiario[];
  /** O diário diz O QUE os agentes fizeram (auditoria) ou só QUANDO atenderam (turnos). */
  diarioDetalhado: boolean;
}

// ---------------------------------------------------------------------------
// relógio
// ---------------------------------------------------------------------------

/** AAAA-MM-DD de um instante, no fuso dado. */
export function diaNoFuso(instante: Date, fuso: string): string {
  return isoLocalComOffset(instante, fuso).slice(0, 10);
}

/**
 * O instante da meia-noite de `dia` no fuso — o offset é o de `referencia`
 * (o fuso padrão do produto não tem horário de verão; num que tenha, a virada
 * erra no máximo uma hora no dia da troca, e o painel é leitura, não cobrança).
 */
export function meiaNoite(dia: string, fuso: string, referencia: Date): Date {
  const offset = isoLocalComOffset(referencia, fuso).slice(19);
  return new Date(`${dia}T00:00:00${offset}`);
}

/** O primeiro dia do período, AAAA-MM-DD, no fuso da organização. */
export function primeiroDiaDoPeriodo(periodo: PeriodoDoPainel, agora: Date, fuso: string): string {
  const hoje = diaNoFuso(agora, fuso);
  if (periodo === "hoje") return hoje;
  if (periodo === "mes") return `${hoje.slice(0, 8)}01`;
  const seisDiasAtras = new Date(meiaNoite(hoje, fuso, agora).getTime() - 6 * 86_400_000 + 12 * 3_600_000);
  return diaNoFuso(seisDiasAtras, fuso);
}

// ---------------------------------------------------------------------------
// caixa
// ---------------------------------------------------------------------------

interface LinhaDoCaixa {
  direction: "in" | "out";
  amount_cents: number;
  entry_date: string;
  currency: string;
  created_at: string;
}

/**
 * Lançamentos PAGOS → totais e a série por dia. Só a moeda da organização: somar
 * real com peso daria um número que não é de nenhuma moeda.
 */
export function resumirCaixa(linhas: readonly LinhaDoCaixa[], moeda: string, hoje: string) {
  const porDia = new Map<string, DiaDoCaixa>();
  let entradasCents = 0;
  let saidasCents = 0;
  let lancamentosHoje = 0;
  for (const l of linhas) {
    if (l.currency !== moeda) continue;
    const dia = l.entry_date.slice(0, 10);
    const atual = porDia.get(dia) ?? { dia, entradasCents: 0, saidasCents: 0 };
    if (l.direction === "in") {
      atual.entradasCents += l.amount_cents;
      entradasCents += l.amount_cents;
    } else {
      atual.saidasCents += l.amount_cents;
      saidasCents += l.amount_cents;
    }
    porDia.set(dia, atual);
    if (dia === hoje) lancamentosHoje += 1;
  }
  return {
    entradasCents,
    saidasCents,
    porDia: [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    lancamentosHoje,
  };
}

// ---------------------------------------------------------------------------
// agentes
// ---------------------------------------------------------------------------

const ROTULO_DA_FERRAMENTA = new Map(TOOL_CATALOG.map((t) => [t.name, t.rotulo]));

/** "crm_search_products" → "Procurar produto na loja". Ferramenta fora do catálogo: o nome cru, nunca inventado. */
export function rotuloDaFerramenta(nome: string): string {
  return ROTULO_DA_FERRAMENTA.get(nome) ?? nome;
}

interface LinhaDoTurno {
  agent_id: string | null;
  status: string | null;
  created_at: string;
}

interface LinhaDaAuditoria {
  created_at: string;
  metadata: { actor_type?: string; actor_id?: string; tool_name?: string } | null;
}

export function montarAgentes(
  agentes: ReadonlyArray<{ id: string; name: string; is_active: boolean }>,
  turnos: readonly LinhaDoTurno[],
  auditoria: readonly LinhaDaAuditoria[] | null,
): AgenteNoPainel[] {
  return agentes.map((a) => {
    const meus = turnos.filter((t) => t.agent_id === a.id);
    const ultimoTurno = meus.reduce<string | null>((max, t) => (!max || t.created_at > max ? t.created_at : max), null);
    const ultimaChamada = (auditoria ?? [])
      .filter((r) => r.metadata?.actor_type === "ai_agent" && r.metadata.actor_id === a.id && r.metadata.tool_name)
      .reduce<LinhaDaAuditoria | null>((max, r) => (!max || r.created_at > max.created_at ? r : max), null);
    return {
      id: a.id,
      nome: a.name,
      ativo: a.is_active,
      turnosHoje: meus.length,
      falhasHoje: meus.filter((t) => t.status !== null && t.status !== "ok").length,
      ultimoTurnoEm: ultimoTurno,
      ultimaAcao: ultimaChamada
        ? { rotulo: rotuloDaFerramenta(ultimaChamada.metadata!.tool_name!), em: ultimaChamada.created_at }
        : null,
    };
  });
}

/**
 * O diário: o que os agentes fizeram, do mais novo para o mais velho. Com a
 * auditoria (quem administra), cada linha é uma ferramenta usada; sem ela, cada
 * linha é um turno de atendimento.
 */
export function montarDiario(
  agentes: ReadonlyArray<{ id: string; name: string }>,
  turnos: readonly LinhaDoTurno[],
  auditoria: readonly LinhaDaAuditoria[] | null,
  limite = 30,
): EntradaDoDiario[] {
  const nomeDe = new Map(agentes.map((a) => [a.id, a.name]));
  if (auditoria) {
    return auditoria
      .filter((r) => r.metadata?.actor_type === "ai_agent" && r.metadata.tool_name)
      .sort((x, y) => y.created_at.localeCompare(x.created_at))
      .slice(0, limite)
      .map((r) => {
        const id = r.metadata!.actor_id ?? null;
        return {
          em: r.created_at,
          agenteId: id,
          agente: (id && nomeDe.get(id)) || "Agente de IA",
          texto: rotuloDaFerramenta(r.metadata!.tool_name!),
        };
      });
  }
  return turnos
    .filter((t) => t.agent_id)
    .sort((x, y) => y.created_at.localeCompare(x.created_at))
    .slice(0, limite)
    .map((t) => ({
      em: t.created_at,
      agenteId: t.agent_id,
      agente: nomeDe.get(t.agent_id!) ?? "Agente de IA",
      texto: t.status && t.status !== "ok" ? "Turno de atendimento com erro" : "Atendeu uma conversa",
    }));
}

// ---------------------------------------------------------------------------
// a foto inteira
// ---------------------------------------------------------------------------

/** Uma seção que falha não derruba as outras: volta `null`, com o motivo no log. */
async function secao<T>(nome: string, orgId: string, f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (erro) {
    logger.warn("painel do orquestra: seção não carregou", {
      organization_id: orgId,
      secao: nome,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return null;
  }
}

function semErro<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? ([] as unknown)) as T;
}

export async function carregarPainel(
  db: SupabaseClient,
  input: { orgId: string; periodo: PeriodoDoPainel; podeVerAuditoria: boolean; agora?: Date },
): Promise<PainelDoOrquestra> {
  const agora = input.agora ?? new Date();
  const { orgId } = input;

  const org = await secao("organizacao", orgId, async () =>
    semErro(await db.from("organizations").select("timezone, currency").eq("id", orgId).maybeSingle()),
  );
  const linhaDaOrg = org as { timezone?: string | null; currency?: string | null } | null;
  const fuso = linhaDaOrg?.timezone && fusoValido(linhaDaOrg.timezone) ? linhaDaOrg.timezone : FUSO_PADRAO;
  const moeda = linhaDaOrg?.currency || "BRL";
  const hoje = diaNoFuso(agora, fuso);
  const inicioDeHoje = meiaNoite(hoje, fuso, agora).toISOString();
  const primeiroDia = primeiroDiaDoPeriodo(input.periodo, agora, fuso);

  const [caixa, funil, canais, agentesBrutos, turnos, auditoria, passagensHoje, produtosAtivos] = await Promise.all([
    secao("caixa", orgId, async () => {
      const linhas = semErro<LinhaDoCaixa[]>(
        await db
          .from("financial_entries")
          .select("direction, amount_cents, entry_date, currency, created_at")
          .eq("organization_id", orgId)
          .eq("status", "paid")
          .gte("entry_date", primeiroDia)
          .lte("entry_date", hoje)
          .limit(5000),
      );
      return resumirCaixa(linhas, moeda, hoje);
    }),
    secao("funil", orgId, async () => {
      const pipelines = semErro<Array<{ id: string; name: string; is_default: boolean | null }>>(
        await db
          .from("crm_pipelines")
          .select("id, name, is_default")
          .eq("organization_id", orgId)
          .eq("is_archived", false)
          .order("is_default", { ascending: false })
          .order("position", { ascending: true })
          .limit(1),
      );
      const pipeline = pipelines[0];
      if (!pipeline) return null;
      const [etapas, negocios] = await Promise.all([
        db
          .from("crm_stages")
          .select("id, name, color")
          .eq("organization_id", orgId)
          .eq("pipeline_id", pipeline.id)
          .eq("is_archived", false)
          .order("position", { ascending: true }),
        db
          .from("crm_leads")
          .select("stage_id, value_cents")
          .eq("organization_id", orgId)
          .eq("pipeline_id", pipeline.id)
          .eq("status", "open")
          .limit(5000),
      ]);
      const listaDeEtapas = semErro<Array<{ id: string; name: string; color: string | null }>>(etapas);
      const listaDeNegocios = semErro<Array<{ stage_id: string; value_cents: number | null }>>(negocios);
      return {
        nome: pipeline.name,
        etapas: listaDeEtapas.map((e) => {
          const daEtapa = listaDeNegocios.filter((n) => n.stage_id === e.id);
          return {
            nome: e.name,
            cor: e.color,
            quantidade: daEtapa.length,
            valorCents: daEtapa.reduce((s, n) => s + (n.value_cents ?? 0), 0),
          };
        }),
      };
    }),
    secao("canais", orgId, async () => {
      const linhas = semErro<
        Array<{ display_name: string | null; phone_number: string | null; status: string }>
      >(
        await db
          .from("channel_sessions")
          .select("display_name, phone_number, status")
          .eq("organization_id", orgId)
          .is("archived_at", null),
      );
      return linhas.map((c) => ({
        // Nome de exibição, ou o número; o identificador interno da sessão nunca vai
        // para a tela (doutrina de restrição de canal: lint:channels).
        nome: c.display_name || (c.phone_number ? `+${c.phone_number}` : "WhatsApp"),
        telefone: c.phone_number,
        conectado: c.status === "WORKING",
        status: c.status,
      }));
    }),
    secao("agentes", orgId, async () =>
      semErro<Array<{ id: string; name: string; is_active: boolean }>>(
        await db
          .from("ai_agents")
          .select("id, name, is_active")
          .eq("organization_id", orgId)
          .is("archived_at", null)
          .order("priority", { ascending: true }),
      ),
    ),
    secao("turnos", orgId, async () =>
      semErro<LinhaDoTurno[]>(
        await db
          .from("llm_calls")
          .select("agent_id, status, created_at")
          .eq("organization_id", orgId)
          .eq("purpose", "agent_turn")
          .gte("created_at", inicioDeHoje)
          .order("created_at", { ascending: false })
          .limit(2000),
      ),
    ),
    input.podeVerAuditoria
      ? secao("auditoria", orgId, async () =>
          semErro<LinhaDaAuditoria[]>(
            await db
              .from("api_audit_log")
              .select("created_at, metadata")
              .eq("organization_id", orgId)
              .eq("action", "mcp.tool_called")
              .gte("created_at", inicioDeHoje)
              .order("created_at", { ascending: false })
              .limit(300),
          ),
        )
      : Promise.resolve(null),
    secao("passagens", orgId, async () => {
      const r = await db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("last_handoff_at", inicioDeHoje);
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    }),
    secao("produtos", orgId, async () => {
      const r = await db
        .from("catalog_products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("ativo", true);
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    }),
  ]);

  const listaDeAgentes = agentesBrutos ?? [];
  const listaDeTurnos = turnos ?? [];
  return {
    geradoEm: agora.toISOString(),
    fuso,
    moeda,
    periodo: input.periodo,
    caixa,
    funil,
    canais,
    agentes: agentesBrutos ? montarAgentes(listaDeAgentes, listaDeTurnos, auditoria) : null,
    passagensHoje,
    produtosAtivos,
    diario: montarDiario(listaDeAgentes, listaDeTurnos, auditoria),
    diarioDetalhado: auditoria !== null,
  };
}
