"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MundoDosAgentes } from "@/components/orquestra/MundoDosAgentes";
import { ComandosDoAgente, PausarTodos } from "@/components/orquestra/ComandosDoAgente";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import { usePainelDoOrquestra } from "@/hooks/orquestra/usePainelDoOrquestra";
import { montarCena, type SetorId } from "@/lib/orquestra/mundo/personagens";
import { atividades, lugaresDoLayout, type Atividade } from "@/lib/orquestra/mundo/rotina";
import { LAYOUT_PADRAO } from "@/lib/orquestra/mundo/layout";

/** O nome do setor na língua da tela — literal por setor, para o dicionário enxergar cada chave. */
function useNomeDoSetor(): (s: SetorId) => string {
  const t = useT();
  return (s) =>
    s === "copa"
      ? t("Copa")
      : s === "comercial"
        ? t("Atendimento")
        : s === "ops"
          ? t("Operações")
          : s === "dados"
            ? t("Desempenho")
            : t("Financeiro");
}

/** O que o agente livre está fazendo — literal por atividade, para o dicionário enxergar cada chave. */
function usePausaDoLivre(): (a: Atividade | undefined) => string | null {
  const t = useT();
  return (a) => {
    switch (a) {
      case "cafe":
        return t("tomando um café");
      case "agua":
        return t("bebendo água");
      case "sofa":
        return t("descansando no sofá");
      case "alongar":
        return t("se alongando");
      case "planta":
        return t("regando as plantas");
      case "pingpong":
        return t("jogando ping-pong");
      case "mesa":
        return t("arrumando a mesa");
      default:
        return null;
    }
  };
}

/** Hora no fuso da organização, no idioma de quem lê (`tagDeIdioma`). */
function hora(iso: string, fuso: string, idioma: string): string {
  return new Date(iso).toLocaleTimeString(idioma, { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

export function Mundo() {
  const t = useT();
  const nomeDoSetor = useNomeDoSetor();
  const pausaDoLivre = usePausaDoLivre();
  const idioma = tagDeIdioma(useIdioma());
  const { activeOrg } = useAuth();
  const painel = usePainelDoOrquestra("hoje");
  const contagens = useConversationCounts(activeOrg?.orgId ?? null);
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const p = painel.data;
  const fila = contagens.data?.fila ?? contagens.data?.unassigned ?? null;

  const cena = React.useMemo(
    () => (p ? montarCena(p, fila, new Date(p.geradoEm), p.escritorio) : { personagens: [], agentesAlemDasMesas: 0 }),
    [p, fila],
  );
  const avisos = React.useMemo(
    () => ({
      ...(p?.agentes?.length === 0 ? { comercial: t("Nenhum agente de IA criado ainda") } : {}),
      ...(cena.agentesAlemDasMesas > 0 ? { comercial: `+${cena.agentesAlemDasMesas} ${t("agentes além das mesas")}` } : {}),
    }),
    [t, p, cena.agentesAlemDasMesas],
  );

  // A pose de quem está livre muda a cada janela da rotina; o painel acompanha o desenho.
  const [relogio, setRelogio] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setRelogio(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const layout = p?.escritorio ?? LAYOUT_PADRAO;
  const lugares = React.useMemo(() => lugaresDoLayout(layout), [layout]);
  const poses = React.useMemo(() => atividades(cena.personagens, relogio, lugares), [cena.personagens, relogio, lugares]);

  const escolhido = cena.personagens.find((x) => x.id === selecionado) ?? null;
  const rotuloDaPose = escolhido ? pausaDoLivre(poses[escolhido.id]) : null;
  const agenteEscolhido = escolhido?.id.startsWith("agente:")
    ? p?.agentes?.find((a) => `agente:${a.id}` === escolhido.id)
    : undefined;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6" data-testid="tela-mundo">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Mundo dos agentes")}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "Cada personagem é um dado de verdade: seus agentes de IA no Atendimento, a fila da equipe em Operações, o caixa do dia no Financeiro. Clique em um agente para comandá-lo.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p?.agentes ? <PausarTodos agentes={p.agentes} /> : null}
          <Button asChild variant="outline">
            <Link href="/app/orquestra">{t("Visão geral")}</Link>
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden p-2">
          <MundoDosAgentes
            cena={cena}
            layout={layout}
            avisos={avisos}
            selecionado={selecionado}
            aoSelecionar={setSelecionado}
            rotulo={t("Mapa do mundo dos agentes")}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-4" data-testid="detalhe-do-personagem">
            {escolhido ? (
              <>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{nomeDoSetor(escolhido.setor)}</p>
                <h2 className="mt-1 text-lg font-semibold">{escolhido.nome}</h2>
                <p className="mt-2 text-sm">
                  <b>{t("Agora:")}</b> {escolhido.tarefa}
                </p>
                {escolhido.rotina && poses[escolhido.id] === "descansando" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Fora do ar: descansando na copa até voltar a atender.")}
                  </p>
                ) : null}
                {rotuloDaPose && escolhido.rotina ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Livre — enquanto isso,")} {rotuloDaPose}. {t("Volta para a mesa assim que chegar trabalho.")}
                  </p>
                ) : null}
                {agenteEscolhido && p ? (
                  <>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {agenteEscolhido.turnosHoje} {t("atendimentos hoje")}
                      {agenteEscolhido.falhasHoje > 0 ? ` · ${agenteEscolhido.falhasHoje} ${t("com erro")}` : ""}
                    </p>
                    <ComandosDoAgente agente={agenteEscolhido} idioma={idioma} fuso={p.fuso} />
                  </>
                ) : escolhido.id === "equipe" ? (
                  <Link href="/app/inbox" className="mt-3 inline-block text-sm underline">
                    {t("Abrir a fila no Inbox")}
                  </Link>
                ) : escolhido.id === "caixa" ? (
                  <Link href="/app/faturamento" className="mt-3 inline-block text-sm underline">
                    {t("Abrir o faturamento")}
                  </Link>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("Clique em um personagem no mapa.")}</p>
            )}
          </Card>

          <Card className="p-4" data-testid="diario">
            <h2 className="text-sm font-medium">{t("Diário de hoje")}</h2>
            {p && !p.diarioDetalhado ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Quem administra vê também o que cada agente fez (consultou o catálogo, marcou horário…).")}
              </p>
            ) : null}
            <ul className="mt-2 max-h-96 space-y-1.5 overflow-y-auto text-sm">
              {!p ? (
                <li className="text-muted-foreground">{t("Carregando…")}</li>
              ) : p.diario.length === 0 ? (
                <li className="text-muted-foreground">{t("Nenhuma atividade de IA hoje.")}</li>
              ) : (
                p.diario.map((e, i) => (
                  <li key={`${e.em}-${i}`} className="flex gap-2">
                    <time className="shrink-0 tabular-nums text-muted-foreground">{hora(e.em, p.fuso, idioma)}</time>
                    <span>
                      <b>{e.agente}</b> {e.texto}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
