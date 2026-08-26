/**
 * Aviso por WhatsApp pro dono da organização quando uma reunião é marcada
 * (migration 0167). Capacidade NOVA: até aqui todo envio da CRM era endereçado
 * a um `contact`/conversa — não existia "mandar mensagem avulsa pra um número
 * configurado". `sendWAHA` (lib/waha/send.ts) não tinha nenhum chamador real
 * até este arquivo.
 *
 * Cria o próprio admin client (mesmo padrão de lib/audit/index.ts) em vez de
 * receber um client de chamador: os dois lugares que precisam disto — a rota
 * humana (client de sessão Supabase) e a tool do agente (pg.Pool) — não
 * compartilham tipo de client, e a leitura aqui é sempre por
 * `organization_id` explícito (regra do admin client: nunca confiar em RLS).
 *
 * Fire-and-forget de propósito, como audit(): falha de notificação NUNCA
 * derruba a criação da reunião. Nunca loga o número nem o texto da mensagem
 * (doutrina de lib/logger.ts — telefone é dado que não vai pro log).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { sendWAHA } from "./send";

function apenasDigitos(numero: string): string {
  return numero.replace(/\D/g, "");
}

export async function notifyOwnerWhatsApp(organizationId: string, text: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("owner_whatsapp_number")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgErr) {
      logger.warn("[notify-owner] falha ao ler owner_whatsapp_number", {
        organization_id: organizationId,
        error: orgErr.message,
      });
      return;
    }
    const ownerNumber = (org as { owner_whatsapp_number: string | null } | null)?.owner_whatsapp_number;
    if (!ownerNumber) {
      // Não configurado: silêncio esperado, não falha (mesmo espírito do
      // resolvedor de marca — "nunca lança", degrada e segue).
      return;
    }

    // Sessão WORKING mais recente da org — mesmo critério de desempate da
    // migration 0165 ("a mais recente prova posse mais recente da conta").
    const { data: session, error: sessErr } = await admin
      .from("channel_sessions")
      .select("waha_session_name")
      .eq("organization_id", organizationId)
      .eq("status", "WORKING")
      .order("last_status_change_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessErr) {
      logger.warn("[notify-owner] falha ao buscar sessão WAHA", {
        organization_id: organizationId,
        error: sessErr.message,
      });
      return;
    }
    const sessionName = (session as { waha_session_name: string } | null)?.waha_session_name;
    if (!sessionName) {
      logger.info("[notify-owner] sem sessão WAHA WORKING — aviso não enviado", {
        organization_id: organizationId,
      });
      return;
    }

    const chatId = `${apenasDigitos(ownerNumber)}@c.us`;
    const result = await sendWAHA({ sessionName, chatId, text });
    if (result === null) {
      logger.info("[notify-owner] WAHA não configurado — aviso não enviado", {
        organization_id: organizationId,
      });
    }
  } catch (err) {
    logger.warn("[notify-owner] erro inesperado ao notificar o dono", {
      organization_id: organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
