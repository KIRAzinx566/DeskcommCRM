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
 *   - COPA: onde o agente LIVRE passa o tempo (café, sofá, ping-pong — ver
 *     `./rotina.ts`). Antes era o "Marketing", vazio de propósito: o produto não
 *     tem agente de conteúdo, e desenhar um seria dado de mentira. A copa não
 *     inventa trabalho: só quem está livre vai para lá, e o balão segue dizendo
 *     o fato da cena.
 *
 * Pura e client-safe: recebe a foto do painel e o relógio, devolve a cena.
 */
import type { AgenteNoPainel, PainelDoOrquestra } from "@/lib/orquestra/painel";

import type { Acessorio, Genero, LayoutDoEscritorio } from "./layout";

export type SetorId = "copa" | "comercial" | "ops" | "dados" | "financeiro";

export interface Personagem {
  id: string;
  nome: string;
  setor: SetorId;
  /** Onde fica a mesa, nas coordenadas do mapa (960×620). */
  mesa: [number, number];
  cabelo: string;
  acessorio: Acessorio;
  /** Visual escolhido no editor do hub; sem escolha, o padrão (pele clara, camisa da cor da sala). */
  pele?: string;
  camisa?: string;
  genero?: Genero;
  /*
   * Os campos abaixo são do escritório ao vivo do FBhub (visitantes, fala real,
   * venda, conquistas, expediente, equipe). O desenho é o mesmo arquivo nos dois
   * produtos; aqui no CRM o painel ainda não os preenche, e sem eles o
   * personagem desenha como sempre.
   */
  visitante?: boolean;
  fala?: string;
  destaque?: boolean;
  espera?: { minutos: number; nivel: 0 | 1 | 2 };
  humor?: "feliz" | "neutro" | "irritado";
  comemorando?: boolean;
  medalhas?: string[];
  emCasa?: boolean;
  voltaEm?: string | null;
  humano?: boolean;
  /** A frase do balão — sempre um fato, nunca sorteada. */
  tarefa: string;
  /** Movimento recente: anda até a mesa e trabalha. Parado: fica de pé, sem balão de progresso. */
  trabalhando: boolean;
  pausado: boolean;
  /** Abriu caso que espera uma pessoa: fica na mesa com a mão levantada. */
  ajuda: boolean;
  /** Desativado ou sem versão publicada: descansa na copa, e a mesa fica com a placa. */
  foraDoAr: boolean;
  /** Agente de IA: segue a rotina (mesa ↔ copa). Os demais são dados parados na mesa. */
  rotina: boolean;
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

/** A frase do balão de um agente — o fato mais urgente primeiro. */
/**
 * O nome no mapa: só a parte antes do " — " ("Bia — Consultora FB Digital" vira
 * "Bia"). Nome inteiro não cabe entre duas mesas e atropela o vizinho; o nome
 * completo continua no painel ao lado.
 */
export function nomeCurto(nome: string): string {
  const curto = nome.split(/\s+[—–-]\s+/)[0]!.trim();
  return curto.length > 14 ? `${curto.slice(0, 13)}…` : curto;
}

function tarefaDoAgente(a: AgenteNoPainel, pausado: boolean, recente: boolean): string {
  if (!a.ativo) return "Fora do ar: desativado";
  if (!a.publicado) return "Fora do ar: ainda não publicado";
  if (pausado) return "Pausado";
  if (a.pedidosDeAjuda > 0) return `Precisa de você: ${plural(a.pedidosDeAjuda, "pedido de ajuda", "pedidos de ajuda")}`;
  if (recente && a.ultimaAcao) return a.ultimaAcao.rotulo;
  if (a.turnosHoje > 0) return `${plural(a.turnosHoje, "atendimento", "atendimentos")} hoje`;
  return "Esperando cliente";
}

/** A mesa padrão do i-ésimo agente — as cinco do Atendimento, e depois uma fileira embaixo. */
export function mesaPadrao(i: number): [number, number] {
  return MESAS_DO_ATENDIMENTO[i] ?? [560 + ((i - MESAS_DO_ATENDIMENTO.length) % 5) * 80, 252];
}

/** Quantos agentes o escritório desenha (com o editor dá para mover mesas, então cabem mais que cinco). */
const AGENTES_NO_ESCRITORIO = 10;

export function montarCena(
  painel: Pick<PainelDoOrquestra, "agentes" | "caixa" | "passagensHoje">,
  fila: number | null,
  agora: Date,
  layout?: Pick<LayoutDoEscritorio, "mesas" | "visual">,
): Cena {
  const personagens: Personagem[] = [];
  const agentes = painel.agentes ?? [];
  // Destaque do dia: quem mais atendeu hoje (só se alguém atendeu) — estrela na cabeça.
  const destaque = agentes.reduce<AgenteNoPainel | null>((m, a) => (a.turnosHoje > 0 && (!m || a.turnosHoje > m.turnosHoje) ? a : m), null);

  agentes.slice(0, AGENTES_NO_ESCRITORIO).forEach((a, i) => {
    const recente = !!a.ultimoTurnoEm && agora.getTime() - new Date(a.ultimoTurnoEm).getTime() < RECENTE_MS;
    const foraDoAr = !a.ativo || !a.publicado;
    const pausado = foraDoAr || !!a.pausadoEm;
    const tarefa = tarefaDoAgente(a, pausado, recente);
    const visual = layout?.visual[a.id];
    personagens.push({
      id: `agente:${a.id}`,
      nome: nomeCurto(a.nome),
      setor: "comercial",
      mesa: layout?.mesas[a.id] ?? mesaPadrao(i),
      cabelo: visual?.cabelo ?? CABELOS[i % CABELOS.length]!,
      acessorio: visual?.acessorio === undefined ? "headset" : visual.acessorio,
      pele: visual?.pele,
      camisa: visual?.camisa,
      genero: visual?.genero,
      destaque: destaque?.id === a.id,
      tarefa,
      trabalhando: !pausado && recente,
      pausado,
      ajuda: !pausado && a.pedidosDeAjuda > 0,
      foraDoAr,
      rotina: true,
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
      ajuda: false,
      foraDoAr: false,
      rotina: false,
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
      ajuda: false,
      foraDoAr: false,
      rotina: false,
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
      ajuda: false,
      foraDoAr: false,
      rotina: false,
    });
  }

  return { personagens, agentesAlemDasMesas: Math.max(0, agentes.length - AGENTES_NO_ESCRITORIO) };
}

/** Por onde visitante entra e sai (o corredor na porta do Atendimento) — usado pelo desenho compartilhado. */
export const PORTA_DOS_VISITANTES: [number, number] = [720, 300];
