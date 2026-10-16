// Mesmo arquivo no FBhub (src/lib/mundo/) e no DeskcommCRM (lib/orquestra/mundo/) — só os imports mudam.
/**
 * O DESENHO do Mundo dos agentes — pixel art em canvas, portado do Orquestra.
 *
 * Só desenha: quem aparece e o que cada um está fazendo vem de
 * `./personagens.ts`, que monta a cena a partir dos dados reais. As cores aqui
 * são as do cenário (piso, parede, mobília) e não da marca — o mundo é uma
 * ilustração, igual nos temas claro e escuro, como uma foto seria.
 *
 * Client-only (canvas), sem dependência de React.
 */
import type { Personagem, SetorId } from "./personagens";
import type { Atividade } from "./rotina";
import { CATALOGO, type ItemDoEscritorio, type LayoutDoEscritorio } from "./layout";

type C = CanvasRenderingContext2D;

export const LARGURA = 960;
export const ALTURA = 620;

export interface Setor {
  id: SetorId;
  nome: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cor: string;
}

export const SETORES: Setor[] = [
  { id: "copa", nome: "Copa", x: 40, y: 40, w: 400, h: 230, cor: "#dccfa6" },
  { id: "comercial", nome: "Atendimento", x: 520, y: 40, w: 400, h: 230, cor: "#e0a38f" },
  { id: "ops", nome: "Operações", x: 370, y: 296, w: 220, h: 100, cor: "#b8c9a4" },
  { id: "dados", nome: "Desempenho", x: 40, y: 430, w: 400, h: 160, cor: "#9fb7d9" },
  { id: "financeiro", nome: "Financeiro", x: 520, y: 430, w: 400, h: 160, cor: "#e8c277" },
];
export const setorDe = (id: SetorId) => SETORES.find((s) => s.id === id)!;

/** O estado de animação de um personagem — só visual; o que ele FAZ vem da cena. */
export interface Movimento {
  x: number;
  y: number;
  dir: number;
  passo: number;
  /** 0..1 — a barrinha de progresso de quem está trabalhando. */
  progresso: number;
  alvo: [number, number];
  /** Próximos pontos do caminho (portas e corredor) depois do `alvo`. */
  rota?: Array<[number, number]>;
  /** A atividade para a qual o caminho foi traçado — muda, retraça. */
  atividade?: Atividade;
  /** O destino para o qual o caminho foi traçado — o móvel mudou de lugar, retraça. */
  destino?: string;
}

const R = (c: C, x: number, y: number, w: number, h: number, cor: string) => {
  c.fillStyle = cor;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
const A = (c: C, a: number, f: () => void) => {
  c.globalAlpha = a;
  f();
  c.globalAlpha = 1;
};
const mistura = (hex: string, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k > 0 ? (255 - v) * k : v * k))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
};

// ---------------------------------------------------------------------------
// terreno, pisos e paredes
// ---------------------------------------------------------------------------

function terreno(c: C, tm: number) {
  R(c, 0, 0, LARGURA, ALTURA, "#16241d");
  for (let x = 0; x < LARGURA; x += 12)
    for (let y = 0; y < ALTURA; y += 12) {
      const h = (x * 73 + y * 151) % 11;
      if (h === 0) R(c, x, y, 12, 12, "#1a2b22");
      else if (h === 3) R(c, x + 3, y + 5, 2, 3, "#27402f");
      else if (h === 7) R(c, x + 6, y + 2, 2, 2, "#2e4a36");
    }
  const caminho = (x: number, y: number, w: number, h: number) => {
    R(c, x, y, w, h, "#4b4638");
    R(c, x, y, w, 2, "#5a5442");
    for (let i = x; i < x + w; i += 14)
      for (let j = y; j < y + h; j += 14) R(c, i + 1, j + 1, 12, 12, ((i + j) / 14) % 2 ? "#524c3d" : "#58523f");
  };
  caminho(226, 268, 28, 24);
  caminho(706, 268, 28, 24);
  caminho(226, 274, 508, 18);
  caminho(470, 274, 20, 142);
  caminho(226, 406, 508, 18);
  caminho(226, 394, 28, 40);
  caminho(706, 394, 28, 40);
  for (const [x, y] of [
    [300, 283],
    [660, 283],
    [330, 415],
    [630, 415],
    [480, 300],
  ] as const) {
    R(c, x - 1, y - 14, 3, 16, "#2b2b33");
    R(c, x - 3, y - 18, 7, 5, "#f7e3a1");
    A(c, 0.12 + 0.04 * Math.sin(tm / 500 + x), () => {
      c.fillStyle = "#ffe9a8";
      c.beginPath();
      c.arc(x, y - 16, 22, 0, 7);
      c.fill();
    });
  }
  for (const [x, y] of [
    [10, 20],
    [940, 24],
    [14, 300],
    [944, 310],
    [18, 606],
    [940, 604],
    [470, 18],
    [500, 604],
    [452, 430],
    [506, 430],
  ] as const) {
    R(c, x - 8, y - 6, 16, 12, "#1f3a2a");
    R(c, x - 6, y - 10, 12, 8, "#2d5239");
    R(c, x - 3, y - 12, 6, 4, "#3d6b49");
  }
}

