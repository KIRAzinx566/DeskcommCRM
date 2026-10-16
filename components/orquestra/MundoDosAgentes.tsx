"use client";
// Mesmo arquivo no FBhub (src/components/workspace/) e no DeskcommCRM (components/orquestra/) — só os imports mudam.
/**
 * O escritório dos agentes — o canvas animado. A cena (quem aparece e o que
 * está fazendo) vem de `lib/mundo/personagens.ts`; os móveis, do layout
 * (`lib/mundo/layout.ts`); aqui só se anima, se desenha e se arrasta.
 *
 * A animação é cosmética — andar até a mesa, a barrinha de quem trabalha, o café
 * de quem está livre (`lib/mundo/rotina.ts`). O que o personagem FAZ nunca é
 * animação: é a frase da cena, que só muda quando os dados são relidos.
 *
 * `editando`: clicar e arrastar move móveis e mesas (quem decide o que muda é
 * o pai, por `aoMover`). Fora dele, clicar escolhe um agente.
 * `compacto`: a miniatura — o mapa inteiro, sem clique.
 * Com `prefers-reduced-motion`, desenha um quadro parado.
 */
import * as React from 'react';

import { avancar, ALTURA, desenharMundo, LARGURA, type Movimento, type Placar, type Vista } from '@/lib/orquestra/mundo/desenho';
import { CATALOGO, LAYOUT_PADRAO, type LayoutDoEscritorio } from '@/lib/orquestra/mundo/layout';
import { PORTA_DOS_VISITANTES, type Cena, type Personagem, type SetorId } from '@/lib/orquestra/mundo/personagens';
import { atividades, caminho, destino, grupoDe, lugaresDoLayout, type Lugares } from '@/lib/orquestra/mundo/rotina';

const frente = (p: Personagem): [number, number] => [p.mesa[0], p.mesa[1] + 26];

/** `item:<id>` ou `mesa:<id do personagem>`. */
export type AlvoDoEditor = string;

interface Props {
  cena: Cena;
  /** Sem layout salvo, o escritório padrão. */
  layout?: LayoutDoEscritorio;
  compacto?: boolean;
  avisos?: Partial<Record<SetorId, string>>;
  selecionado?: string | null;
  aoSelecionar?: (id: string | null) => void;
  editando?: boolean;
  escolhidoNoEditor?: AlvoDoEditor | null;
  aoEscolherNoEditor?: (alvo: AlvoDoEditor | null) => void;
  /** Arrastou: o canto superior esquerdo novo (item) ou o centro novo (mesa). */
  aoMover?: (alvo: AlvoDoEditor, x: number, y: number) => void;
  /** Leads sendo atendidos agora: entram pela porta e vão até o lugar deles. */
  visitantes?: ReadonlyArray<{ personagem: Personagem; lugar: [number, number] }>;
  /** O placar do dia na TV do Atendimento. */
  placar?: Placar;
  /** Nível do escritório no mês (0–3): enfeites desbloqueados pelo volume real. */
  nivel?: number;
  /** Zoom numa sala (celular): o pedaço do mapa que aparece. Sem vista, o mapa inteiro. */
  vista?: Vista | null;
  rotulo: string;
}

const SEM_VISITANTES: NonNullable<Props['visitantes']> = [];

/** A hora de agora (0–24) no relógio de quem olha — céu das janelas e luz da noite. */
const horaAgora = () => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

/** Atividade → lugar de cada personagem, dividindo os lugares de cada grupo. */
function posicoes(personagens: readonly Personagem[], agora: Record<string, string>, lugares: Lugares) {
  const vagas: Record<string, number> = {};
  const saida: Record<string, [number, number]> = {};
  for (const p of personagens) {
    const atividade = agora[p.id] as Parameters<typeof destino>[1] | undefined;
    if (!atividade) continue;
    const g = grupoDe(atividade) ?? atividade;
    const vaga = vagas[g] ?? 0;
    vagas[g] = vaga + 1;
    saida[p.id] = destino(p, atividade, vaga, lugares);
  }
  return saida;
}

