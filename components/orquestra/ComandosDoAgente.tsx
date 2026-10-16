"use client";

/**
 * Os comandos de um agente no Mundo dos agentes: pausar/retomar, responder os
 * pedidos de ajuda que ele abriu e assumir/devolver as conversas dele.
 *
 * Nenhum comando é novo — cada botão chama a rota que a tela de origem já usa
 * (`AgentOperation`, `CaseReplyPanel`, o par pausar/retomar do Inbox). O Mundo
 * só junta, na mesa de quem foi clicado, o que antes pedia três telas.
 *
 * O papel decide o que aparece: pausar o agente é de quem administra
 * (`ai.agents.write`); responder caso e assumir conversa, de quem atende
 * (`inbox.claim`). Botão que o papel não alcança não aparece desabilitado sem
 * explicação — não aparece.
 */
import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { CaseReplyPanel } from "@/app/app/ai/cases/_components/CaseReplyPanel";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { usePauseAiAttendance } from "@/hooks/inbox/usePauseAiAttendance";
import { useResumeAiAttendance } from "@/hooks/inbox/useResumeAiAttendance";
import { useMesaDoAgente, usePausarAgentes } from "@/hooks/orquestra/useMesaDoAgente";
import type { AgenteNoPainel } from "@/lib/orquestra/painel";

function hora(iso: string | null, idioma: string, fuso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(idioma, { timeZone: fuso, hour: "2-digit", minute: "2-digit" });
}

export function ComandosDoAgente({ agente, idioma, fuso }: { agente: AgenteNoPainel; idioma: string; fuso: string }) {
  const t = useT();
  const qc = useQueryClient();
  const podePausar = usePermission("ai.agents.write");
  const podeAtender = usePermission("inbox.claim");
  const mesa = useMesaDoAgente(podeAtender ? agente.id : null);
  const pausar = usePausarAgentes();
  const assumir = usePauseAiAttendance();
  const devolver = useResumeAiAttendance();
  const [casoAberto, setCasoAberto] = React.useState<string | null>(null);

  const pausado = !!agente.pausadoEm;
  const releMesa = () => qc.invalidateQueries({ queryKey: ["orquestra", "mesa", agente.id] });

  return (
    <div className="mt-4 flex flex-col gap-4" data-testid="comandos-do-agente">
      {podePausar ? (
        <div className="flex flex-col gap-1.5">
          <Button
            type="button"
            variant={pausado ? "default" : "outline"}
            size="sm"
            disabled={pausar.isPending || !agente.ativo}
            onClick={() => pausar.mutate({ ids: [agente.id], pausar: !pausado })}
          >
            {t(pausado ? "Retomar automático" : "Pausar automático")}
          </Button>
          <p className="text-xs text-muted-foreground">
            {!agente.ativo
              ? t("Agente desativado. Ative-o na tela do agente.")
              : pausado
                ? t("Pausado: ele não responde ninguém até você retomar.")
                : t("Pausar cala este agente em todas as conversas, sem despublicar nada.")}
          </p>
        </div>
      ) : null}

      {podeAtender ? (
        <>
          <section>
            <h3 className="text-sm font-medium">
              {t("Pedidos de ajuda")}
              {mesa.data && mesa.data.pedidosDeAjuda.length > 0 ? ` (${mesa.data.pedidosDeAjuda.length})` : ""}
            </h3>
            {mesa.isError ? (
              <p className="mt-1 text-xs text-destructive">{t("Não deu para carregar a mesa do agente.")}</p>
            ) : !mesa.data ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("Carregando…")}</p>
            ) : mesa.data.pedidosDeAjuda.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("Ninguém esperando você aqui.")}</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {mesa.data.pedidosDeAjuda.map((c) => (
                  <li key={c.id} className="rounded-md border border-border p-2 text-sm">
                    <button
                      type="button"
                      className="w-full text-left"
                      aria-expanded={casoAberto === c.id}
                      onClick={() => setCasoAberto(casoAberto === c.id ? null : c.id)}
                    >
                      <p className="font-medium">{c.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.contato ?? t("Contato sem nome")} · {hora(c.abertoEm, idioma, fuso)}
                      </p>
                      <p className="mt-1 text-xs">
                        <b>{t("Travou em:")}</b> {c.bloqueio}
                      </p>
                    </button>
                    {casoAberto === c.id ? (
                      <div className="mt-2">
                        <CaseReplyPanel caseId={c.id} status="awaiting_human" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-medium">{t("Conversas com este agente")}</h3>
            {!mesa.data ? null : mesa.data.conversas.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">{t("Nenhuma conversa em andamento com ele.")}</p>
            ) : (
              <ul className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
                {mesa.data.conversas.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {c.contato ?? t("Contato sem nome")}{" "}
                        <span className="text-xs font-normal text-muted-foreground">{hora(c.ultimaMensagemEm, idioma, fuso)}</span>
                      </p>
                      {c.previa ? <p className="truncate text-xs text-muted-foreground">{c.previa}</p> : null}
                      <Link href={`/app/inbox?id=${c.id}`} className="text-xs underline">
                        {t("Abrir no Inbox")}
                      </Link>
                    </div>
                    {c.automaticoPausado ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={devolver.isPending}
                        onClick={() => devolver.mutate({ conversation_id: c.id }, { onSettled: releMesa })}
                      >
                        {t("Devolver ao agente")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={assumir.isPending}
                        onClick={() => assumir.mutate({ conversation_id: c.id }, { onSettled: releMesa })}
                      >
                        {t("Assumir")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <Link href={`/app/ai/agents/${agente.id}`} className="text-sm underline">
        {t("Abrir o agente")}
      </Link>
    </div>
  );
}

/** O botão de emergência do Mundo: cala (ou devolve) todos os agentes de uma vez. */
export function PausarTodos({ agentes }: { agentes: AgenteNoPainel[] }) {
  const t = useT();
  const podePausar = usePermission("ai.agents.write");
  const pausar = usePausarAgentes();
  const [confirmando, setConfirmando] = React.useState(false);
  if (!podePausar) return null;

  const noAr = agentes.filter((a) => a.ativo && !a.pausadoEm);
  const pausados = agentes.filter((a) => a.ativo && a.pausadoEm);
  if (noAr.length === 0 && pausados.length === 0) return null;

  if (noAr.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled={pausar.isPending}
        onClick={() => pausar.mutate({ ids: pausados.map((a) => a.id), pausar: false })}
      >
        {t("Retomar todos")}
      </Button>
    );
  }

  return confirmando ? (
    <div className="flex items-center gap-2">
      <span className="text-sm">{t("Calar todos os agentes agora?")}</span>
      <Button
        type="button"
        variant="destructive"
        disabled={pausar.isPending}
        onClick={() =>
          pausar.mutate({ ids: noAr.map((a) => a.id), pausar: true }, { onSettled: () => setConfirmando(false) })
        }
      >
        {t("Pausar todos")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
        {t("Cancelar")}
      </Button>
    </div>
  ) : (
    <Button type="button" variant="outline" onClick={() => setConfirmando(true)}>
      {t("Pausar todos")}
    </Button>
  );
}