function piso(c: C, s: Setor, cor?: string) {
  const { x, y, w, h } = s;
  if (cor) {
    // piso escolhido no editor: a cor com um xadrez discreto
    R(c, x, y, w, h, cor);
    for (let i = x; i < x + w; i += 16)
      for (let j = y; j < y + h; j += 16) if (((i - x + j - y) / 16) % 2 === 0) R(c, i, j, 16, 16, mistura(cor, 0.06));
    return;
  }
  if (s.id === "copa") {
    R(c, x, y, w, h, "#4a3a2a");
    for (let j = y; j < y + h; j += 12) {
      R(c, x, j, w, 1, "#3a2d20");
      for (let i = x + (((j - y) / 12) % 2) * 30; i < x + w; i += 60) R(c, i, j, 1, 12, "#3a2d20");
    }
  } else if (s.id === "comercial") {
    R(c, x, y, w, h, "#5a3a35");
    for (let i = x; i < x + w; i += 16)
      for (let j = y; j < y + h; j += 16) if (((i - x + j - y) / 16) % 2 === 0) R(c, i, j, 16, 16, "#63403a");
    R(c, x + 6, y + 58, w - 12, 2, "#d9a08a");
    R(c, x + 6, y + h - 8, w - 12, 2, "#d9a08a");
  } else if (s.id === "ops") {
    R(c, x, y, w, h, "#1b2430");
    for (let i = x; i < x + w; i += 20) R(c, i, y, 1, h, "#27425a");
    for (let j = y; j < y + h; j += 20) R(c, x, j, w, 1, "#27425a");
  } else if (s.id === "dados") {
    R(c, x, y, w, h, "#26384f");
    for (let i = x; i < x + w; i += 20)
      for (let j = y; j < y + h; j += 20) if (((i - x + j - y) / 20) % 2 === 0) R(c, i, j, 20, 20, "#2b4059");
  } else {
    R(c, x, y, w, h, "#4f4630");
    for (let i = x; i < x + w; i += 20)
      for (let j = y; j < y + h; j += 20) if (((i - x + j - y) / 20) % 2 === 0) R(c, i, j, 20, 20, "#5b5036");
    R(c, x + 6, y + 54, w - 12, 1, "#e6c36a");
  }
}

function paredes(c: C, s: Setor) {
  const { x, y, w, h } = s;
  const alturaDaParede = s.id === "ops" ? 34 : 54;
  const parede =
    s.id === "copa"
      ? "#6a5640"
      : s.id === "comercial"
        ? "#7a4d46"
        : s.id === "ops"
          ? "#243546"
          : s.id === "dados"
            ? "#2a3f5c"
            : "#6b5d3c";
  R(c, x, y, w, alturaDaParede, parede);
  R(c, x, y + alturaDaParede - 4, w, 4, mistura(parede, -0.35));
  for (let i = x + 8; i < x + w; i += 20) R(c, i, y + 4, 1, alturaDaParede - 10, mistura(parede, 0.06));
  R(c, x, y + alturaDaParede, w, 2, "rgba(0,0,0,.35)");
  const borda = mistura(s.cor, -0.25);
  R(c, x - 4, y - 4, w + 8, 6, borda);
  R(c, x - 4, y - 4, 6, h + 8, borda);
  R(c, x + w - 2, y - 4, 6, h + 8, borda);
  R(c, x - 4, y + h - 2, w + 8, 6, borda);
  // portas: um vão escuro na borda que dá para o caminho
  const porta = (cx: number, topo: boolean) => R(c, cx - 20, topo ? y - 4 : y + h - 2, 40, 6, "#3a3426");
  if (s.id === "copa") porta(240, false);
  else if (s.id === "comercial") porta(720, false);
  else if (s.id === "dados") porta(240, true);
  else if (s.id === "financeiro") porta(720, true);
  else {
    porta(480, true);
    porta(480, false);
  }
}

// ---------------------------------------------------------------------------
// decoração
// ---------------------------------------------------------------------------

