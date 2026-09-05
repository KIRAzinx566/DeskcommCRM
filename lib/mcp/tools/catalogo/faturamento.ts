/**
 * Capacidades de COBRANÇA — gerar boleto/Pix/cartão, consultar e cancelar.
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente. O texto que vai ao
 * MODELO é a `description` do handler (`lib/mcp/tools/faturamento.ts`), e ela
 * NÃO tem cópia aqui.
 *
 * ⚠️ AS DUAS LEITURAS vão para `atender`, NÃO para `vender` — e a razão é
 * MEDIDA, não estética. `vender` é `PACOTE_PADRAO_DO_ONBOARDING`: todo agente
 * novo já nasce com ele ligado, e o teste
 * `tests/unit/pacote-reserva-vaga-da-critica.test.ts` guarda que, a partir
 * desse ponto de partida, ALGUM outro pacote ainda caiba em
 * `TETO_TOOLS_POR_AGENTE` (25). Medido antes desta entrega: `vender` já tinha
 * 19 capacidades automáticas, e as duas jornadas mais próximas do teto eram
 * `evoluir` (24 combinado) e `reter` (25, exatamente no limite) — sem
 * NENHUMA folga. Pôr as 4 ferramentas novas ali (mesmo as duas leituras,
 * `seguro` também entra na conta automática) inflava `vender` em +3 e
 * derrubava as DUAS por igual (27 e 28) — nenhum pacote alternativo sobrava
 * para o dono ligar depois do primeiro. `crm_gerar_cobranca` (o desfecho
 * comercial de verdade) e `crm_cancelar_cobranca` (`critico`, nunca
 * auto-liga) continuam em `vender` — juntos custam só +1 na conta
 * automática, e `evoluir` ainda cabe (25, no limite) depois disso. As
 * leituras foram para `atender`, que tem folga de sobra (20/25 standalone) e
 * onde também fazem sentido: conferir cobrança durante um atendimento é
 * responder, não vender.
 */
import { declararTools } from "./tipos";

export const TOOLS_FATURAMENTO = declararTools([
  {
    name: "crm_consultar_cobranca",
    category: "read",
    rotulo: "Ver o status de uma cobrança",
    explicacao: "Mostra se uma cobrança já foi paga, está aguardando pagamento, venceu ou foi cancelada.",
    oQueToca: "Cobranças",
    risco: "seguro",
    pacotes: ["atender"],
  },
  {
    name: "crm_listar_cobrancas",
    category: "read",
    rotulo: "Ver as cobranças de um cliente",
    explicacao: "Lista as cobranças já geradas para um cliente ou negócio, com o status de cada uma.",
    oQueToca: "Cobranças",
    risco: "seguro",
    pacotes: ["atender"],
  },
  {
    name: "crm_gerar_cobranca",
    category: "write",
    rotulo: "Gerar boleto, Pix ou cobrança no cartão",
    explicacao:
      "Cria uma cobrança de verdade e devolve o link ou código para o cliente pagar — dinheiro de " +
      "verdade sai do bolso da pessoa quando ela paga.",
    oQueToca: "Cobranças",
    // `atencao` e não `critico`: gerar errado se desfaz — cancela.
    risco: "atencao",
    pacotes: ["vender"],
  },
  {
    name: "crm_cancelar_cobranca",
    category: "write",
    rotulo: "Cancelar uma cobrança",
    explicacao:
      "Cancela uma cobrança que ainda não foi paga — o link de pagamento para de funcionar na hora, o " +
      "que não dá para desfazer.",
    oQueToca: "Cobranças",
    // `critico`: depois de cancelar no gateway, não tem como reabrir a MESMA
    // cobrança — teria de gerar outra. Mesma régua de `crm_cancel_appointment`:
    // nunca entra por pacote, exige opt-in explícito do admin do tenant.
    risco: "critico",
    pacotes: ["vender"],
  },
]);
