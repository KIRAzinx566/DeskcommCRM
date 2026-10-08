"use client";

/**
 * A Visão geral, com a disposição do painel do Orquestra: o caixa no topo, os
 * quatro números que o dono olha primeiro, e embaixo os agentes, o funil, o que
 * está ligado e a miniatura do Mundo. As cores são as do produto (tokens), não
 * as do Orquestra — o tema continua sendo o que a organização escolheu.
 *
 * Seção que o papel não alcança (ou que falhou) não aparece com zero: aparece
 * com o aviso de que não há o dado. Zero é um número; "sem dado" é outra coisa.
 */
import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MundoDosAgentes } from "@/components/orquestra/MundoDosAgentes";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { usePainelDoOrquestra } from "@/hooks/orquestra/usePainelDoOrquestra";
import { formatCents } from "@/lib/money";
import { montarCena } from "@/lib/orquestra/mundo/personagens";
import type { DiaDoCaixa, PeriodoDoPainel } from "@/lib/orquestra/painel";

const PERIODOS: PeriodoDoPainel[] = ["hoje", "7d", "mes"];

function quando(iso: string, fuso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A curva das entradas acumuladas no período — SVG puro, na cor de destaque da marca. */
function CurvaDoCaixa({ dias, moeda }: { dias: DiaDoCaixa[]; moeda: string }) {
  const pontos = dias.map((d, i) => ({
    dia: d.dia,
    valor: dias.slice(0, i + 1).reduce((soma, x) => soma + x.entradasCents, 0),
  }));
  if (pontos.length === 1) pontos.unshift({ dia: "", valor: 0 });
  const maior = Math.max(1, ...pontos.map((p) => p.valor));
  const W = 600;
  const H = 160;
  const xy = pontos.map((p, i) => [(i / Math.max(1, pontos.length - 1)) * W, H - (p.valor / maior) * (H - 16) - 8] as const);
  const linha = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full text-accent" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${linha} L${W},${H} L0,${H} Z`} fill="currentColor" opacity={0.12} />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      <title>{formatCents(pontos.at(-1)?.valor ?? 0, moeda)}</title>
    </svg>
  );
}