const estante = (c: C, x: number, y: number, w: number, h: number) => {
  R(c, x, y, w, h, "#4a3322");
  R(c, x + 2, y + 2, w - 4, h - 4, "#2e2016");
  const cores = ["#d86b6b", "#e0b34a", "#5a9bd6", "#7fc08a", "#b58cff", "#e8e0cf"];
  for (let r = 0; r < Math.floor(h / 14); r++) {
    R(c, x + 2, y + 14 + r * 14, w - 4, 2, "#4a3322");
    for (let i = 0; i < Math.floor((w - 6) / 4); i++)
      R(c, x + 3 + i * 4, y + 4 + r * 14 + ((i * 7 + r) % 3), 3, 10 - ((i * 7 + r) % 3), cores[(i * 5 + r * 3) % cores.length]!);
  }
};
const planta = (c: C, x: number, y: number) => {
  R(c, x - 5, y - 2, 10, 9, "#6d4a2c");
  R(c, x - 6, y - 4, 12, 3, "#85603a");
  R(c, x - 7, y - 14, 14, 11, "#3f7a4b");
  R(c, x - 3, y - 20, 6, 8, "#58a066");
  R(c, x + 3, y - 16, 4, 6, "#6bbb7a");
};
const janela = (c: C, x: number, y: number, w: number, h: number, ceu: string, tm: number) => {
  R(c, x - 3, y - 3, w + 6, h + 6, "#2d241c");
  R(c, x, y, w, h, ceu);
  A(c, 0.25, () => R(c, x, y, w, h / 2, "#fff"));
  R(c, x + w / 2 - 1, y, 2, h, "#2d241c");
  R(c, x, y + h / 2 - 1, w, 2, "#2d241c");
  A(c, 0.25 + 0.1 * Math.sin(tm / 900), () => R(c, x + 3, y + 3, 6, h - 6, "#fff"));
};
const tela = (c: C, x: number, y: number, w: number, h: number, cor: string, tm: number, semente: number, barras = false) => {
  R(c, x - 2, y - 2, w + 4, h + 4, "#0c0f14");
  R(c, x, y, w, h, "#0f1a24");
  if (!barras) {
    c.strokeStyle = cor;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= w; i += 2) {
      const v = Math.sin((i + tm / 90 + semente * 13) / 5) * (h / 4) + Math.sin((i + semente) / 2.3) * 1.2;
      if (i) c.lineTo(x + i, y + h / 2 + v);
      else c.moveTo(x + i, y + h / 2 + v);
    }
    c.stroke();
  } else {
    for (let i = 0; i < Math.floor(w / 5); i++) {
      const bh = (Math.sin(tm / 600 + i * 1.7 + semente) * 0.5 + 0.5) * (h - 4) + 2;
      R(c, x + 2 + i * 5, y + h - 2 - bh, 3, bh, cor);
    }
  }
};

/** A copa: onde quem está livre toma café, descansa e joga. Coordenadas do mapa (a copa vai de 40,40 a 440,270). */
/** A parede da copa (janelas, quadro, relógio). Os móveis são itens do layout — ver `desenharItem`. */
function decorCopa(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  janela(c, x + 352, y + 8, 38, 36, "#8fc8ff", tm);
  janela(c, x + 300, y + 8, 38, 36, "#8fc8ff", tm);
  R(c, x + 200, y + 10, 70, 32, "#5a3f26");
  R(c, x + 203, y + 13, 64, 26, "#a47a4b");
  for (let i = 0; i < 4; i++) R(c, x + 208 + i * 15, y + 17 + (i % 2) * 6, 11, 10, ["#ffd45e", "#ff8fa3", "#7ad7f0", "#9be37f"][i]!);
  R(c, x + 160, y + 14, 22, 22, "#eef0ff");
  R(c, x + 170, y + 18, 2, 8, "#1b1f2a");
  R(c, x + 170, y + 25, 6, 2, "#1b1f2a");
}

