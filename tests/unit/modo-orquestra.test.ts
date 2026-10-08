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
        turnosHoje: 4,
        falhasHoje: 0,
        ultimoTurnoEm: "2026-10-07T14:57:00.000Z",
        ultimaAcao: { rotulo: "Procurar produto na loja", em: "2026-10-07T14:57:00.000Z" },
      },
      { id: "a2", nome: "Leo", ativo: false, turnosHoje: 0, falhasHoje: 0, ultimoTurnoEm: null, ultimaAcao: null },
    ],
    caixa: { entradasCents: 0, saidasCents: 0, porDia: [], lancamentosHoje: 2 },
    passagensHoje: 1,
  };

  it("cada personagem é um dado: os agentes, a fila, o caixa e o painel — e o Marketing vazio", () => {
    const { personagens } = montarCena(painel, 3, agora);
    expect(personagens.map((p) => p.id)).toEqual(["agente:a1", "agente:a2", "equipe", "caixa", "painel"]);
    expect(personagens.some((p) => p.setor === "marketing")).toBe(false);
  });

  it("a frase é o fato, nunca sorteada", () => {
    const porId = Object.fromEntries(montarCena(painel, 3, agora).personagens.map((p) => [p.id, p]));
    expect(porId["agente:a1"]).toMatchObject({ tarefa: "Procurar produto na loja", trabalhando: true });
    expect(porId["agente:a2"]).toMatchObject({ tarefa: "Pausado", trabalhando: false, pausado: true });
    expect(porId.equipe!.tarefa).toBe("3 conversas esperando vocês");
    expect(porId.caixa!.tarefa).toBe("2 lançamentos hoje");
    expect(porId.painel!.tarefa).toBe("4 atendimentos de IA · 1 passagem");
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
    const muitos = Array.from({ length: 7 }, (_, i) => ({ ...painel.agentes![1]!, id: `x${i}`, nome: `A${i}` }));
    const cena = montarCena({ ...painel, agentes: muitos }, 0, agora);
    expect(cena.agentesAlemDasMesas).toBe(2);
  });
});
