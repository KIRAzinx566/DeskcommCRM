// Mesmo arquivo no FBhub (src/lib/mundo/) e no DeskcommCRM (lib/orquestra/mundo/) — só os imports mudam.
/**
 * A ROTINA dos agentes no Mundo — onde cada um está e o que está fazendo com o
 * corpo. A cena (`./personagens.ts`) diz o FATO; a rotina só decide a pose.
 *
 *   - trabalhando     → na mesa, digitando (o turno é real)
 *   - pediu ajuda     → na mesa, mão levantada (há caso esperando gente)
 *   - pausado         → cochilando num assento da copa
 *   - fora do ar      → descansando num assento, lendo (não atende ninguém)
 *   - fora do horário → foi para casa: sai pela porta e some (volta no horário)
 *   - livre           → vive: café, água, sofá, alongar, regar planta, ping-pong
 *                       com outro livre, ou arrumando a própria mesa
 *
 * Os lugares saem dos MÓVEIS do layout (`./layout.ts`): mudou a cafeteira de
 * lugar, o café é lá; tirou a mesa de ping-pong, ninguém joga. Atividade sem o
 * móvel dela não é sorteada.
 *
 * O que um agente LIVRE faz é cosmético, e a tela diz isso. O que nunca
 * acontece é o contrário — trabalho e pedido de ajuda sempre puxam para a mesa.
 *
 * Determinística: a atividade sai do id do agente e da janela de tempo, então o
 * canvas e o painel ao lado concordam sem trocar estado.
 */
import { CATALOGO, PISOS, type ItemDoEscritorio, type LayoutDoEscritorio } from './layout';
import type { Personagem, SetorId } from './personagens';

export type Atividade =
  | 'casa'
  | 'mesa'
  | 'digitando'
  | 'ajuda'
  | 'descansando'
  | 'dormindo'
  | 'cafe'
  | 'agua'
  | 'sofa'
  | 'alongar'
  | 'planta'
  | 'pingpong';

/** Atividades que disputam os mesmos lugares (sofá e puffs). */
type Grupo = 'assento' | 'cafe' | 'agua' | 'alongar' | 'planta' | 'pingpong';

export const grupoDe = (a: Atividade): Grupo | null =>
  a === 'sofa' || a === 'dormindo' || a === 'descansando'
    ? 'assento'
    : a === 'cafe' || a === 'agua' || a === 'alongar' || a === 'planta' || a === 'pingpong'
      ? a
      : null;

export type Lugares = Record<Grupo, Array<[number, number]>>;

/** Quanto dura cada pausa de quem está livre. */
export const JANELA_MS = 40_000;

const ATIVIDADES_DO_LIVRE: Atividade[] = ['cafe', 'mesa', 'agua', 'sofa', 'alongar', 'planta', 'cafe', 'mesa'];

const de = (itens: readonly ItemDoEscritorio[], tipo: ItemDoEscritorio['tipo']) => itens.filter((i) => i.tipo === tipo);

/** Os lugares de cada atividade, a partir dos móveis. */
export function lugaresDoLayout(layout: Pick<LayoutDoEscritorio, 'itens'>): Lugares {
  const { itens } = layout;
  // Ordem de ocupação: as pontas dos sofás, depois os puffs, e o meio do sofá por
  // último — sentados lado a lado, os nomes de quem está junto se atropelam.
  const sofas = de(itens, 'sofa');
  const assentos: Array<[number, number]> = [
    ...sofas.flatMap((s) => [[s.x + 20, s.y + 14], [s.x + 84, s.y + 14]] as Array<[number, number]>),
    ...de(itens, 'puff').map((p) => [p.x + 9, p.y + 2] as [number, number]),
    ...sofas.map((s) => [s.x + 52, s.y + 14] as [number, number]),
  ];
  const tapete = de(itens, 'tapete')[0];
  return {
    assento: assentos,
    cafe: de(itens, 'cafeteira').flatMap((c) => [
      [c.x + 22, c.y + 50],
      [c.x + 54, c.y + 52],
      [c.x + 86, c.y + 50],
    ] as Array<[number, number]>),
    agua: de(itens, 'bebedouro').flatMap((b) => [
      [b.x + 6, b.y + 56],
      [b.x + 30, b.y + 60],
    ] as Array<[number, number]>),
    pingpong: de(itens, 'pingpong')
      .slice(0, 1)
      .flatMap((t) => [
        [t.x - 16, t.y + 32],
        [t.x + CATALOGO.pingpong.w + 16, t.y + 32],
      ] as Array<[number, number]>),
    planta: de(itens, 'planta').map((p) => [p.x - 8, p.y + 26] as [number, number]),
    alongar: tapete
      ? [
          [tapete.x + 40, tapete.y + 30],
          [tapete.x + 70, tapete.y + 36],
        ]
      : [
          [250, 240],
          [282, 246],
        ],
  };
}

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A atividade de cada agente agora. Livres numa janela par, se forem dois ou
 * mais e houver mesa de ping-pong, os dois primeiros (pela ordem sorteada da
 * janela) jogam.
 */