/** Um móvel do layout, com (x, y) no canto superior esquerdo. */
function desenharItem(c: C, item: ItemDoEscritorio, tm: number, pingpong: boolean) {
  const { x, y } = item;
  switch (item.tipo) {
    case "cafeteira":
      R(c, x, y + 14, 110, 18, "#6b4a2c");
      R(c, x, y + 14, 110, 4, "#a0764a");
      R(c, x + 10, y, 18, 16, "#2b2b33");
      R(c, x + 14, y + 4, 10, 6, "#4a4a55");
      A(c, 0.5 + 0.5 * Math.sin(tm / 400), () => R(c, x + 25, y + 3, 2, 2, "#ff6b6b"));
      R(c, x + 40, y + 8, 8, 8, "#f5f5f5");
      R(c, x + 52, y + 8, 8, 8, "#f5f5f5");
      R(c, x + 80, y + 4, 20, 12, "#d8c8a0");
      return;
    case "bebedouro":
      R(c, x, y + 12, 16, 34, "#cfd8e3");
      R(c, x + 2, y, 12, 14, "#7cc4ff");
      A(c, 0.35, () => R(c, x + 4, y + 2, 4, 10, "#fff"));
      R(c, x + 4, y + 28, 8, 3, "#3a4656");
      return;
    case "pingpong":
      R(c, x, y + 2, 80, 34, "#14532d");
      R(c, x + 2, y + 4, 76, 30, "#1f7a43");
      R(c, x + 2, y + 18, 76, 2, "#eef0ff");
      R(c, x + 39, y, 2, 38, "#d1d5db");
      R(c, x + 4, y + 36, 4, 8, "#2b2b33");
      R(c, x + 72, y + 36, 4, 8, "#2b2b33");
      if (pingpong) {
        const k = (Math.sin(tm / 260) + 1) / 2;
        const by = y + 14 - Math.abs(Math.sin(tm / 130)) * 10;
        R(c, x + 2 + k * 76 - 2, by - 2, 4, 4, "#fff7d6");
      }
      return;
    case "tapete":
      R(c, x, y, 110, 52, "#7a3b4b");
      R(c, x + 4, y + 4, 102, 44, "#a3485f");
      return;
    case "sofa":
      R(c, x + 4, y, 108, 12, "#3b4a7a");
      R(c, x + 4, y + 12, 108, 14, "#4d5f99");
      R(c, x, y + 2, 8, 26, "#3b4a7a");
      R(c, x + 108, y + 2, 8, 26, "#3b4a7a");
      return;
    case "puff":
      R(c, x + 1, y + 2, 16, 12, "#b45309");
      R(c, x + 3, y, 12, 6, "#d97706");
      A(c, 0.3, () => R(c, x + 4, y + 1, 4, 3, "#fff"));
      return;
    case "planta":
      planta(c, x + 7, y + 20);
      return;
    case "estante":
      estante(c, x, y, 20, 66);
      return;
    case "fliperama":
      R(c, x, y, 22, 36, "#3b0764");
      R(c, x + 3, y + 4, 16, 12, "#0f1a24");
      A(c, 0.8, () => R(c, x + 5 + Math.round(((tm / 120) % 10)), y + 8, 3, 3, "#f472b6"));
      R(c, x + 4, y + 20, 14, 6, "#6d28d9");
      R(c, x + 7, y + 21, 2, 3, "#fde047");
      R(c, x + 13, y + 22, 3, 3, "#ef4444");
      return;
    case "geladeira":
      R(c, x, y, 22, 42, "#e5e7eb");
      R(c, x, y + 16, 22, 2, "#9ca3af");
      R(c, x + 17, y + 6, 2, 6, "#6b7280");
      R(c, x + 17, y + 22, 2, 10, "#6b7280");
      return;
    case "mesinha":
      R(c, x, y, 34, 12, "#8a6d48");
      R(c, x, y, 34, 3, "#a98a5f");
      R(c, x + 3, y + 12, 3, 6, "#5a4630");
      R(c, x + 28, y + 12, 3, 6, "#5a4630");
      R(c, x + 12, y + 4, 6, 5, "#f5f5f5");
      return;
  }
}

