/**
 * As ferramentas de COBRANÇA — gerar boleto/Pix/cartão, consultar e cancelar.
 *
 * ⚠️ FACHADA FINA. Nenhuma regra nasce aqui: a decisão mora em
 * `app/api/v1/billing/charges/_handler.ts` — a MESMA que a rota REST usa.
 * Duas implementações divergiriam no primeiro ajuste, e o pior lugar para
 * isso divergir é dinheiro.
 *
 * ⚠️ `ctx.supabase` É SERVICE ROLE e bypassa a RLS: o `_handler.ts` recebe
 * `ctx.organizationId` e filtra `organization_id` em toda query — é o que
 * separa esta chamada de um vazamento entre organizações.
 */
import { z } from "zod";

import {
  cancelarCobrancaHandler,
  consultarCobrancaHandler,
  criarCobrancaHandler,
  listarCobrancasHandler,
} from "@/app/api/v1/billing/charges/_handler";
import { ApiError } from "@/lib/api/types";
import type { McpToolDefinition } from "@/lib/mcp/types";

// ─────────────────────────────────────────────────────────────────────────────
// LEITURA
// ─────────────────────────────────────────────────────────────────────────────

const consultarShape = {
  charge_id: z.string().uuid().describe("o id da cobrança, vindo de crm_gerar_cobranca ou crm_listar_cobrancas"),
};

export const crmConsultarCobranca: McpToolDefinition<typeof consultarShape> = {
  name: "crm_consultar_cobranca",
  description:
    "Consulta o status ATUAL de uma cobrança específica: pendente, aguardando pagamento, paga, " +
    "vencida, cancelada ou recusada. Use antes de dizer ao cliente 'ainda não recebemos' — o status " +
    "pode ter mudado desde a última vez que você olhou. Não invente status: se a chamada não trouxer " +
    "a cobrança, ela não existe ou não é desta organização.",
  inputSchema: consultarShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    try {
      const r = await consultarCobrancaHandler(
        ctx.supabase,
        { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
        { id: input.charge_id },
      );
      return { cobranca: r };
    } catch (e) {
      if (e instanceof ApiError && e.code === "not_found") {
        return { cobranca: null, motivo: "not_found", mensagem: "não encontrei essa cobrança." };
      }
      throw e;
    }
  },
};

const listarShape = {
  contact_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  status: z
    .enum(["pending", "awaiting_payment", "paid", "overdue", "cancelled", "refunded", "failed"])
    .optional(),
  limite: z.number().int().min(1).max(50).optional(),
};

export const crmListarCobrancas: McpToolDefinition<typeof listarShape> = {
  name: "crm_listar_cobrancas",
  description:
    "Lista as cobranças de um cliente ou de um negócio, com o status de cada uma. Informe pelo menos " +
    "contact_id ou lead_id — sem recorte a chamada devolve as mais recentes da organização inteira, " +
    "o que raramente é o que a conversa pede. " +
    "USE ANTES DE GERAR UMA NOVA COBRANÇA: cliente que já tem uma cobrança 'awaiting_payment' em " +
    "aberto para o mesmo motivo não deveria receber uma segunda — confirme com a pessoa se ela já " +
    "recebeu a primeira.",
  inputSchema: listarShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const r = await listarCobrancasHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      {
        contact_id: input.contact_id,
        lead_id: input.lead_id,
        status: input.status,
        limite: input.limite ?? 20,
      },
    );
    return { cobrancas: r };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// AS ESCRITAS
//
// ⚠️ OS HANDLERS LANÇAM `ApiError`, E EXCEÇÃO MATA O TURNO — mesma régua da
// agenda (`lib/mcp/tools/agendamento.ts`, `pesquisa/repo-mcp.md` §7.5). Toda
// escrita aqui captura e devolve `{ motivo, mensagem }`.
// ─────────────────────────────────────────────────────────────────────────────

const ENSINO_POR_CODIGO: Record<string, string> = {
  billing_valor_invalido: "o valor da cobrança precisa ser maior que zero. Confirme o valor com a pessoa.",
  billing_gateway_nao_configurado:
    "esta organização ainda não configurou um gateway de pagamento. Não prometa gerar cobrança — avise que alguém da equipe precisa configurar isso antes.",
  billing_ja_pago:
    "essa cobrança já foi paga — cancelar não é a operação certa. Se o cliente quer o dinheiro de volta, isso é reembolso e precisa de uma pessoa.",
  asaas_credencial_invalida:
    "a credencial de pagamento configurada não é mais válida. Não tente de novo — avise que alguém da equipe precisa reconectar o gateway.",
  asaas_indisponivel:
    "não consegui falar com o gateway de pagamento agora. Não repita a tentativa imediatamente — avise que vai tentar de novo em instantes.",
  asaas_recusou: "o gateway de pagamento recusou o pedido. Confirme os dados (CPF/CNPJ, valor) antes de tentar de novo.",
  not_found: "não encontrei essa cobrança. Confirme com crm_listar_cobrancas antes de tentar de novo.",
  internal_error: "não consegui completar agora. Avise que alguém da equipe confirma, e não repita a tentativa.",
};

