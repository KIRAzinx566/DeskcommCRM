import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { webPushInboundHandler } from "@/lib/notifications/push.handler";
import { ensureHandlersRegistered } from "@/lib/event-log/register-handlers";
import { lancamentoDoGrupoHandler } from "@/lib/financeiro/lancamento-do-grupo.handler";

describe("grupos: quem escuta e quem não escuta", () => {
  it("a notificação do atendente escuta mensagem de grupo", () => {
    expect(webPushInboundHandler.events).toContain("message.group_received");
  });

  /**
   * A lista é FECHADA, e cada entrada tem o porquê:
   *   - a notificação do atendente: avisa que o grupo está falando;
   *   - o grupo de vendas (migration 0613): lança no CAIXA o que é vendido e gasto
   *     num grupo que o gestor marcou como de vendas. Não cria contato, não move
   *     funil, não acorda a IA — só escreve `financial_entries`, e só para grupo
   *     com `lanca_no_caixa = true` (`lib/financeiro/lancamento-do-grupo.handler.test.ts`).
   * Consumidor novo aqui pede o mesmo: dizer por que um grupo pode afetá-lo.
   */
  it("só os consumidores declarados escutam message.group_received", async () => {
    const { getRegisteredHandlers } = await import("@/lib/event-log/dispatcher");
    ensureHandlersRegistered();
    const escutam = getRegisteredHandlers()
      .filter((h) => h.events.includes("message.group_received"))
      .map((h) => h.key)
      .sort();
    expect(escutam).toEqual([webPushInboundHandler.key, lancamentoDoGrupoHandler.key].sort());
  });

  it("listagem de contatos e audiência de campanha excluem o contato de grupo", () => {
    for (const arquivo of ["app/api/v1/contacts/_handler.ts", "lib/campanhas/consulta-de-audiencia.ts"]) {
      expect(readFileSync(arquivo, "utf8"), arquivo).toMatch(/\.eq\(\s*["']kind["']\s*,\s*["']person["']\s*\)/);
    }
  });
});