function decorAtendimento(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  janela(c, x + 10, y + 8, 38, 36, "#ffd49b", tm);
  janela(c, x + 352, y + 8, 38, 36, "#ffd49b", tm);
  R(c, x + 108, y + 4, 184, 44, "#1b1218");
  R(c, x + 111, y + 7, 178, 38, "#2a1c23");
  const barras = ["#5aa2ff", "#4cd68a", "#f4d35e", "#ff9d6b", "#b58cff"];
  for (let i = 0; i < 5; i++) {
    const bw = 150 - i * 26;
    R(c, x + 200 - bw / 2, y + 10 + i * 7, bw, 5, barras[i]!);
  }
  R(c, x + 346, y + 150, 26, 34, "#2b2b33");
  R(c, x + 354, y + 168, 10, 8, "#e8e0cf");
  A(c, 0.5 + 0.5 * Math.sin(tm / 300), () => R(c, x + 366, y + 156, 3, 3, "#ff6b6b"));
  planta(c, x + 14, y + 100);
  planta(c, x + 380, y + 224);
}
function decorOperacoes(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  tela(c, x + 14, y + 6, 54, 22, "#6fd1ff", tm, 1);
  tela(c, x + 83, y + 6, 54, 22, "#7ee0a0", tm, 0);
  tela(c, x + 152, y + 6, 54, 22, "#ffd45e", tm, 4, true);
  for (const rx of [x + 6, x + 196]) {
    R(c, rx, y + 44, 18, 52, "#14181f");
    for (let i = 0; i < 6; i++) {
      R(c, rx + 2, y + 47 + i * 8, 14, 6, "#222a36");
      A(c, Math.sin(tm / 200 + i * 2 + rx) > 0 ? 1 : 0.25, () => R(c, rx + 3, y + 49 + i * 8, 2, 2, i % 2 ? "#7ee0a0" : "#6fd1ff"));
    }
  }
}
function decorDesempenho(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  tela(c, x + 16, y + 6, 92, 36, "#6fd1ff", tm, 2, true);
  tela(c, x + 118, y + 6, 34, 36, "#ffd45e", tm, 7);
  R(c, x + 160, y + 4, 90, 44, "#0c0f14");
  R(c, x + 163, y + 7, 84, 38, "#0f1a24");
  c.strokeStyle = "#4cd68a";
  c.lineWidth = 1.5;
  c.beginPath();
  for (let i = 0; i <= 78; i += 2) {
    const v = Math.sin((i + tm / 120) / 7) * 6 + (i / 78) * -10;
    if (i) c.lineTo(x + 166 + i, y + 28 + v);
    else c.moveTo(x + 166 + i, y + 28 + v);
  }
  c.stroke();
  planta(c, x + 14, y + 150);
  planta(c, x + 350, y + 150);
}
function decorFinanceiro(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  R(c, x + 28, y + 6, 58, 46, "#2a2a30");
  R(c, x + 31, y + 9, 52, 40, "#8f959f");
  R(c, x + 35, y + 13, 44, 32, "#aab1bd");
  c.fillStyle = "#6e7480";
  c.beginPath();
  c.arc(x + 57, y + 29, 10, 0, 7);
  c.fill();
  R(c, x + 146, y + 6, 126, 42, "#0c0f14");
  R(c, x + 149, y + 9, 120, 36, "#0f1a24");
  R(c, x + 154, y + 13, 50, 3, "#4cd68a");
  R(c, x + 214, y + 13, 50, 3, "#ff6b8b");
  tela(c, x + 284, y + 8, 98, 38, "#4cd68a", tm, 3, true);
  planta(c, x + 14, y + 146);
  planta(c, x + 384, y + 150);
}

// ---------------------------------------------------------------------------
// mesas e personagens
// ---------------------------------------------------------------------------

function mesa(c: C, p: Personagem, tm: number) {
  const [dx, dy] = p.mesa;
  const cor = setorDe(p.setor).cor;
  if (p.setor === "ops") {
    R(c, dx - 44, dy - 12, 88, 24, "#101620");
    R(c, dx - 44, dy - 12, 88, 3, "#27425a");
    tela(c, dx - 38, dy - 24, 24, 12, "#6fd1ff", tm, 1, true);
    tela(c, dx - 10, dy - 26, 20, 14, "#7ee0a0", tm, 3);
    tela(c, dx + 14, dy - 24, 24, 12, "#ffd45e", tm, 5, true);
    return;
  }
  R(c, dx - 26, dy - 10, 52, 22, "#2a2118");
  R(c, dx - 26, dy - 10, 52, 5, "#8a6d48");
  R(c, dx - 8, dy - 24, 20, 14, "#0c0f14");
  R(c, dx - 6, dy - 22, 16, 10, "#0f1a24");
  for (let i = 0; i < 4; i++) R(c, dx - 5, dy - 21 + i * 2.5, 6 + ((tm / 200 + i * 3 + dx) % 9), 1.5, i % 2 ? cor : "#9fb3d6");
  R(c, dx + 16, dy - 8, 6, 6, "#e8e0cf");
  R(c, dx - 9, dy + 12, 18, 9, "#1b1f2a");
  if (p.foraDoAr) {
    // mesa vazia: o agente está descansando na copa, e a placa diz por quê
    c.font = "700 8px system-ui, sans-serif";
    c.textAlign = "center";
    R(c, dx - 24, dy - 4, 48, 11, "#7a1f2b");
    c.fillStyle = "#ffe4e6";
    c.fillText("FORA DO AR", dx, dy + 4);
    c.textAlign = "left";
  }
}

