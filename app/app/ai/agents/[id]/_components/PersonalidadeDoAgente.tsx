"use client";
/**
 * A seção "Personalidade" da tela do agente (migration 9003).
 *
 * Tudo aqui é opcional, e o que fica sem marcar NÃO vira frase nenhuma: o
 * agente fala como as instruções dele dizem. Cada escala tem o "—" para voltar
 * a "não definido". O bloco que o motor de fato recebe aparece em "Como isso
 * entra nas instruções" — é o mesmo `blocoDaPersonalidade` do turno, não uma
 * descrição dele.
 *
 * Como o resto da versão, vale depois de salvar e publicar.
 */
import * as React from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { blocoDaPersonalidade, GOSTOS, OPCOES_DE_EMOJI, type Gosto, type Personalidade } from "@/lib/agent-engine/agent/personalidade";
import { cn } from "@/lib/utils";

type Escala = "formalidade" | "energia" | "humor" | "detalhe";

/** Rótulos das pontas — literais, para o dicionário enxergar cada chave. */
function useEscalas(): Array<{ campo: Escala; titulo: string; esquerda: string; direita: string }> {
  const t = useT();
  return [
    { campo: "formalidade", titulo: t("Formalidade"), esquerda: t("Formal"), direita: t("Descontraído") },
    { campo: "energia", titulo: t("Energia"), esquerda: t("Calmo"), direita: t("Animado") },
    { campo: "humor", titulo: t("Humor"), esquerda: t("Sério"), direita: t("Brincalhão") },
    { campo: "detalhe", titulo: t("Tamanho das mensagens"), esquerda: t("Curtas"), direita: t("Detalhadas") },
  ];
}

function useRotuloDoGosto(): (g: Gosto) => string {
  const t = useT();
  return (g) =>
    g === "cafe"
      ? t("Café")
      : g === "agua"
        ? t("Água")
        : g === "plantas"
          ? t("Plantas")
          : g === "pingpong"
            ? t("Ping-pong")
            : g === "sofa"
              ? t("Sofá")
              : t("Alongar");
}

/** "show!, fechou?" ⇄ ["show!", "fechou?"] — a lista é editada como texto. */
const paraLista = (texto: string) =>
  texto
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 8);

