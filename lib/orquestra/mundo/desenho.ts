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
  { id: "marketing", nome: "Marketing", x: 40, y: 40, w: 400, h: 230, cor: "#dccfa6" },
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

function piso(c: C, s: Setor) {
  const { x, y, w, h } = s;
  if (s.id === "marketing") {
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
    s.id === "marketing"
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
  if (s.id === "marketing") porta(240, false);
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

function decorMarketing(c: C, s: Setor, tm: number) {
  const { x, y } = s;
  janela(c, x + 352, y + 8, 38, 36, "#8fc8ff", tm);
  janela(c, x + 10, y + 8, 38, 36, "#8fc8ff", tm);
  R(c, x + 130, y + 6, 130, 40, "#5a3f26");
  R(c, x + 133, y + 9, 124, 34, "#a47a4b");
  const notas = ["#ffd45e", "#ff8fa3", "#7ad7f0", "#9be37f", "#c8a2ff"];
  for (let i = 0; i < 9; i++) R(c, x + 138 + (i % 5) * 23, y + 12 + Math.floor(i / 5) * 16, 15, 13, notas[i % notas.length]!);
  R(c, x + 160, y + 156, 140, 52, "#7a3b4b");
  R(c, x + 164, y + 160, 132, 44, "#a3485f");
  estante(c, x + 376, y + 66, 20, 66);
  planta(c, x + 84, y + 224);
  planta(c, x + 380, y + 224);
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
}

function personagem(c: C, p: Personagem, m: Movimento, selecionado: boolean, tm: number, falaAgora: boolean) {
  const cor = p.pausado ? "#7a7f8c" : setorDe(p.setor).cor;
  const andando = Math.hypot(m.alvo[0] - m.x, m.alvo[1] - m.y) > 1;
  const pulo = andando ? Math.abs(Math.sin(m.passo)) * 2 : p.trabalhando ? Math.sin(m.passo * 0.8) : Math.sin(tm / 700 + p.nome.length) * 0.6;
  const x = Math.round(m.x);
  const y = Math.round(m.y - pulo);
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
  R(c, x - 5, y + 7, 4, 6 + perna, "#252a3a");
  R(c, x + 1, y + 7, 4, 6 - perna, "#252a3a");
  R(c, x - 7, y - 6, 14, 14, "#101018");
  R(c, x - 6, y - 5, 12, 12, cor);
  R(c, x - 6, y + 3, 12, 4, mistura(cor, -0.25));
  const braco = p.trabalhando ? Math.round(Math.sin(m.passo * 1.4) * 2) : perna;
  R(c, x - 9, y - 4 + (braco > 0 ? -1 : 1), 3, 8, cor);
  R(c, x + 6, y - 4 + (braco > 0 ? 1 : -1), 3, 8, cor);
  R(c, x - 6, y - 16, 12, 11, "#101018");
  R(c, x - 5, y - 15, 10, 10, "#f0cfa8");
  R(c, x - 6, y - 18, 12, 5, p.cabelo);
  R(c, x - 6, y - 14, 2, 6, p.cabelo);
  R(c, x + (d > 0 ? 0 : -4), y - 11, 2, 2, "#1b1f1b");
  R(c, x + (d > 0 ? 3 : -1), y - 11, 2, 2, "#1b1f1b");
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
  c.font = "600 10px system-ui, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "alphabetic";
  const largura = c.measureText(p.nome).width + 10;
  A(c, 0.75, () => R(c, x - largura / 2, y + 16, largura, 13, "#0b0e22"));
  c.fillStyle = "#eef0ff";
  c.fillText(p.nome, x, y + 26);
  if (p.trabalhando && !andando) {
    R(c, x - 13, y - 29, 26, 5, "rgba(0,0,0,.65)");
    R(c, x - 12, y - 28, 24 * m.progresso, 3, cor);
  }
  if (selecionado || falaAgora) {
    const t = p.tarefa.length > 34 ? `${p.tarefa.slice(0, 33)}…` : p.tarefa;
    c.font = "500 10px system-ui, sans-serif";
    const bw = c.measureText(t).width + 16;
    R(c, x - bw / 2, y - 54, bw, 19, "#eef0ff");
    R(c, x - 3, y - 36, 6, 4, "#eef0ff");
    c.fillStyle = "#0b0e22";
    c.fillText(t, x, y - 41);
  }
  c.textAlign = "left";
}

function placa(c: C, s: Setor, direita: boolean) {
  c.font = "600 11px system-ui, sans-serif";
  const t = s.nome.toUpperCase();
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
  opcoes: { selecionado?: string; vista?: Vista; avisos?: Partial<Record<SetorId, string>> } = {},
) {
  const k = opcoes.vista?.k ?? 1;
  c.setTransform(dpr * k, 0, 0, dpr * k, opcoes.vista ? -opcoes.vista.x * dpr * k : 0, opcoes.vista ? -opcoes.vista.y * dpr * k : 0);
  c.imageSmoothingEnabled = false;
  terreno(c, tm);
  for (const s of SETORES) {
    A(c, 0.4, () => R(c, s.x + 6, s.y + 8, s.w, s.h, "#000"));
    piso(c, s);
    paredes(c, s);
    if (s.id === "marketing") decorMarketing(c, s, tm);
    else if (s.id === "comercial") decorAtendimento(c, s, tm);
    else if (s.id === "ops") decorOperacoes(c, s, tm);
    else if (s.id === "dados") decorDesempenho(c, s, tm);
    else decorFinanceiro(c, s, tm);
  }
  for (const p of personagens) mesa(c, p, tm);
  // Quem fala agora: um balão de cada vez, em rodízio, para não virar parede de texto.
  const vez = Math.floor(tm / 2200) % Math.max(1, personagens.length);
  const ordem = personagens.slice().sort((a, b) => (movimentos[a.id]?.y ?? 0) - (movimentos[b.id]?.y ?? 0));
  for (const p of ordem) {
    const m = movimentos[p.id];
    if (m) personagem(c, p, m, opcoes.selecionado === p.id, tm, personagens.indexOf(p) === vez);
  }
  for (const s of SETORES) {
    placa(c, s, s.id === "financeiro" || s.id === "ops");
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
  m.progresso = trabalhando ? (m.progresso + dt / 6) % 1 : 0;
}