async function semDerrubarOTurno<T>(
  chave: string,
  fn: () => Promise<T>,
): Promise<T | { [k: string]: unknown; motivo: string; mensagem: string }> {
  try {
    return await fn();
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return {
      [chave]: false,
      motivo: e.code,
      mensagem: ENSINO_POR_CODIGO[e.code] ?? "não consegui completar agora. Avise que alguém da equipe confirma.",
    };
  }
}

const gerarShape = {
  contact_id: z.string().uuid().describe("quem vai pagar"),
  lead_id: z.string().uuid().optional().describe("o negócio a que esta cobrança pertence, se houver um aberto"),
  method: z.enum(["boleto", "pix", "cartao"]).describe("como o cliente vai pagar"),
  amount_cents: z.number().int().positive().describe("o valor EM CENTAVOS — R$ 150,00 é 15000"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("AAAA-MM-DD. Ausente = vence hoje."),
  description: z.string().max(500).optional(),
  cpf_cnpj: z
    .string()
    .min(11)
    .max(18)
    .describe("CPF ou CNPJ de quem vai pagar — obrigatório, a ASAAS não cadastra cliente sem isso. Pergunte à pessoa se ainda não souber."),
};

export const crmGerarCobranca: McpToolDefinition<typeof gerarShape> = {
  name: "crm_gerar_cobranca",
  description:
    "Gera uma cobrança de verdade (boleto, Pix ou cartão) e devolve o link/código para o cliente pagar. " +
    "Isto é DINHEIRO DE VERDADE saindo do bolso do cliente — nunca gere sem o cliente ter concordado " +
    "explicitamente com o valor. " +
    "Use `crm_listar_cobrancas` ANTES para checar se já não existe uma cobrança em aberto para o mesmo " +
    "motivo — gerar duas cobranças para a mesma coisa confunde o cliente e pode fazer ele pagar em dobro. " +
    "SEMPRE peça o CPF/CNPJ à pessoa antes de chamar esta ferramenta se você ainda não souber — não " +
    "invente um número. " +
    "Depois de gerar, mande o link (`invoice_url`) ou o código (`pix_copy_paste`/`boleto_barcode`) para " +
    "o cliente — não descreva a cobrança sem mandar como pagar.",
  inputSchema: gerarShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) =>
    semDerrubarOTurno("gerada", async () => {
      const r = await criarCobrancaHandler(
        ctx.supabase,
        { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
        {
          contact_id: input.contact_id,
          ...(input.lead_id ? { lead_id: input.lead_id } : {}),
          method: input.method,
          amount_cents: input.amount_cents,
          ...(input.due_date ? { due_date: input.due_date } : {}),
          ...(input.description ? { description: input.description } : {}),
          cpf_cnpj: input.cpf_cnpj,
        },
      );
      return { gerada: true, cobranca: r };
    }),
};

const cancelarShape = {
  charge_id: z.string().uuid(),
  /** OBRIGATÓRIO — é o que a equipe lê ao ver a cobrança cancelada. */
  reason: z.string().min(3).max(500),
};

export const crmCancelarCobranca: McpToolDefinition<typeof cancelarShape> = {
  name: "crm_cancelar_cobranca",
  description:
    "Cancela uma cobrança que ainda NÃO foi paga. Use quando o cliente desistiu, ou quando a cobrança " +
    "foi gerada com valor/dados errados. " +
    "NÃO use para cobrança já paga — isso é reembolso, decisão de uma pessoa, e a ferramenta recusa. " +
    "Cancelar não dá para desfazer: o link de pagamento para de funcionar imediatamente. " +
    "Informe `reason` — é o que a equipe vai ler ao ver a cobrança cancelada.",
  inputSchema: cancelarShape,
  category: "write",
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx) =>
    semDerrubarOTurno("cancelada", async () => {
      const r = await cancelarCobrancaHandler(
        ctx.supabase,
        { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
        { id: input.charge_id, reason: input.reason },
      );
      return { cancelada: true, cobranca: r };
    }),
};
