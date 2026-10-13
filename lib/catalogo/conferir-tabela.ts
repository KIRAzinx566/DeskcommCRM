import "server-only";

/**
 * Marca a tabela de preços da organização como CONFERIDA AGORA
 * (`organizations.settings.catalogo.conferida_em`) — a porta que a importação
 * da planilha usa. A régua inteira está em `./tabela-do-dia.ts`.
 *
 * ADMIN CLIENT porque a RLS de `organizations` só deixa platform_admin fazer
 * UPDATE (issue #144). Quem chama já passou pelo gate de papel e passa o
 * `orgId` da SESSÃO, nunca do corpo.
 *
 * Nunca lança: a planilha já foi gravada quando isto roda, e derrubar a
 * resposta da importação por causa do carimbo diria à loja que os preços não
 * entraram — quando entraram. Falhar devolve `null`, e quem chama diz à tela
 * que a tabela não ficou marcada.
 */
import { lerConfigDaTabela } from "@/lib/catalogo/tabela-do-dia";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export async function conferirTabelaDoDia(orgId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("organizations").select("settings").eq("id", orgId).single();
    if (error || !data) throw new Error(error?.message ?? "organização não encontrada");
    const settings = ((data as { settings?: unknown }).settings as Record<string, unknown> | null) ?? {};
    const conferidaEm = new Date().toISOString();
    const catalogo = { ...lerConfigDaTabela(settings), conferida_em: conferidaEm };
    const { error: erroUpdate } = await admin
      .from("organizations")
      .update({ settings: { ...settings, catalogo } })
      .eq("id", orgId);
    if (erroUpdate) throw new Error(erroUpdate.message);
    return conferidaEm;
  } catch (erro) {
    logger.warn("tabela do dia: não consegui marcar a tabela como conferida", {
      organization_id: orgId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return null;
  }
}