function personagem(
  c: C,
  p: Personagem,
  m: Movimento,
  selecionado: boolean,
  tm: number,
  falaAgora: boolean,
  atividade: Atividade | undefined,
) {
  const cor = p.camisa ?? (p.pausado ? "#7a7f8c" : setorDe(p.setor).cor);
  const pele = p.pele ?? "#f0cfa8";
  const andando = Math.hypot(m.alvo[0] - m.x, m.alvo[1] - m.y) > 1 || (m.rota?.length ?? 0) > 0;
  // a pose só vale quando chegou; andando, é só andar
  const pose = andando ? undefined : atividade;
  const sentado = pose === "sofa" || pose === "dormindo" || pose === "descansando";
  const digitando = p.trabalhando || pose === "digitando";
  const pulo = andando
    ? Math.abs(Math.sin(m.passo)) * 2
    : sentado
      ? 0
      : digitando
        ? Math.sin(m.passo * 0.8)
        : Math.sin(tm / 700 + p.nome.length) * 0.6;
  const x = Math.round(m.x);
  const y = Math.round(m.y - pulo + (sentado ? 3 : 0));
  const d = m.dir;
  A(c, 0.45, () => {
    c.fillStyle = "#000";
    c.beginPath();
    c.ellipse(x, m.y + 12, 9, 3.5, 0, 0, 7);
    c.fill();
  });
  if (selecionado) {
    c.strokeStyle = "#fff";
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(x, m.y + 12, 13, 5, 0, 0, 7);
    c.stroke();
  }
  const perna = andando ? Math.round(Math.sin(m.passo) * 2.5) : 0;
  if (sentado) {
    R(c, x - 5, y + 7, 10, 3, "#252a3a");
  } else {
    R(c, x - 5, y + 7, 4, 6 + perna, "#252a3a");
    R(c, x + 1, y + 7, 4, 6 - perna, "#252a3a");
  }
  R(c, x - 7, y - 6, 14, 14, "#101018");
  R(c, x - 6, y - 5, 12, 12, cor);
  R(c, x - 6, y + 3, 12, 4, mistura(cor, -0.25));
  // braços: cada pose mexe de um jeito
  const balanco = Math.sin(tm / 180);
  if (pose === "alongar") {
    const sobe = Math.sin(tm / 500) > 0;
    R(c, x - 9, y - (sobe ? 18 : 10), 3, 10, cor);
    R(c, x + 6, y - (sobe ? 10 : 18), 3, 10, cor);
  } else if (pose === "ajuda") {
    R(c, x - 9, y - 3, 3, 8, cor);
    R(c, x + 6, y - 20 + Math.round(balanco), 3, 14, cor);
    R(c, x + 6, y - 23 + Math.round(balanco), 4, 4, pele);
  } else if (pose === "pingpong") {
    R(c, x - 9, y - 3, 3, 8, cor);
    const raquete = Math.round(balanco * 3);
    R(c, x + 6, y - 6 + raquete, 3, 8, cor);
    R(c, x + (d > 0 ? 9 : -12), y - 8 + raquete, 6, 6, "#d94a4a");
  } else {
    const braco = digitando ? Math.round(Math.sin(m.passo * 1.4) * 2) : perna;
    R(c, x - 9, y - 4 + (braco > 0 ? -1 : 1), 3, 8, cor);
    R(c, x + 6, y - 4 + (braco > 0 ? 1 : -1), 3, 8, cor);
  }
  R(c, x - 6, y - 16, 12, 11, "#101018");
  R(c, x - 5, y - 15, 10, 10, pele);
  R(c, x - 6, y - 18, 12, 5, p.cabelo);
  R(c, x - 6, y - 14, 2, 6, p.cabelo);
  if (pose === "dormindo") {
    R(c, x - 4, y - 10, 3, 1, "#1b1f1b");
    R(c, x + 1, y - 10, 3, 1, "#1b1f1b");
  } else {
    R(c, x + (d > 0 ? 0 : -4), y - 11, 2, 2, "#1b1f1b");
    R(c, x + (d > 0 ? 3 : -1), y - 11, 2, 2, "#1b1f1b");
  }
  if (p.acessorio === "headset") {
    R(c, x - 7, y - 14, 2, 6, "#222");
    R(c, x + 5, y - 14, 2, 6, "#222");
    R(c, x - 6, y - 19, 12, 2, "#222");
    R(c, x + (d > 0 ? 3 : -6), y - 8, 5, 2, "#222");
  } else if (p.acessorio === "coroa") {
    R(c, x - 6, y - 22, 12, 4, "#f4d35e");
    for (const k of [-6, -2, 2]) R(c, x + k, y - 25, 3, 3, "#f4d35e");
  } else if (p.acessorio === "viseira") {
    R(c, x - 6, y - 14, 12, 3, "#2d6bd1");
  } else if (p.acessorio === "gravata") {
    R(c, x - 1, y - 5, 3, 9, "#d94a4a");
  } else if (p.acessorio === "oculos") {
    R(c, x - 5, y - 12, 10, 1, "#222");
  }
  // o objeto na mão
  if (pose === "cafe" || pose === "agua") {
    const xc = x + (d > 0 ? 8 : -12);
    R(c, xc, y - 2, 5, 6, pose === "cafe" ? "#f5f5f5" : "#9fd8ff");
    if (pose === "cafe") A(c, 0.5, () => R(c, xc + 1 + Math.round(Math.sin(tm / 300)), y - 7, 2, 4, "#e5e7eb"));
  } else if (pose === "planta") {
    R(c, x + (d > 0 ? 8 : -16), y - 1, 8, 6, "#3f9d5a");
    if (Math.sin(tm / 200) > 0) R(c, x + (d > 0 ? 17 : -19), y + 5, 2, 3, "#7cc4ff");
  } else if (pose === "descansando") {
    // lendo um livro
    R(c, x - 5, y - 3, 10, 7, "#7c2d12");
    R(c, x - 4, y - 2, 4, 5, "#fef3c7");
    R(c, x + 1, y - 2, 3, 5, "#fef3c7");
  } else if (pose === "sofa") {
    // no celular
    R(c, x - 2, y - 2, 4, 6, "#1b1f2a");
    A(c, 0.6, () => R(c, x - 1, y - 1, 2, 3, "#7cc4ff"));
  }
  if (pose === "dormindo") {
    c.font = "700 9px system-ui, sans-serif";
    const z = (tm / 900) % 1;
    A(c, 1 - z, () => {
      c.fillStyle = "#c9cdea";
      c.fillText("z", x + 8 + z * 6, y - 18 - z * 10);
      c.fillText("Z", x + 12 + z * 8, y - 26 - z * 12);
    });
  }
  if (pose === "ajuda") {
    // o "!" chama quem está olhando
    const pulse = 1 + Math.abs(Math.sin(tm / 250)) * 2;
    R(c, x - 5, y - 44 - pulse, 10, 14, "#f4d35e");
    R(c, x - 1, y - 42 - pulse, 2, 6, "#0b0e22");
    R(c, x - 1, y - 34 - pulse, 2, 2, "#0b0e22");
  }
  c.font = "700 12px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  const largura = c.measureText(p.nome).width + 10;
  A(c, 0.8, () => R(c, x - largura / 2, y + 15, largura, 16, "#0b0e22"));
  c.fillStyle = "#eef0ff";
  c.fillText(p.nome, x, y + 27);
  if (digitando && !andando) {
    R(c, x - 13, y - 29, 26, 5, "rgba(0,0,0,.65)");
    R(c, x - 12, y - 28, 24 * m.progresso, 3, cor);
  }
  if (selecionado || falaAgora) {
    const t = p.tarefa.length > 34 ? `${p.tarefa.slice(0, 33)}…` : p.tarefa;
    c.font = "600 12px system-ui, sans-serif";
    const bw = c.measureText(t).width + 16;
    const topo = pose === "ajuda" ? y - 76 : y - 58;
    R(c, x - bw / 2, topo, bw, 22, "#eef0ff");
    R(c, x - 3, topo + 21, 6, 4, "#eef0ff");
    c.fillStyle = "#0b0e22";
    c.fillText(t, x, topo + 15);
  }
  c.textAlign = "left";
}

