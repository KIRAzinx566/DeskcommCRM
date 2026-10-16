/**
 * O MODO ORQUESTRA — a interface do dono (lib/navigation/interface.ts, `ORQUESTRA`).
 *
 * O que estes casos protegem:
 *
 *  - ele é uma ESCOLHA DE PORTAS, nunca um preset novo: o banco só aceita
 *    `completa`/`simplificada` (constraints de `organizations` e
 *    `user_organizations`), e uma terceira palavra quebraria a gravação;
 *  - quem não escolheu nada (interface completa) não muda NADA: nem a tela
 *    inicial, nem o menu — as duas telas novas ficam fora do sidebar;
 *  - quem escolheu: a Visão geral é a tela inicial e o menu fica plano (Produtos
 *    e Faturamento aparecem direto, não atrás de "Ver tudo em…");
 *  - a interseção empresa × pessoa continua valendo: a pessoa com a interface
 *    simplificada não ganha o Modo Orquestra porque a empresa o escolheu;
 *  - o Mundo dos agentes só desenha dado real (a cena sai do painel).
 */
import { describe, expect, it } from "vitest";

import {
  combinarInterfaces,
  ehModoOrquestra,
  homeDaInterface,
  interfaceSettingsSchema,
  ORQUESTRA,
} from "@/lib/navigation/interface";
import { sidebarGroups } from "@/lib/navigation/registry";
import { montarCena } from "@/lib/orquestra/mundo/personagens";
import type { PainelDoOrquestra } from "@/lib/orquestra/painel";

const MODO = { preset: "completa" as const, destinos: [...ORQUESTRA] };

describe("o Modo Orquestra é uma escolha de portas", () => {
  it("cabe no schema que o banco aceita, sem preset novo", () => {
    expect(interfaceSettingsSchema.safeParse(MODO).success).toBe(true);
    expect(MODO.preset).toBe("completa");
  });

  it("é reconhecido só quando a escolha inclui a Visão geral", () => {
    expect(ehModoOrquestra(MODO)).toBe(true);
    expect(ehModoOrquestra({ destinos: ["/app/inbox"] })).toBe(false);
    expect(ehModoOrquestra({})).toBe(false);
    expect(ehModoOrquestra(null)).toBe(false);
  });
});

describe("tela inicial", () => {
  it("interface completa: continua o Inbox", () => {
    expect(homeDaInterface({ preset: "completa" }, false, "admin")).toBe("/app/inbox");
  });

  it("Modo Orquestra: a Visão geral", () => {
    expect(homeDaInterface(MODO, false, "viewer")).toBe("/app/orquestra");
  });
});

describe("menu", () => {
  const hrefs = (settings: Parameters<typeof sidebarGroups>[2], role: "admin" | "viewer" = "admin") =>
    sidebarGroups(false, role, settings).flatMap((g) => g.items.map((i) => i.href));

  it("interface completa: as telas do Orquestra NÃO entram no sidebar", () => {
    const menu = hrefs({ preset: "completa" });
    expect(menu).not.toContain("/app/orquestra");
    expect(menu).not.toContain("/app/orquestra/mundo");
  });

  it("Modo Orquestra: menu plano, com toda porta escolhida que o papel alcança, a Visão geral primeiro", () => {
    const menu = hrefs(MODO);
    expect(menu[0]).toBe("/app/orquestra");
    for (const porta of ["/app/orquestra/mundo", "/app/inbox", "/app/products", "/app/faturamento", "/app/ai/agents"]) {
      expect(menu).toContain(porta);
    }
  });

  it("o papel continua decidindo: viewer não vê Agentes (manager+) nem no Modo Orquestra", () => {
    expect(hrefs(MODO, "viewer")).not.toContain("/app/ai/agents");
  });
});

describe("empresa × pessoa", () => {
  it("empresa no Modo Orquestra + pessoa sem escolha: a pessoa recebe o Modo Orquestra", () => {
    expect(ehModoOrquestra(combinarInterfaces(MODO, { preset: "completa" }))).toBe(true);
  });

  it("empresa no Modo Orquestra + pessoa simplificada: a interseção não inclui a Visão geral", () => {
    expect(ehModoOrquestra(combinarInterfaces(MODO, { preset: "simplificada" }))).toBe(false);
  });
});