function Numero({
  titulo,
  valor,
  detalhe,
  tom,
  testid,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  tom?: "bom" | "atencao";
  testid: string;
}) {
  return (
    <Card className="p-4" data-testid={testid}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${tom === "bom" ? "text-success-fg" : tom === "atencao" ? "text-warning-fg" : ""}`}
      >
        {valor}
      </p>
      {detalhe ? <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p> : null}
    </Card>
  );
}

export function VisaoGeral() {
  const t = useT();
  const { activeOrg } = useAuth();
  const [periodo, setPeriodo] = React.useState<PeriodoDoPainel>("mes");
  const painel = usePainelDoOrquestra(periodo);
  const contagens = useConversationCounts(activeOrg?.orgId ?? null);
  const p = painel.data;
  const fila = contagens.data?.fila ?? contagens.data?.unassigned ?? null;
  const semDado = t("Sem dado para mostrar");

  const cena = React.useMemo(
    () => (p ? montarCena(p, fila, new Date(p.geradoEm)) : { personagens: [], agentesAlemDasMesas: 0 }),
    [p, fila],
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6" data-testid="visao-geral">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Visão geral")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("O caixa, a fila, o funil e o que cada agente de IA está fazendo agora.")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/app/inbox">{t("Conversas")}</Link>
          </Button>
          <Button asChild>
            <Link href="/app/orquestra/mundo">{t("Mundo dos agentes")}</Link>
          </Button>
        </div>
      </header>

      {painel.isError ? (
        <Card className="p-4 text-sm" role="alert">
          {t("Não consegui carregar a visão geral. Tente de novo em instantes.")}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t("Entradas no caixa")}</h2>
          <div className="flex gap-1" role="tablist" aria-label={t("Período")}>
            {PERIODOS.map((id) => (
              <Button
                key={id}
                size="sm"
                variant={periodo === id ? "default" : "outline"}
                role="tab"
                aria-selected={periodo === id}
                onClick={() => setPeriodo(id)}
                data-testid={`periodo-${id}`}
              >
                {id === "hoje" ? t("Hoje") : id === "7d" ? t("7 dias") : t("Mês")}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-3" data-testid="curva-do-caixa">
          {!p ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t("Carregando…")}</p>
          ) : !p.caixa ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{semDado}</p>
          ) : p.caixa.porDia.some((d) => d.entradasCents > 0) ? (
            <CurvaDoCaixa dias={p.caixa.porDia} moeda={p.moeda} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("Nenhuma entrada paga neste período. As vendas finalizadas e os lançamentos pagos aparecem aqui.")}
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          testid="numero-entrou"
          titulo={t("Entrou no período")}
          valor={p?.caixa ? formatCents(p.caixa.entradasCents, p.moeda) : "—"}
          detalhe={p?.caixa ? `${t("Saiu")} ${formatCents(p.caixa.saidasCents, p.moeda)}` : undefined}
        />
        <Numero
          testid="numero-resultado"
          titulo={t("Resultado (entradas − saídas)")}
          valor={p?.caixa ? formatCents(p.caixa.entradasCents - p.caixa.saidasCents, p.moeda) : "—"}
          tom={p?.caixa ? (p.caixa.entradasCents >= p.caixa.saidasCents ? "bom" : "atencao") : undefined}
        />
        <Numero
          testid="numero-fila"
          titulo={t("Esperando a equipe")}
          valor={fila === null ? "—" : String(fila)}
          tom={fila ? "atencao" : fila === 0 ? "bom" : undefined}
          detalhe={fila ? t("conversas para alguém responder") : fila === 0 ? t("ninguém esperando") : undefined}
        />
        <Numero
          testid="numero-passagens"
          titulo={t("Passaram para a equipe hoje")}
          valor={p?.passagensHoje == null ? "—" : String(p.passagensHoje)}
          detalhe={t("quando a IA chamou uma pessoa")}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2" data-testid="seus-agentes">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{t("Seus agentes de IA")}</h2>
            <Link href="/app/ai/agents" className="text-xs underline">
              {t("Configurar")}
            </Link>
          </div>
          {!p ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("Carregando…")}</p>
          ) : !p.agentes ? (
            <p className="mt-3 text-sm text-muted-foreground">{semDado}</p>
          ) : p.agentes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("Nenhum agente de IA criado ainda.")}{" "}
              <Link href="/app/ai/agents" className="underline">
                {t("Criar o primeiro")}
              </Link>
            </p>
          ) : (
            <ul className="mt-3 divide-y">
              {p.agentes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="agente-na-visao-geral">
                  <div>
                    <p className="font-medium">{a.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.ultimaAcao
                        ? `${a.ultimaAcao.rotulo} · ${quando(a.ultimaAcao.em, p.fuso)}`
                        : a.ultimoTurnoEm
                          ? `${t("Último atendimento")} ${quando(a.ultimoTurnoEm, p.fuso)}`
                          : t("Nenhum atendimento hoje")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="tabular-nums">
                      {a.turnosHoje} {t("hoje")}
                    </span>
                    {a.falhasHoje > 0 ? (
                      <span className="rounded-full bg-warning-bg px-2 py-0.5 text-warning-fg">
                        {a.falhasHoje} {t("com erro")}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 ${a.ativo ? "bg-success-bg text-success-fg" : "bg-muted text-muted-foreground"}`}
                    >
                      {t(a.ativo ? "Ativo" : "Pausado")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-4" data-testid="funil">
            <h2 className="text-sm font-medium">{t("Funil")}</h2>
            {!p ? null : !p.funil ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("Nenhum funil criado ainda.")}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.funil.nome} · {p.funil.etapas.reduce((s, e) => s + e.quantidade, 0)} {t("em aberto")} ·{" "}
                  {formatCents(p.funil.etapas.reduce((s, e) => s + e.valorCents, 0), p.moeda)}
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {p.funil.etapas.map((e) => (
                    <li key={e.nome} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <i
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full bg-accent"
                          style={e.cor ? { background: e.cor } : undefined}
                        />
                        {e.nome}
                      </span>
                      <b className="tabular-nums">{e.quantidade}</b>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card className="p-4" data-testid="operacao-agora">
            <h2 className="text-sm font-medium">{t("Operação agora")}</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {p?.canais === null ? (
                <li className="text-muted-foreground">{semDado}</li>
              ) : p?.canais?.length === 0 ? (
                <li className="flex justify-between gap-2">
                  <span>WhatsApp</span>
                  <Link href="/app/connections" className="text-warning-fg underline">
                    {t("nenhum número conectado")}
                  </Link>
                </li>
              ) : (
                p?.canais?.map((c) => (
                  <li key={c.nome} className="flex justify-between gap-2">
                    <span>{c.nome}</span>
                    {c.conectado ? (
                      <span className="text-success-fg">{c.telefone ? `+${c.telefone}` : t("conectado")}</span>
                    ) : (
                      <Link href="/app/connections" className="text-warning-fg underline">
                        {t("desconectado")}
                      </Link>
                    )}
                  </li>
                ))
              )}
              <li className="flex justify-between gap-2">
                <span>{t("Produtos no catálogo")}</span>
                <Link href="/app/products" className="tabular-nums underline">
                  {p?.produtosAtivos ?? "—"}
                </Link>
              </li>
              <li className="flex justify-between gap-2">
                <span>{t("Conversas com a IA agora")}</span>
                <Link href="/app/inbox" className="tabular-nums underline">
                  {contagens.data?.automatico ?? "—"}
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-medium">{t("Seu time de agentes trabalhando")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("Cada personagem é um dado de verdade: um agente de IA, a fila da equipe, o caixa do dia.")}
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/app/orquestra/mundo">{t("Abrir o mundo")}</Link>
          </Button>
        </div>
        <Link href="/app/orquestra/mundo" className="mt-3 block" aria-label={t("Abrir o mundo dos agentes")}>
          <MundoDosAgentes cena={cena} compacto rotulo={t("Miniatura do mundo dos agentes")} />
        </Link>
      </Card>
    </div>
  );
}
