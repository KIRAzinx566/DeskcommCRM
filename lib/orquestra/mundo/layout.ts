// Mesmo arquivo no FBhub (src/lib/mundo/) e no DeskcommCRM (lib/orquestra/mundo/) — só os imports mudam.
// O LAYOUT do escritório — o que o cliente pode mudar "do seu jeitinho":
// onde ficam os móveis e as mesas, o nome e o piso de cada sala, e o visual de
// cada agente. Quem edita é o hub (aba Escritório); ao salvar, ele grava na
// tabela client_office_layouts do hub E em organizations.settings.escritorio do
// CRM (edge function crm-office-layout), e o Mundo do CRM desenha o mesmo.
//
// O que NÃO é editável: as paredes, portas e o corredor (o caminho dos agentes
// depende deles — ver rotina.ts) e a decoração presa na parede (janelas,
// quadros, telas).
//
// Puro e sem React. `normalizarLayout` aceita qualquer JSON que vier do banco e
// devolve um layout válido — um campo estranho é descartado, nunca quebra a tela.
import type { SetorId } from './personagens';

export type TipoDeItem =
  | 'cafeteira'
  | 'bebedouro'
  | 'pingpong'
  | 'sofa'
  | 'puff'
  | 'planta'
  | 'estante'
  | 'tapete'
  | 'fliperama'
  | 'geladeira'
  | 'mesinha';

export interface ItemDoEscritorio {
  id: string;
  tipo: TipoDeItem;
  /** Canto superior esquerdo, nas coordenadas do mapa (960×620). */
  x: number;
  y: number;
}

export type Acessorio = 'headset' | 'oculos' | 'viseira' | 'gravata' | 'coroa' | null;

export type Genero = 'homem' | 'mulher';

export interface VisualDoAgente {
  /** Muda o desenho (cabelo comprido e boca para mulher); sem escolha, o visual padrão. */
  genero?: Genero;
  cabelo?: string;
  pele?: string;
  camisa?: string;
  acessorio?: Acessorio;
}

export interface LayoutDoEscritorio {
  versao: 1;
  salas: Partial<Record<SetorId, { nome?: string; piso?: string }>>;
  itens: ItemDoEscritorio[];
  /** Posição da mesa de cada agente (pelo id do agente no CRM). Sem entrada = a mesa padrão. */
  mesas: Record<string, [number, number]>;
  visual: Record<string, VisualDoAgente>;
}

/**
 * Tamanho de cada móvel (para arrastar, clicar e não sair da sala) e o nome que
 * a tela mostra. `parede`: pode encostar na parede (a parte de cima sobe nela);
 * os outros ficam inteiros no chão.
 */
export const CATALOGO: Record<TipoDeItem, { nome: string; w: number; h: number; parede?: boolean }> = {
  cafeteira: { nome: 'Cafeteira', w: 110, h: 32, parede: true },
  bebedouro: { nome: 'Bebedouro', w: 16, h: 48, parede: true },
  pingpong: { nome: 'Mesa de ping-pong', w: 80, h: 44 },
  sofa: { nome: 'Sofá', w: 116, h: 28 },
  puff: { nome: 'Puff', w: 18, h: 14 },
  planta: { nome: 'Planta', w: 14, h: 27 },
  estante: { nome: 'Estante', w: 20, h: 66, parede: true },
  tapete: { nome: 'Tapete', w: 110, h: 52 },
  fliperama: { nome: 'Fliperama', w: 22, h: 36, parede: true },
  geladeira: { nome: 'Geladeira', w: 22, h: 42, parede: true },
  mesinha: { nome: 'Mesa de centro', w: 34, h: 18 },
};

/** Quanto um móvel de parede pode subir na parede. */
const ALCANCE_DA_PAREDE = 24;

export const TIPOS = Object.keys(CATALOGO) as TipoDeItem[];

export const ACESSORIOS: Array<{ valor: Acessorio; nome: string }> = [
  { valor: 'headset', nome: 'Headset' },
  { valor: 'oculos', nome: 'Óculos' },
  { valor: 'viseira', nome: 'Viseira' },
  { valor: 'gravata', nome: 'Gravata' },
  { valor: 'coroa', nome: 'Coroa' },
  { valor: null, nome: 'Nenhum' },
];

/** O chão de cada sala (abaixo da parede) — onde um móvel ou mesa pode ficar. */
export const PISOS: Record<SetorId, { x: number; y: number; w: number; h: number }> = {
  copa: { x: 44, y: 94, w: 392, h: 172 },
  comercial: { x: 524, y: 94, w: 392, h: 172 },
  ops: { x: 374, y: 330, w: 212, h: 62 },
  dados: { x: 44, y: 484, w: 392, h: 102 },
  financeiro: { x: 524, y: 484, w: 392, h: 102 },
};

