/**
 * A MESA DE UM AGENTE no Mundo dos agentes — o que ele tem nas mãos agora, para
 * quem clicou nele poder comandar: as conversas em que é o agente ativo e os
 * pedidos de ajuda que ele abriu e esperam uma pessoa.
 *
 * Os comandos em si NÃO moram aqui nem numa rota nova: pausar/retomar o agente,
 * responder o caso e assumir/devolver a conversa são as rotas que a tela do
 * agente, a fila de casos e o Inbox já usam (`/ai/agents/:id/pause`,
 * `/ai/cases/:id/reply`, `/conversations/:id/pause-ai|reactivate-bot`). O Mundo
 * é mais uma porta para elas — um segundo caminho de escrita seria um segundo
 * lugar para as regras divergirem.
 *
 * Leitura pela SESSÃO: a RLS de `conversations` decide o que cada papel vê, e o
 * caso só entra se a conversa dele for visível (mesmo recorte de
 * `conversasVisiveisDosCasos` na fila de casos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { silencioVigente } from "@/lib/inbox/comando-da-conversa";

/** Conversas ainda em andamento — as encerradas não têm o que comandar. */
export const STATUS_EM_ANDAMENTO = ["open", "pending", "claimed", "ai_handling"] as const;
const LIMITE_DE_CONVERSAS = 20;

export interface ConversaNaMesa {
  id: string;
  contato: string | null;
  ultimaMensagemEm: string | null;
  previa: string | null;
  /** Silêncio vigente (`silencioVigente` do Inbox, que sabe ler `'infinity'`): uma pessoa assumiu. */
  automaticoPausado: boolean;
  /** Já tem uma pessoa dona da conversa. */
  comDono: boolean;
}

export interface PedidoDeAjuda {
  id: string;
  titulo: string;
  bloqueio: string;
  abertoEm: string;
  conversaId: string;
  contato: string | null;
}

export interface MesaDoAgente {
  conversas: ConversaNaMesa[];
  pedidosDeAjuda: PedidoDeAjuda[];
}

interface LinhaDaConversa {
  id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  bot_silenced_until: string | null;
  assigned_to_user_id: string | null;
  contacts: { name: string | null; display_name: string | null } | null;
}

interface LinhaDoCaso {
  id: string;
  title: string;
  blocker: string;
  opened_at: string;
  conversation_id: string;
}

const nomeDoContato = (c: LinhaDaConversa["contacts"]) => c?.display_name?.trim() || c?.name?.trim() || null;

export function montarMesa(
  conversas: readonly LinhaDaConversa[],
  casos: readonly LinhaDoCaso[],
  conversasVisiveisDosCasos: readonly LinhaDaConversa[],
  agora: Date,
): MesaDoAgente {
  const visiveis = new Map(conversasVisiveisDosCasos.map((c) => [c.id, c]));
  return {
    conversas: conversas.map((c) => ({
      id: c.id,
      contato: nomeDoContato(c.contacts),
      ultimaMensagemEm: c.last_message_at,
      previa: c.last_message_preview,
      automaticoPausado: silencioVigente(c.bot_silenced_until, agora).vigente,
      comDono: c.assigned_to_user_id !== null,
    })),
    pedidosDeAjuda: casos
      .filter((c) => visiveis.has(c.conversation_id))
      .map((c) => ({
        id: c.id,
        titulo: c.title,
        bloqueio: c.blocker,
        abertoEm: c.opened_at,
        conversaId: c.conversation_id,
        contato: nomeDoContato(visiveis.get(c.conversation_id)!.contacts),
      })),
  };
}

const COLUNAS_DA_CONVERSA =
  "id, last_message_at, last_message_preview, bot_silenced_until, assigned_to_user_id, contacts(name, display_name)";

export async function carregarMesa(
  db: SupabaseClient,
  input: { orgId: string; agenteId: string; agora?: Date },
): Promise<MesaDoAgente> {
  const { orgId, agenteId } = input;
  const [conversas, casos] = await Promise.all([
    db
      .from("conversations")
      .select(COLUNAS_DA_CONVERSA)
      .eq("organization_id", orgId)
      .eq("active_ai_agent_id", agenteId)
      .in("status", [...STATUS_EM_ANDAMENTO])
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(LIMITE_DE_CONVERSAS),
    db
      .from("agent_cases")
      .select("id, title, blocker, opened_at, conversation_id")
      .eq("organization_id", orgId)
      .eq("agent_id", agenteId)
      .eq("status", "awaiting_human")
      .order("opened_at", { ascending: true }),
  ]);
  if (conversas.error) throw new Error(conversas.error.message);
  if (casos.error) throw new Error(casos.error.message);

  const linhasDosCasos = (casos.data ?? []) as LinhaDoCaso[];
  const idsDosCasos = [...new Set(linhasDosCasos.map((c) => c.conversation_id))];
  let visiveis: LinhaDaConversa[] = [];
  if (idsDosCasos.length > 0) {
    const r = await db.from("conversations").select(COLUNAS_DA_CONVERSA).eq("organization_id", orgId).in("id", idsDosCasos);
    if (r.error) throw new Error(r.error.message);
    visiveis = (r.data ?? []) as unknown as LinhaDaConversa[];
  }

  return montarMesa(
    (conversas.data ?? []) as unknown as LinhaDaConversa[],
    linhasDosCasos,
    visiveis,
    input.agora ?? new Date(),
  );
}