export function MundoDosAgentes({
  cena,
  layout = LAYOUT_PADRAO,
  compacto = false,
  avisos,
  selecionado,
  aoSelecionar,
  editando = false,
  escolhidoNoEditor = null,
  aoEscolherNoEditor,
  aoMover,
  visitantes = SEM_VISITANTES,
  placar,
  nivel = 0,
  vista = null,
  rotulo,
}: Props) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const movimentos = React.useRef<Record<string, Movimento>>({});
  const lugares = React.useMemo(() => lugaresDoLayout(layout), [layout]);
  // O laço de animação lê o estado mais novo por aqui, sem reiniciar a cada
  // releitura. Atualizado depois do render, nunca durante.
  const estado = React.useRef({ cena, avisos, selecionado, layout, lugares, editando, escolhidoNoEditor, visitantes, placar, nivel, vista });
  React.useEffect(() => {
    estado.current = { cena, avisos, selecionado, layout, lugares, editando, escolhidoNoEditor, visitantes, placar, nivel, vista };
  }, [cena, avisos, selecionado, layout, lugares, editando, escolhidoNoEditor, visitantes, placar, nivel, vista]);
  // Quem está desenhado agora (agentes, equipe, visitantes) — para o clique achar qualquer um.
  const desenhados = React.useRef<Personagem[]>([]);
  // Visitante que saiu da lista ainda anda até a porta antes de sumir: guarda o desenho dele.
  const saindo = React.useRef<Map<string, Personagem>>(new Map());
  const visitantesVistos = React.useRef<Map<string, Personagem>>(new Map());

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = LARGURA * dpr;
    canvas.height = ALTURA * dpr;
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let ultimo = performance.now();
    let visivel = true;
    const observador = new IntersectionObserver((e) => {
      visivel = e[0]?.isIntersecting ?? true;
    });
    observador.observe(canvas);

    const quadro = (tm: number) => {
      const dt = Math.min(0.05, (tm - ultimo) / 1000);
      ultimo = tm;
      const atual = estado.current;
      const agora = atividades(atual.cena.personagens, Date.now(), atual.lugares);
      const alvos = posicoes(atual.cena.personagens, agora, atual.lugares);
      for (const p of atual.cena.personagens) {
        const m = (movimentos.current[p.id] ??= {
          x: frente(p)[0] + (parado ? 0 : 40),
          y: frente(p)[1] + (parado ? 0 : 30),
          dir: 1,
          passo: 0,
          progresso: 0,
          alvo: frente(p),
        });
        const atividade = agora[p.id];
        const para = alvos[p.id];
        if (atividade && para) {
          // agente de IA: segue a rotina; retraça só quando a atividade ou o lugar muda
          const chave = `${para[0]},${para[1]}`;
          if (m.atividade !== atividade || m.destino !== chave) {
            m.atividade = atividade;
            m.destino = chave;
            const [primeiro, ...resto] = caminho([m.x, m.y], para);
            m.alvo = primeiro!;
            m.rota = resto;
          }
        } else if (p.trabalhando) {
          m.alvo = frente(p);
        } else if (!p.pausado && !parado && Math.random() < dt * 0.15) {
          // os dados parados (Painel) só passeiam perto da mesa
          m.alvo = [p.mesa[0] + (Math.random() * 60 - 30), p.mesa[1] + 26 + (Math.random() * 14 - 4)];
        }
        if (parado) {
          const fim = m.rota?.length ? m.rota[m.rota.length - 1]! : m.alvo;
          m.x = fim[0];
          m.y = fim[1];
          m.alvo = fim;
          m.rota = [];
        } else {
          avancar(m, p.trabalhando || atividade === 'digitando', dt);
        }
      }
      // ── visitantes: entram pela porta, vão ao lugar; quem sumiu da lista volta e sai ──
      const presentes = new Set<string>();
      for (const { personagem: v, lugar } of atual.visitantes) {
        presentes.add(v.id);
        saindo.current.delete(v.id);
        const m = (movimentos.current[v.id] ??= {
          x: PORTA_DOS_VISITANTES[0],
          y: PORTA_DOS_VISITANTES[1],
          dir: 1,
          passo: 0,
          progresso: 0,
          alvo: PORTA_DOS_VISITANTES,
        });
        const chave = `${lugar[0]},${lugar[1]}`;
        if (m.destino !== chave) {
          m.destino = chave;
          const [primeiro, ...resto] = caminho([m.x, m.y], lugar);
          m.alvo = primeiro!;
          m.rota = resto;
        }
        if (parado) {
          m.x = lugar[0];
          m.y = lugar[1];
          m.alvo = lugar;
          m.rota = [];
        } else avancar(m, false, dt);
      }
      for (const [id, m] of Object.entries(movimentos.current)) {
        if (!id.startsWith('visita:') || presentes.has(id)) continue;
        if (!saindo.current.has(id)) {
          const ultimo = visitantesVistos.current.get(id);
          if (!ultimo || parado) {
            delete movimentos.current[id];
            continue;
          }
          saindo.current.set(id, { ...ultimo, tarefa: 'Atendimento encerrado, indo embora' });
          m.destino = 'saindo';
          const [primeiro, ...resto] = caminho([m.x, m.y], PORTA_DOS_VISITANTES);
          m.alvo = primeiro!;
          m.rota = resto;
        }
        avancar(m, false, dt);
        if (!m.rota?.length && Math.hypot(m.alvo[0] - m.x, m.alvo[1] - m.y) < 1) {
          delete movimentos.current[id];
          saindo.current.delete(id);
        }
      }
      for (const { personagem } of atual.visitantes) visitantesVistos.current.set(personagem.id, personagem);
      const todos = [...atual.cena.personagens, ...atual.visitantes.map((v) => v.personagem), ...saindo.current.values()];
      desenhados.current = todos;

      const jogadores = atual.cena.personagens.filter((p) => agora[p.id] === 'pingpong');
      const pingpong =
        jogadores.length === 2 &&
        jogadores.every((p) => {
          const m = movimentos.current[p.id]!;
          return !m.rota?.length && Math.hypot(m.alvo[0] - m.x, m.alvo[1] - m.y) < 1;
        });
      desenharMundo(ctx, dpr, parado ? 0 : tm, todos, movimentos.current, {
        selecionado: atual.selecionado ?? undefined,
        avisos: atual.avisos,
        atividades: agora,
        pingpong,
        layout: atual.layout,
        editando: atual.editando,
        escolhidoNoEditor: atual.escolhidoNoEditor,
        hora: horaAgora(),
        placar: atual.placar,
        nivel: atual.nivel,
        vista: atual.vista ?? undefined,
      });
    };

    const laco = (tm: number) => {
      raf = requestAnimationFrame(laco);
      if (!visivel || document.hidden) {
        ultimo = tm;
        return;
      }
      quadro(tm);
    };
    if (parado) {
      quadro(performance.now());
      // sem animação, redesenha de tempos em tempos para refletir edição e dados novos
      const id = window.setInterval(() => quadro(performance.now()), 500);
      return () => {
        clearInterval(id);
        observador.disconnect();
      };
    }
    raf = requestAnimationFrame(laco);
    return () => {
      cancelAnimationFrame(raf);
      observador.disconnect();
    };
  }, []);

  // ── clique e arraste ────────────────────────────────────────────────────────
  const arrasto = React.useRef<{ alvo: AlvoDoEditor; dx: number; dy: number } | null>(null);

  function pontoNoMapa(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - r.left) * LARGURA) / r.width;
    const sy = ((e.clientY - r.top) * ALTURA) / r.height;
    // com zoom numa sala, o ponto da tela volta para o mapa
    return vista ? [sx / vista.k + vista.x, sy / vista.k + vista.y] : [sx, sy];
  }

  /** O que está sob o ponteiro no editor: a mesa ou o móvel de cima. */
  function alvoNoEditor(x: number, y: number): { alvo: AlvoDoEditor; ox: number; oy: number } | null {
    for (const p of cena.personagens) {
      if (!p.rotina) continue;
      if (Math.abs(x - p.mesa[0]) <= 26 && y >= p.mesa[1] - 24 && y <= p.mesa[1] + 22) {
        return { alvo: `mesa:${p.id}`, ox: p.mesa[0], oy: p.mesa[1] };
      }
    }
    const itens = layout.itens.slice().sort((a, b) => b.y + CATALOGO[b.tipo].h - (a.y + CATALOGO[a.tipo].h));
    for (const i of itens) {
      const { w, h } = CATALOGO[i.tipo];
      if (x >= i.x && x <= i.x + w && y >= i.y && y <= i.y + h) return { alvo: `item:${i.id}`, ox: i.x, oy: i.y };
    }
    return null;
  }

  function aoApertar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (compacto) return;
    const [x, y] = pontoNoMapa(e);
    if (editando) {
      const achado = alvoNoEditor(x, y);
      aoEscolherNoEditor?.(achado?.alvo ?? null);
      if (achado) {
        arrasto.current = { alvo: achado.alvo, dx: x - achado.ox, dy: y - achado.oy };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (!aoSelecionar) return;
    let melhor: string | null = null;
    let distancia = 28 / (vista?.k ?? 1);
    for (const p of desenhados.current.length ? desenhados.current : cena.personagens) {
      const m = movimentos.current[p.id];
      if (!m) continue;
      const d = Math.hypot(m.x - x, m.y - 4 - y);
      if (d < distancia) {
        distancia = d;
        melhor = p.id;
      }
    }
    aoSelecionar(melhor);
  }

  function aoArrastar(e: React.PointerEvent<HTMLCanvasElement>) {
    const a = arrasto.current;
    if (!a || !editando) return;
    const [x, y] = pontoNoMapa(e);
    aoMover?.(a.alvo, Math.round(x - a.dx), Math.round(y - a.dy));
  }

  function aoSoltar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (arrasto.current) e.currentTarget.releasePointerCapture(e.pointerId);
    arrasto.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={aoApertar}
      onPointerMove={aoArrastar}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      role="img"
      aria-label={rotulo}
      className={`block h-auto w-full rounded-lg ${compacto ? '' : editando ? 'cursor-move touch-none' : 'cursor-pointer'}`}
      style={{ aspectRatio: `${LARGURA} / ${ALTURA}`, imageRendering: 'pixelated' }}
      data-testid={compacto ? 'mini-mundo' : 'mundo-dos-agentes'}
    />
  );
}