export const LAYOUT_PADRAO: LayoutDoEscritorio = {
  versao: 1,
  salas: {},
  itens: [
    { id: 'cafeteira-1', tipo: 'cafeteira', x: 70, y: 82 },
    { id: 'bebedouro-1', tipo: 'bebedouro', x: 206, y: 76 },
    { id: 'pingpong-1', tipo: 'pingpong', x: 298, y: 136 },
    { id: 'tapete-1', tipo: 'tapete', x: 80, y: 196 },
    { id: 'sofa-1', tipo: 'sofa', x: 74, y: 204 },
    { id: 'puff-1', tipo: 'puff', x: 220, y: 214 },
    { id: 'puff-2', tipo: 'puff', x: 250, y: 222 },
    { id: 'estante-1', tipo: 'estante', x: 416, y: 106 },
    { id: 'planta-1', tipo: 'planta', x: 403, y: 228 },
    { id: 'planta-2', tipo: 'planta', x: 51, y: 140 },
  ],
  mesas: {},
  visual: {},
};

const HEX = /^#[0-9a-f]{6}$/i;
const cor = (v: unknown) => (typeof v === 'string' && HEX.test(v) ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
const SETORES_IDS: SetorId[] = ['copa', 'comercial', 'ops', 'dados', 'financeiro'];

/**
 * Prende um retângulo dentro do chão da sala em que o centro dele cai; fora de
 * toda sala, null (o arraste não sai dali). Móvel de parede pode subir nela.
 */
export function dentroDeUmaSala(x: number, y: number, w: number, h: number, parede = false): [number, number] | null {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const subida = parede ? ALCANCE_DA_PAREDE : 0;
  for (const id of SETORES_IDS) {
    const p = PISOS[id];
    if (cx >= p.x && cx <= p.x + p.w && cy >= p.y - 40 && cy <= p.y + p.h + 10) {
      return [
        Math.round(Math.min(Math.max(x, p.x), p.x + p.w - w)),
        Math.round(Math.min(Math.max(y, p.y - subida), p.y + p.h - h)),
      ];
    }
  }
  return null;
}

/** Qualquer JSON → layout válido. Sem nada salvo, o padrão. */
export function normalizarLayout(bruto: unknown): LayoutDoEscritorio {
  if (!bruto || typeof bruto !== 'object') return LAYOUT_PADRAO;
  const b = bruto as Record<string, unknown>;

  const salas: LayoutDoEscritorio['salas'] = {};
  if (b.salas && typeof b.salas === 'object') {
    for (const id of SETORES_IDS) {
      const s = (b.salas as Record<string, unknown>)[id] as Record<string, unknown> | undefined;
      if (!s) continue;
      const nome = typeof s.nome === 'string' ? s.nome.trim().slice(0, 24) : undefined;
      salas[id] = { nome: nome || undefined, piso: cor(s.piso) };
    }
  }

  const itens: ItemDoEscritorio[] = [];
  if (Array.isArray(b.itens)) {
    for (const i of b.itens.slice(0, 80) as Array<Record<string, unknown>>) {
      const tipo = i?.tipo as TipoDeItem;
      const x = num(i?.x);
      const y = num(i?.y);
      if (!CATALOGO[tipo] || x === undefined || y === undefined) continue;
      itens.push({ id: typeof i.id === 'string' ? i.id.slice(0, 40) : `${tipo}-${itens.length}`, tipo, x, y });
    }
  }

  const mesas: LayoutDoEscritorio['mesas'] = {};
  if (b.mesas && typeof b.mesas === 'object') {
    for (const [id, pos] of Object.entries(b.mesas as Record<string, unknown>)) {
      if (Array.isArray(pos) && num(pos[0]) !== undefined && num(pos[1]) !== undefined) {
        mesas[id] = [num(pos[0])!, num(pos[1])!];
      }
    }
  }

  const visual: LayoutDoEscritorio['visual'] = {};
  if (b.visual && typeof b.visual === 'object') {
    for (const [id, v] of Object.entries(b.visual as Record<string, Record<string, unknown>>)) {
      if (!v || typeof v !== 'object') continue;
      const acessorio = ACESSORIOS.some((a) => a.valor === v.acessorio) ? (v.acessorio as Acessorio) : undefined;
      const genero = v.genero === 'homem' || v.genero === 'mulher' ? v.genero : undefined;
      visual[id] = { genero, cabelo: cor(v.cabelo), pele: cor(v.pele), camisa: cor(v.camisa), acessorio };
    }
  }

  return { versao: 1, salas, itens: Array.isArray(b.itens) ? itens : LAYOUT_PADRAO.itens, mesas, visual };
}
