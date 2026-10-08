/**
 * QUEM APARECE NO MUNDO DOS AGENTES — e por quê.
 *
 * O mundo do Orquestra original era povoado por treze personagens inventados
 * (Mira, Pixel, Corvo…) com tarefas sorteadas de uma lista. Aqui cada
 * personagem é UM DADO do produto, e a frase em cima da cabeça dele é o que esse
 * dado diz agora:
 *
 *   - ATENDIMENTO: um personagem por agente de IA da organização. A frase é a
 *     última ferramenta que ele usou (para quem administra) ou quantas conversas
 *     atendeu hoje; ele "trabalha" quando teve turno nos últimos minutos.
 *   - OPERAÇÕES: a Equipe — quantas conversas esperam uma pessoa (a mesma conta
 *     da Fila do Inbox).
 *   - FINANCEIRO: o Caixa — os lançamentos pagos de hoje.
 *   - DESEMPENHO: o Painel — quantos turnos de IA hoje, e quantas passagens.
 *   - MARKETING: vazio. O produto não tem agente de conteúdo, e desenhar um
 *     seria exatamente o dado de mentira que esta versão existe para tirar.
 *
 * Pura e client-safe: recebe a foto do painel e o relógio, devolve a cena.
 */
import type { PainelDoOrquestra } from "@/lib/orquestra/painel";

export type SetorId = "marketing" | "comercial" | "ops" | "dados" | "financeiro";

export interface Personagem {
  id: string;
  nome: string;
  setor: SetorId;
  /** Onde fica a mesa, nas coordenadas do mapa (960×620). */
  mesa: [number, number];
  cabelo: string;
  acessorio: "headset" | "oculos" | "viseira" | "gravata" | "coroa" | null;
  /** A frase do balão — sempre um fato, nunca sorteada. */
  tarefa: string;
  /** Movimento recente: anda até a mesa e trabalha. Parado: fica de pé, sem balão de progresso. */
  trabalhando: boolean;
  pausado: boolean;
}

/** Mesas do Atendimento, na ordem em que os agentes ocupam. */
const MESAS_DO_ATENDIMENTO: Array<[number, number]> = [
  [590, 140],
  [720, 130],
  [840, 140],
  [640, 214],
  [790, 214],
];
const CABELOS = ["#c79a3a", "#3b2a22", "#7a3b3b", "#6b4a2b", "#2a2a2a"];

/** Turno nos últimos 10 minutos = trabalhando agora. */
const RECENTE_MS = 10 * 60_000;

export interface Cena {
  personagens: Personagem[];
  /** Agentes que não couberam nas mesas do Atendimento. */
  agentesAlemDasMesas: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function montarCena(
  painel: Pick<PainelDoOrquestra, "agentes" | "caixa" | "passagensHoje">,
  fila: number | null,
  agora: Date,
): Cena {
  const personagens: Personagem[] = [];
  const agentes = painel.agentes ?? [];

  agentes.slice(0, MESAS_DO_ATENDIMENTO.length).forEach((a, i) => {
    const recente = !!a.ultimoTurnoEm && agora.getTime() - new Date(a.ultimoTurnoEm).getTime() < RECENTE_MS;
    const tarefa = !a.ativo
      ? "Pausado"
      : recente && a.ultimaAcao
        ? a.ultimaAcao.rotulo
        : a.turnosHoje > 0
          ? `${plural(a.turnosHoje, "atendimento", "atendimentos")} hoje`
          : "Esperando cliente";
    personagens.push({
      id: `agente:${a.id}`,
      nome: a.nome,
      setor: "comercial",
      mesa: MESAS_DO_ATENDIMENTO[i]!,
      cabelo: CABELOS[i % CABELOS.length]!,
      acessorio: "headset",
      tarefa,
      trabalhando: a.ativo && recente,
      pausado: !a.ativo,
    });
  });

  if (fila !== null) {
    personagens.push({
      id: "equipe",
      nome: "Equipe",
      setor: "ops",
      mesa: [480, 352],
      cabelo: "#d8d8d8",
      acessorio: "coroa",
      tarefa: fila > 0 ? `${plural(fila, "conversa esperando", "conversas esperando")} vocês` : "Ninguém esperando",
      trabalhando: fila > 0,
      pausado: false,
    });
  }

  if (painel.caixa) {
    const n = painel.caixa.lancamentosHoje;
    personagens.push({
      id: "caixa",
      nome: "Caixa",
      setor: "financeiro",
      mesa: [720, 520],
      cabelo: "#6a4f1d",
      acessorio: "gravata",
      tarefa: n > 0 ? `${plural(n, "lançamento", "lançamentos")} hoje` : "Nenhum lançamento hoje",
      trabalhando: n > 0,
      pausado: false,
    });
  }

  if (painel.agentes) {
    const turnos = agentes.reduce((s, a) => s + a.turnosHoje, 0);
    const passagens = painel.passagensHoje ?? 0;
    personagens.push({
      id: "painel",
      nome: "Painel",
      setor: "dados",
      mesa: [220, 525],
      cabelo: "#355c8a",
      acessorio: "viseira",
      tarefa:
        turnos > 0
          ? `${plural(turnos, "atendimento", "atendimentos")} de IA · ${plural(passagens, "passagem", "passagens")}`
          : "Sem atendimento de IA hoje",
      trabalhando: turnos > 0,
      pausado: false,
    });
  }

  return { personagens, agentesAlemDasMesas: Math.max(0, agentes.length - MESAS_DO_ATENDIMENTO.length) };
}