export function atividades(
  personagens: readonly Personagem[],
  agoraMs: number,
  lugares?: Lugares,
): Record<string, Atividade> {
  const tem = (g: Grupo) => !lugares || lugares[g].length > 0;
  const opcoes = ATIVIDADES_DO_LIVRE.filter((a) => {
    const g = grupoDe(a);
    return !g || tem(g);
  });
  const janela = Math.floor(agoraMs / JANELA_MS);
  const saida: Record<string, Atividade> = {};
  const livres: Personagem[] = [];
  for (const p of personagens) {
    if (!p.rotina) continue;
    if (p.foraDoAr) saida[p.id] = 'descansando';
    else if (p.pausado) saida[p.id] = 'dormindo';
    else if (p.ajuda) saida[p.id] = 'ajuda';
    else if (p.trabalhando) saida[p.id] = 'digitando';
    else if (p.emCasa) saida[p.id] = 'casa';
    else livres.push(p);
  }
  const sorteados = livres.slice().sort((a, b) => hash(`${a.id}:${janela}`) - hash(`${b.id}:${janela}`));
  const jogam = tem('pingpong') && sorteados.length >= 2 && janela % 2 === 0 ? sorteados.slice(0, 2) : [];
  for (const p of sorteados) {
    saida[p.id] = jogam.includes(p) ? 'pingpong' : opcoes[hash(`${p.id}#${janela}`) % opcoes.length]!;
  }
  return saida;
}

/**
 * Onde o personagem fica para a atividade (o `vaga`-ésimo do grupo). Sem lugar
 * sobrando (mais gente que assento), fica de pé perto do último.
 */
/** Por onde quem vai para casa sai: o corredor na porta do Atendimento. */
export const SAIDA: [number, number] = [720, 300];

export function destino(p: Personagem, atividade: Atividade, vaga: number, lugares: Lugares): [number, number] {
  if (atividade === 'casa') return SAIDA;
  const g = grupoDe(atividade);
  const lista = g ? lugares[g] : [];
  if (lista.length === 0) return [p.mesa[0], p.mesa[1] + 26];
  if (vaga < lista.length) return lista[vaga]!;
  const [x, y] = lista[lista.length - 1]!;
  return [x + 14 * (vaga - lista.length + 1), y + 18];
}

// ─── caminho: portas e corredores ────────────────────────────────────────────
// Salas de cima (Copa, Atendimento) dão no corredor de cima (y≈283); as de
// baixo (Desempenho, Financeiro), no de baixo (y≈415). Operações tem porta para
// os dois, e é por ela (x=480) que se passa de um corredor para o outro.

const CORREDOR = { cima: 283, baixo: 415 } as const;
type Nivel = keyof typeof CORREDOR;

const PORTAS: Record<Exclude<SetorId, 'ops'>, { x: number; dentro: number; nivel: Nivel }> = {
  copa: { x: 240, dentro: 258, nivel: 'cima' },
  comercial: { x: 720, dentro: 258, nivel: 'cima' },
  dados: { x: 240, dentro: 446, nivel: 'baixo' },
  financeiro: { x: 720, dentro: 446, nivel: 'baixo' },
};

function salaDe([x, y]: readonly [number, number]): SetorId | null {
  for (const [id, p] of Object.entries(PISOS) as Array<[SetorId, (typeof PISOS)[SetorId]]>) {
    if (x >= p.x - 6 && x <= p.x + p.w + 6 && y >= p.y - 40 && y <= p.y + p.h + 8) return id;
  }
  return null;
}

/** Os pontos para sair da sala até o corredor do nível pedido (de dentro para fora). */
function saida(sala: SetorId | null, ponto: readonly [number, number], nivel: Nivel): Array<[number, number]> {
  if (sala === null) return [[ponto[0], CORREDOR[ponto[1] < 350 ? 'cima' : 'baixo']]];
  if (sala === 'ops') return nivel === 'cima' ? [[480, 308], [480, CORREDOR.cima]] : [[480, 384], [480, CORREDOR.baixo]];
  const porta = PORTAS[sala];
  return [
    [porta.x, porta.dentro],
    [porta.x, CORREDOR[porta.nivel]],
  ];
}

const nivelDe = (sala: SetorId | null, ponto: readonly [number, number], outro: Nivel): Nivel =>
  sala === null ? (ponto[1] < 350 ? 'cima' : 'baixo') : sala === 'ops' ? outro : PORTAS[sala].nivel;

/**
 * O caminho até o destino, sem atravessar parede: sai pela porta, anda no
 * corredor (trocando de corredor por Operações, se precisar) e entra pela porta
 * da outra sala.
 */
export function caminho(origem: readonly [number, number], para: [number, number]): Array<[number, number]> {
  const salaA = salaDe(origem);
  const salaB = salaDe(para);
  if (salaA !== null && salaA === salaB) return [para];
  // o nível de cada ponta (Operações se adapta ao da outra ponta)
  const nivelB0 = salaB === null || salaB === 'ops' ? 'cima' : PORTAS[salaB].nivel;
  const nivelA = nivelDe(salaA, origem, nivelB0);
  const nivelB = nivelDe(salaB, para, nivelA);
  const pontos: Array<[number, number]> = [...saida(salaA, origem, nivelA)];
  if (nivelA !== nivelB) pontos.push([480, CORREDOR[nivelA]], [480, CORREDOR[nivelB]]);
  const entrada = saida(salaB, para, nivelB).reverse();
  pontos.push(...entrada, para);
  // tira pontos repetidos seguidos (ex.: sair de Operações pelo mesmo x=480)
  return pontos.filter((p, i) => i === 0 || p[0] !== pontos[i - 1]![0] || p[1] !== pontos[i - 1]![1]);
}
