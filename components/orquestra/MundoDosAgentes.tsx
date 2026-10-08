"use client";

/**
 * O Mundo dos agentes — o canvas animado. A cena (quem aparece e o que está
 * fazendo) vem de `lib/orquestra/mundo/personagens.ts`; aqui só se anima e se
 * desenha (`lib/orquestra/mundo/desenho.ts`).
 *
 * A animação é cosmética — andar até a mesa, a barrinha de quem trabalha. O que
 * o personagem FAZ nunca é animação: é a frase da cena, que só muda quando o
 * painel é relido (a cada 20s).
 *
 * `compacto`: a miniatura da Visão geral — o mapa inteiro, sem clique.
 * Com `prefers-reduced-motion`, desenha um quadro parado.
 */
import * as React from "react";

import { avancar, ALTURA, desenharMundo, LARGURA, type Movimento } from "@/lib/orquestra/mundo/desenho";
import type { Cena, Personagem, SetorId } from "@/lib/orquestra/mundo/personagens";

const frente = (p: Personagem): [number, number] => [p.mesa[0], p.mesa[1] + 26];

export function MundoDosAgentes({
  cena,
  avisos,
  compacto = false,
  selecionado,
  aoSelecionar,
  rotulo,
}: {
  cena: Cena;
  avisos?: Partial<Record<SetorId, string>>;
  compacto?: boolean;
  selecionado?: string | null;
  aoSelecionar?: (id: string | null) => void;
  rotulo: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const movimentos = React.useRef<Record<string, Movimento>>({});
  // O laço de animação lê a cena mais nova por aqui, sem reiniciar a cada
  // releitura do painel. Atualizado depois do render, nunca durante.
  const estado = React.useRef({ cena, avisos, selecionado });
  React.useEffect(() => {
    estado.current = { cena, avisos, selecionado };
  }, [cena, avisos, selecionado]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = LARGURA * dpr;
    canvas.height = ALTURA * dpr;
    const parado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      const { cena: atual, avisos: avisosAtuais, selecionado: sel } = estado.current;
      for (const p of atual.personagens) {
        const m = (movimentos.current[p.id] ??= {
          x: frente(p)[0] + (parado ? 0 : 40),
          y: frente(p)[1] + (parado ? 0 : 30),
          dir: 1,
          passo: 0,
          progresso: 0,
          alvo: frente(p),
        });
        // Quem não trabalha passeia perto da mesa de vez em quando — sem tarefa
        // inventada: o balão continua dizendo o fato da cena.
        if (!p.trabalhando && !p.pausado && !parado && Math.random() < dt * 0.15) {
          m.alvo = [p.mesa[0] + (Math.random() * 60 - 30), p.mesa[1] + 26 + (Math.random() * 14 - 4)];
        } else if (p.trabalhando) {
          m.alvo = frente(p);
        }
        if (parado) {
          m.x = m.alvo[0];
          m.y = m.alvo[1];
        } else {
          avancar(m, p.trabalhando, dt);
        }
      }
      desenharMundo(ctx, dpr, parado ? 0 : tm, atual.personagens, movimentos.current, {
        selecionado: sel ?? undefined,
        avisos: avisosAtuais,
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
    if (parado) quadro(performance.now());
    else raf = requestAnimationFrame(laco);
    return () => {
      cancelAnimationFrame(raf);
      observador.disconnect();
    };
  }, []);

  // Quadro parado: redesenha quando a cena muda (o laço não está rodando).
  React.useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = canvas.width / LARGURA;
    for (const p of cena.personagens) {
      movimentos.current[p.id] ??= { x: frente(p)[0], y: frente(p)[1], dir: 1, passo: 0, progresso: 0, alvo: frente(p) };
    }
    desenharMundo(ctx, dpr, 0, cena.personagens, movimentos.current, { selecionado: selecionado ?? undefined, avisos });
  }, [cena, avisos, selecionado]);

  function clicar(e: React.MouseEvent<HTMLCanvasElement>) {
    if (compacto || !aoSelecionar) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) * LARGURA) / r.width;
    const y = ((e.clientY - r.top) * ALTURA) / r.height;
    let melhor: string | null = null;
    let distancia = 26;
    for (const p of cena.personagens) {
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

  return (
    <canvas
      ref={canvasRef}
      onClick={clicar}
      role="img"
      aria-label={rotulo}
      className={`block h-auto w-full rounded-lg ${compacto ? "" : "cursor-pointer"}`}
      style={{ aspectRatio: `${LARGURA} / ${ALTURA}`, imageRendering: "pixelated" }}
      data-testid={compacto ? "mini-mundo" : "mundo-dos-agentes"}
    />
  );
}