export function PersonalidadeDoAgente({
  valor,
  aoMudar,
  nomeDoAgente,
  readOnly,
}: {
  valor: Personalidade;
  aoMudar: (p: Personalidade) => void;
  nomeDoAgente: string;
  readOnly?: boolean;
}) {
  const t = useT();
  const escalas = useEscalas();
  const rotuloDoGosto = useRotuloDoGosto();
  const [verBloco, setVerBloco] = React.useState(false);
  // Texto livre das listas: guardado como digitado e convertido no blur, para a
  // vírgula do meio da digitação não sumir.
  const [bordoes, setBordoes] = React.useState((valor.bordoes ?? []).join(", "));
  const [nuncaDiz, setNuncaDiz] = React.useState((valor.nunca_diz ?? []).join(", "));

  const muda = (parcial: Partial<Personalidade>) => {
    const novo: Personalidade = { ...valor, ...parcial };
    // undefined = "não definido": tira a chave para o objeto salvo ficar limpo
    for (const k of Object.keys(novo) as Array<keyof Personalidade>) {
      const v = novo[k];
      if (v === undefined || (Array.isArray(v) && v.length === 0) || v === "") delete novo[k];
    }
    aoMudar(novo);
  };

  const bloco = blocoDaPersonalidade(valor, nomeDoAgente);

  return (
    <Card className="space-y-4 p-4" data-testid="personalidade-do-agente">
      <div>
        <h3 className="text-sm font-medium">{t("Personalidade")}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Quem ele é e o jeito dele de falar. Tudo é opcional: o que ficar sem marcar não muda nada, e ele segue as instruções acima. Vale depois de publicar.",
          )}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="personalidade-apresentacao">{t("Quem ele é")}</Label>
        <Textarea
          id="personalidade-apresentacao"
          rows={2}
          maxLength={400}
          disabled={readOnly}
          value={valor.apresentacao ?? ""}
          placeholder={t("Ex.: consultora há anos, adora resolver rápido e conhece cada produto da loja.")}
          onChange={(e) => muda({ apresentacao: e.target.value || undefined })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {escalas.map((e) => {
          const atual = valor[e.campo];
          return (
            <div key={e.campo} className="space-y-1">
              <p className="text-xs font-medium">{e.titulo}</p>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={e.titulo}>
                <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">{e.esquerda}</span>
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={atual === n}
                    aria-label={`${e.titulo} ${n + 1}/5`}
                    disabled={readOnly}
                    onClick={() => muda({ [e.campo]: n } as Partial<Personalidade>)}
                    className={cn(
                      "h-6 w-6 rounded-full border transition-colors",
                      atual === n ? "border-accent bg-accent" : "border-border hover:border-border-strong",
                    )}
                  />
                ))}
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{e.direita}</span>
                <button
                  type="button"
                  disabled={readOnly || atual === undefined}
                  onClick={() => muda({ [e.campo]: undefined } as Partial<Personalidade>)}
                  className="text-xs text-muted-foreground underline disabled:no-underline disabled:opacity-40"
                  title={t("Não definido")}
                >
                  —
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">{t("Emojis")}</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Emojis")}>
          {([undefined, ...OPCOES_DE_EMOJI] as const).map((v) => {
            const rotulo =
              v === undefined ? t("Não definido") : v === OPCOES_DE_EMOJI[0] ? t("Nunca") : v === OPCOES_DE_EMOJI[1] ? t("Às vezes") : t("Bastante");
            return (
            <button
              key={v ?? "nenhum"}
              type="button"
              role="radio"
              aria-checked={valor.emoji === v}
              disabled={readOnly}
              onClick={() => muda({ emoji: v })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                valor.emoji === v ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
              )}
            >
              {rotulo}
            </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="personalidade-bordoes">{t("Expressões dele")}</Label>
          <Input
            id="personalidade-bordoes"
            disabled={readOnly}
            value={bordoes}
            placeholder={t("show!, fechou?, bora")}
            onChange={(e) => setBordoes(e.target.value)}
            onBlur={() => muda({ bordoes: paraLista(bordoes) })}
          />
          <p className="text-[11px] text-muted-foreground">{t("Separe por vírgula. Ele usa de vez em quando, sem repetir em toda mensagem.")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="personalidade-nunca">{t("O que ele nunca diz")}</Label>
          <Input
            id="personalidade-nunca"
            disabled={readOnly}
            value={nuncaDiz}
            placeholder={t("infelizmente, caro, não tem como")}
            onChange={(e) => setNuncaDiz(e.target.value)}
            onBlur={() => muda({ nunca_diz: paraLista(nuncaDiz) })}
          />
          <p className="text-[11px] text-muted-foreground">{t("Separe por vírgula.")}</p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">{t("Do que ele gosta nas pausas")}</p>
        <p className="text-[11px] text-muted-foreground">
          {t("Só para o escritório virtual: quando está livre, ele prefere estas atividades. Não muda as respostas.")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {GOSTOS.map((g) => {
            const marcado = valor.gostos?.includes(g) ?? false;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={marcado}
                disabled={readOnly || (!marcado && (valor.gostos?.length ?? 0) >= 4)}
                onClick={() =>
                  muda({ gostos: marcado ? valor.gostos?.filter((x) => x !== g) : [...(valor.gostos ?? []), g] })
                }
                className={cn(
                  "rounded-full border px-3 py-1 text-xs disabled:opacity-50",
                  marcado ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong",
                )}
              >
                {rotuloDoGosto(g)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t pt-3">
        <button type="button" className="text-xs underline" onClick={() => setVerBloco((v) => !v)} aria-expanded={verBloco}>
          {verBloco ? t("Esconder o que entra nas instruções") : t("Como isso entra nas instruções")}
        </button>
        {verBloco ? (
          bloco ? (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs" data-testid="bloco-da-personalidade">
              {bloco.trim()}
            </pre>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Nada ainda: sem traço marcado, as instruções ficam como estão.")}
            </p>
          )
        ) : null}
      </div>
    </Card>
  );
}