function placa(c: C, s: Setor, direita: boolean, nome?: string) {
  c.font = "700 12px system-ui, sans-serif";
  const t = (nome ?? s.nome).toUpperCase();
  const w = c.measureText(t).width + 30;
  const x = direita ? s.x + s.w - w - 10 : s.x + 10;
  const y = s.y - 18;
  R(c, x, y, w, 18, "#0b0e22");
  R(c, x, y + 16, w, 2, s.cor);
  R(c, x + 6, y + 6, 6, 6, s.cor);
  c.fillStyle = "#eef0ff";
  c.textBaseline = "middle";
  c.fillText(t, x + 18, y + 9);
  c.textBaseline = "alphabetic";
}

/** Um aviso escrito NO CHÃO de um setor — para o vazio dizer que é vazio. */
function avisoNoChao(c: C, s: Setor, texto: string) {
  c.font = "500 12px system-ui, sans-serif";
  c.textAlign = "center";
  const w = c.measureText(texto).width + 20;
  A(c, 0.8, () => R(c, s.x + s.w / 2 - w / 2, s.y + s.h / 2 + 30, w, 22, "#0b0e22"));
  c.fillStyle = "#c9cdea";
  c.fillText(texto, s.x + s.w / 2, s.y + s.h / 2 + 45);
  c.textAlign = "left";
}

export interface Vista {
  x: number;
  y: number;
  k: number;
}

