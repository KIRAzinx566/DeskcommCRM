/**
 * O CONSUMIDOR do grupo de vendas: `message.group_received` → lançamentos
 * pagos no caixa (migration 0613; o leitor é `./grupo-de-vendas.ts`).
 *
 * Só age quando o grupo da mensagem está LIGADO e marcado como grupo de vendas
 * (`channel_session_groups.lanca_no_caixa`) com uma conta ativa escolhida.
 * Qualquer outra coisa é `skipped` com o motivo — grupo de conversa da equipe,
 * de cliente, de fornecedor: nenhum deles vira dinheiro.
 *
 * ─── Idempotente pelo schema ───────────────────────────────────────────────
 *
 * Cada linha lida vira UM `financial_entries` com `source_message_id` +
 * `source_line`, e o índice único parcial da 0613 recusa a segunda. Replay do
 * `event_log`, dois workers na mesma mensagem, a mensagem reprocessada: o
 * `23505` é tratado como "já lançado", nunca como erro.
 *
 * ─── Pago, na data da mensagem ─────────────────────────────────────────────
 *
 * Venda postada no grupo é venda feita: o lançamento nasce `paid`, com
 * `paid_at` = a hora da mensagem e `entry_date` = o dia dela no fuso da
 * organização — não a hora em que o worker rodou (um worker parado de noite
 * jogaria as vendas das 23h no dia seguinte).
 *
 * Service role porque é worker: TODA consulta filtra `organization_id`, e a
 * fonte é a linha do `event_log`, nunca um corpo de requisição.
 */
import { audit } from "@/lib/audit";
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { isoLocalComOffset } from "@/lib/tempo/agora";
import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

import { lerMensagemDoGrupo } from "./grupo-de-vendas";

export const LANCAMENTO_DO_GRUPO_KEY = "financeiro.lancamento-do-grupo.v1";
export const ORIGEM_DO_GRUPO = "grupo";

const resultado = (status: HandlerResult["status"], detail?: string): HandlerResult => ({
  consumer_key: LANCAMENTO_DO_GRUPO_KEY,
  status,
  detail,
});

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

async function handle(row: EventRow): Promise<HandlerResult> {
  const messageId = texto(row.payload.message_id) ?? texto(row.entity_id);
  const conversationId = texto(row.payload.conversation_id);
  if (!messageId || !conversationId) return resultado("skipped", "sem_mensagem");
  const org = row.organization_id;
  const admin = createAdminClient();

  const { data: grupo, error: erroGrupo } = await admin
    .from("channel_session_groups")
    .select("id, conta_do_caixa_id")
    .eq("organization_id", org)
    .eq("conversation_id", conversationId)
    .eq("enabled", true)
    .eq("lanca_no_caixa", true)
    .maybeSingle();
  if (erroGrupo) return resultado("error", `grupo: ${erroGrupo.message}`);
  if (!grupo) return resultado("skipped", "grupo_nao_lanca_no_caixa");
  const contaId = texto((grupo as { conta_do_caixa_id: string | null }).conta_do_caixa_id);
  if (!contaId) return resultado("skipped", "grupo_sem_conta");

  const [{ data: conta, error: erroConta }, { data: mensagem, error: erroMensagem }, { data: organizacao }] =
    await Promise.all([
      admin
        .from("financial_accounts")
        .select("id, currency, is_active")
        .eq("organization_id", org)
        .eq("id", contaId)
        .maybeSingle(),
      admin
        .from("messages")
        .select("id, body, direction, sent_at")
        .eq("organization_id", org)
        .eq("id", messageId)
        .maybeSingle(),
      admin.from("organizations").select("timezone").eq("id", org).maybeSingle(),
    ]);
  if (erroConta) return resultado("error", `conta: ${erroConta.message}`);
  if (erroMensagem) return resultado("error", `mensagem: ${erroMensagem.message}`);
  const c = conta as { id: string; currency: string; is_active: boolean } | null;
  if (!c || !c.is_active) return resultado("skipped", "conta_inativa");
  const m = mensagem as { id: string; body: string | null; direction: string; sent_at: string } | null;
  if (!m || m.direction !== "inbound") return resultado("skipped", "mensagem_nao_encontrada");

  const leitura = lerMensagemDoGrupo(m.body ?? "");
  if (leitura.lancamentos.length === 0) {
    return resultado("skipped", leitura.ignoradas > 0 ? `ignoradas:${leitura.ignoradas}` : "sem_lancamento");
  }

  const tz = (organizacao as { timezone?: string | null } | null)?.timezone;
  const fuso = tz && fusoValido(tz) ? tz : FUSO_PADRAO;
  const entryDate = isoLocalComOffset(new Date(m.sent_at), fuso).slice(0, 10);

  let criados = 0;
  let jaExistiam = 0;
  for (const l of leitura.lancamentos) {
    const { error } = await admin.from("financial_entries").insert({
      organization_id: org,
      account_id: c.id,
      direction: l.direcao,
      amount_cents: l.valorCents,
      currency: c.currency,
      description: [l.descricao, l.forma].filter(Boolean).join(" · ").slice(0, 200),
      entry_date: entryDate,
      status: "paid",
      paid_at: m.sent_at,
      origin: ORIGEM_DO_GRUPO,
      source_message_id: m.id,
      source_line: l.linha,
    });
    if (!error) criados += 1;
    else if ((error as { code?: string }).code === "23505") jaExistiam += 1;
    else return resultado("error", `lancamento: ${error.message}`);
  }

  // Audita quando houve EFEITO — o replay que só achou "já lançado" não é mutação.
  if (criados > 0) {
    await audit({
      action: "financeiro.lancamento_do_grupo",
      organizationId: org,
      resourceType: "financial_entries",
      resourceId: null,
      metadata: { message_id: m.id, criados, ja_existiam: jaExistiam, ignoradas: leitura.ignoradas },
    });
  }
  return resultado("ok", `criados:${criados};ja_existiam:${jaExistiam};ignoradas:${leitura.ignoradas}`);
}

export const lancamentoDoGrupoHandler: EventHandler = {
  key: LANCAMENTO_DO_GRUPO_KEY,
  // Escrita interna no caixa da própria organização: segue com a org parada,
  // como a comanda do ganho — a venda aconteceu de qualquer jeito.
  naOrgParada: "roda",
  events: ["message.group_received"],
  handle,
};
