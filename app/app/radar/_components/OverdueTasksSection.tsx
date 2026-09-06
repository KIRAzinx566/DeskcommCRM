"use client";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useOverdueTasks } from "@/hooks/leads/useOverdueTasks";
import { Skeleton } from "@/components/ui/skeleton";
import { ClockCountdown } from "@/lib/ui/icons";

/**
 * Seção SEPARADA do radar de risco — outro sinal, sobre outra coisa. O radar
 * de risco (`lib/leads/risk-radar.ts`) diz "este negócio esfriou"; esta lista
 * diz "alguém prometeu fazer algo até uma data, e a data passou". Não toca no
 * classificador de risco: é uma lista adicional, não uma mudança de critério.
 */
export function OverdueTasksSection() {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { data, isLoading } = useOverdueTasks();

  if (isLoading) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text">{t("Tarefas atrasadas")}</h2>
        <Skeleton className="h-16 w-full" />
      </section>
    );
  }

  const itens = data?.items ?? [];
  if (itens.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="tarefas-atrasadas">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
        <ClockCountdown size={18} className="text-warning-fg" weight="duotone" aria-hidden />
        {t("Tarefas atrasadas")} · {itens.length}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {itens.map((tarefa) => {
          const href = tarefa.pipeline_id ? `/app/pipelines/${tarefa.pipeline_id}` : "/app/kanban";
          return (
            <li key={tarefa.id}>
              <Link
                href={href}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{tarefa.title}</p>
                  <p className="truncate text-xs text-text-muted">{tarefa.lead_title}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-warning-fg">
                  {new Date(tarefa.due_at).toLocaleDateString(tagDoIdioma)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