export function desenharMundo(
  c: C,
  dpr: number,
  tm: number,
  personagens: readonly Personagem[],
  movimentos: Readonly<Record<string, Movimento>>,
  opcoes: {
    selecionado?: string;
    vista?: Vista;
    avisos?: Partial<Record<SetorId, string>>;
    atividades?: Readonly<Record<string, Atividade>>;
    pingpong?: boolean;
    layout?: Pick<LayoutDoEscritorio, "itens" | "salas">;
    /** Modo de edição: contorno nos móveis e nas mesas, e o escolhido em destaque. */
    editando?: boolean;
    /** No editor: `item:<id>` ou `mesa:<id do personagem>`. */
    escolhidoNoEditor?: string | null;
  } = {},
) {
  const k = opcoes.vista?.k ?? 1;
  c.setTransform(dpr * k, 0, 0, dpr * k, opcoes.vista ? -opcoes.vista.x * dpr * k : 0, opcoes.vista ? -opcoes.vista.y * dpr * k : 0);
  c.imageSmoothingEnabled = false;
  terreno(c, tm);
  for (const s of SETORES) {
    A(c, 0.4, () => R(c, s.x + 6, s.y + 8, s.w, s.h, "#000"));
    piso(c, s, opcoes.layout?.salas[s.id]?.piso);
    paredes(c, s);
    if (s.id === "copa") decorCopa(c, s, tm);
    else if (s.id === "comercial") decorAtendimento(c, s, tm);
    else if (s.id === "ops") decorOperacoes(c, s, tm);
    else if (s.id === "dados") decorDesempenho(c, s, tm);
    else decorFinanceiro(c, s, tm);
  }
  const itens = (opcoes.layout?.itens ?? []).slice().sort((a, b) => a.y + CATALOGO[a.tipo].h - (b.y + CATALOGO[b.tipo].h));
  // tapete primeiro: fica embaixo de tudo
  for (const item of itens) if (item.tipo === "tapete") desenharItem(c, item, tm, false);
  for (const item of itens) if (item.tipo !== "tapete") desenharItem(c, item, tm, !!opcoes.pingpong);
  for (const p of personagens) mesa(c, p, tm);
  if (opcoes.editando) {
    const contorno = (x: number, y: number, w: number, h: number, escolhido: boolean) => {
      c.strokeStyle = escolhido ? "#facc15" : "rgba(255,255,255,.45)";
      c.lineWidth = escolhido ? 2 : 1;
      c.setLineDash(escolhido ? [] : [4, 3]);
      c.strokeRect(x - 2, y - 2, w + 4, h + 4);
      c.setLineDash([]);
    };
    for (const item of itens) {
      const { w, h } = CATALOGO[item.tipo];
      contorno(item.x, item.y, w, h, opcoes.escolhidoNoEditor === `item:${item.id}`);
    }
    for (const p of personagens) {
      if (!p.rotina) continue;
      contorno(p.mesa[0] - 26, p.mesa[1] - 24, 52, 46, opcoes.escolhidoNoEditor === `mesa:${p.id}`);
    }
  }
  // Quem fala agora: um balão de cada vez, em rodízio, para não virar parede de texto.
  const vez = Math.floor(tm / 2200) % Math.max(1, personagens.length);
  const ordem = personagens.slice().sort((a, b) => (movimentos[a.id]?.y ?? 0) - (movimentos[b.id]?.y ?? 0));
  for (const p of ordem) {
    const m = movimentos[p.id];
    if (m) personagem(c, p, m, opcoes.selecionado === p.id, tm, personagens.indexOf(p) === vez, opcoes.atividades?.[p.id]);
  }
  for (const s of SETORES) {
    placa(c, s, s.id === "financeiro" || s.id === "ops", opcoes.layout?.salas[s.id]?.nome);
    const aviso = opcoes.avisos?.[s.id];
    if (aviso) avisoNoChao(c, s, aviso);
  }
}

/** Um passo da animação: anda até o alvo, e quem trabalha enche a barrinha. */
export function avancar(m: Movimento, trabalhando: boolean, dt: number): void {
  m.passo += dt * 6;
  const dx = m.alvo[0] - m.x;
  const dy = m.alvo[1] - m.y;
  const dist = Math.hypot(dx, dy);
  const velocidade = 62 * dt;
  if (dist > velocidade) {
    m.x += (dx / dist) * velocidade;
    m.y += (dy / dist) * velocidade;
    if (Math.abs(dx) > 1) m.dir = dx > 0 ? 1 : -1;
    return;
  }
  m.x = m.alvo[0];
  m.y = m.alvo[1];
  const proximo = m.rota?.shift();
  if (proximo) {
    m.alvo = proximo;
    return;
  }
  m.progresso = trabalhando ? (m.progresso + dt / 6) % 1 : 0;
}
