import { describe, expect, it } from "vitest";

import { montarMesa } from "./agente";

const agora = new Date("2026-10-16T15:00:00.000Z");

const conversa = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  last_message_at: "2026-10-16T14:50:00.000Z",
  last_message_preview: "Tem o 15 Pro?",
  bot_silenced_until: null,
  assigned_to_user_id: null,
  contacts: { name: "Maria Souza", display_name: null },
  ...extra,
});

describe("a mesa do agente no Mundo", () => {
  it("assumir grava 'infinity', e o PostgREST devolve a string: conta como pausado", () => {
    const { conversas } = montarMesa([conversa("c1", { bot_silenced_until: "infinity" })], [], [], agora);
    expect(conversas[0]!.automaticoPausado).toBe(true);
  });

  it("conversa com silêncio no futuro foi assumida; no passado, voltou ao agente", () => {
    const { conversas } = montarMesa(
      [
        conversa("c1", { bot_silenced_until: "2026-10-16T15:05:00.000Z", assigned_to_user_id: "u1" }),
        conversa("c2", { bot_silenced_until: "2026-10-16T14:00:00.000Z" }),
      ],
      [],
      [],
      agora,
    );
    expect(conversas[0]).toMatchObject({ id: "c1", automaticoPausado: true, comDono: true, contato: "Maria Souza" });
    expect(conversas[1]).toMatchObject({ id: "c2", automaticoPausado: false, comDono: false });
  });

  it("o nome de exibição vence o nome; sem os dois, null — a tela decide o que mostrar", () => {
    const { conversas } = montarMesa(
      [conversa("c1", { contacts: { name: "Maria", display_name: "Mari" } }), conversa("c2", { contacts: null })],
      [],
      [],
      agora,
    );
    expect(conversas.map((c) => c.contato)).toEqual(["Mari", null]);
  });

  it("pedido de ajuda só entra se a conversa dele é visível para quem pediu a mesa", () => {
    const casos = [
      { id: "k1", title: "Desconto acima do teto", blocker: "Pediu 20%", opened_at: "2026-10-16T14:00:00.000Z", conversation_id: "c1" },
      { id: "k2", title: "Troca fora do prazo", blocker: "Comprou há 40 dias", opened_at: "2026-10-16T14:10:00.000Z", conversation_id: "oculta" },
    ];
    const { pedidosDeAjuda } = montarMesa([], casos, [conversa("c1")], agora);
    expect(pedidosDeAjuda).toEqual([
      {
        id: "k1",
        titulo: "Desconto acima do teto",
        bloqueio: "Pediu 20%",
        abertoEm: "2026-10-16T14:00:00.000Z",
        conversaId: "c1",
        contato: "Maria Souza",
      },
    ]);
  });
});