describe("a cena do Mundo dos agentes", () => {
  const agora = new Date("2026-10-07T15:00:00.000Z");
  const painel: Pick<PainelDoOrquestra, "agentes" | "caixa" | "passagensHoje"> = {
    agentes: [
      {
        id: "a1",
        nome: "Bia",
        ativo: true,
        publicado: true,
        pausadoEm: null,
        pedidosDeAjuda: 0,
        turnosHoje: 4,
        falhasHoje: 0,
        ultimoTurnoEm: "2026-10-07T14:57:00.000Z",
        ultimaAcao: { rotulo: "Procurar produto na loja", em: "2026-10-07T14:57:00.000Z" },
      },
      { id: "a2", nome: "Leo", ativo: false, publicado: true, pausadoEm: null, pedidosDeAjuda: 0, turnosHoje: 0, falhasHoje: 0, ultimoTurnoEm: null, ultimaAcao: null },
    ],
    caixa: { entradasCents: 0, saidasCents: 0, porDia: [], lancamentosHoje: 2 },
    passagensHoje: 1,
  };

  it("cada personagem é um dado: os agentes, a fila, o caixa e o painel — a copa é lugar, não personagem", () => {
    const { personagens } = montarCena(painel, 3, agora);
    expect(personagens.map((p) => p.id)).toEqual(["agente:a1", "agente:a2", "equipe", "caixa", "painel"]);
    expect(personagens.some((p) => p.setor === "copa")).toBe(false);
    expect(personagens.filter((p) => p.rotina).map((p) => p.id)).toEqual(["agente:a1", "agente:a2"]);
  });

  it("a frase é o fato, nunca sorteada", () => {
    const porId = Object.fromEntries(montarCena(painel, 3, agora).personagens.map((p) => [p.id, p]));
    expect(porId["agente:a1"]).toMatchObject({ tarefa: "Procurar produto na loja", trabalhando: true });
    expect(porId["agente:a2"]).toMatchObject({ tarefa: "Fora do ar: desativado", trabalhando: false, foraDoAr: true });
    expect(porId.equipe!.tarefa).toBe("3 conversas esperando vocês");
    expect(porId.caixa!.tarefa).toBe("2 lançamentos hoje");
    expect(porId.painel!.tarefa).toBe("4 atendimentos de IA · 1 passagem");
  });

  it("pausado pela tela (paused_at) aparece pausado, mesmo ativo e com turno recente", () => {
    const pausada = { ...painel, agentes: [{ ...painel.agentes![0]!, pausadoEm: "2026-10-07T14:58:00.000Z" }] };
    const [bia] = montarCena(pausada, null, agora).personagens;
    expect(bia).toMatchObject({ tarefa: "Pausado", trabalhando: false, pausado: true });
  });

  it("ativo mas sem versão publicada também está fora do ar — o motor não atende sem versão", () => {
    const semVersao = { ...painel, agentes: [{ ...painel.agentes![0]!, publicado: false }] };
    const [bia] = montarCena(semVersao, null, agora).personagens;
    expect(bia).toMatchObject({ tarefa: "Fora do ar: ainda não publicado", foraDoAr: true, trabalhando: false });
  });

  it("pedido de ajuda aberto vira a frase do balão — é o que o dono precisa ver primeiro", () => {
    const comCasos = { ...painel, agentes: [{ ...painel.agentes![0]!, pedidosDeAjuda: 2 }] };
    const [bia] = montarCena(comCasos, null, agora).personagens;
    expect(bia).toMatchObject({ tarefa: "Precisa de você: 2 pedidos de ajuda", ajuda: true });
  });

  it("turno antigo não é 'trabalhando agora'", () => {
    const antigo = { ...painel, agentes: [{ ...painel.agentes![0]!, ultimoTurnoEm: "2026-10-07T10:00:00.000Z" }] };
    const [bia] = montarCena(antigo, null, agora).personagens;
    expect(bia).toMatchObject({ trabalhando: false, tarefa: "4 atendimentos hoje" });
  });

  it("seção sem dado não vira personagem: sem fila lida, sem Equipe", () => {
    const ids = montarCena({ ...painel, caixa: null }, null, agora).personagens.map((p) => p.id);
    expect(ids).not.toContain("equipe");
    expect(ids).not.toContain("caixa");
  });

  it("mais agentes que mesas: os que sobram são contados, não escondidos em silêncio", () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ ...painel.agentes![1]!, id: `x${i}`, nome: `A${i}` }));
    const cena = montarCena({ ...painel, agentes: muitos }, 0, agora);
    expect(cena.agentesAlemDasMesas).toBe(2);
  });

  it("o layout do editor manda: mesa movida e visual escolhido chegam ao personagem", () => {
    const [bia] = montarCena(painel, null, agora, {
      mesas: { a1: [300, 520] },
      visual: { a1: { cabelo: "#ff0000", camisa: "#00ff00", acessorio: null } },
    }).personagens;
    expect(bia).toMatchObject({ mesa: [300, 520], cabelo: "#ff0000", camisa: "#00ff00", acessorio: null });
  });
});
