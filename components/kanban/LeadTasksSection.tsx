"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useTasks } from "@/hooks/tasks/useTasks";
import { estaAtrasada, type PrioridadeDaTarefa } from "@/lib/tarefas/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "@/lib/ui/icons";

const ROTULO_DA_PRIORIDADE: Readonly<Record<PrioridadeDaTarefa, string>> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

/**
 * "Próxima ação" do dossiê — tarefas com prazo, criadas por um humano
 * (`crm_tasks`, migration 0236).
 *
 * Deliberadamente separado de `next_action` (sugestão da IA, sem prazo): esta
 * lista é do dono do negócio, não do assistente. Pode haver várias abertas ao
 * mesmo tempo; cada linha decide sozinha (concluir/descartar), sem trava de
 * concorrência — mudar o prazo de uma tarefa que outra pessoa já concluiu só
 * reabre uma tarefa concluída, o que é reversível e não precisa de 409.
 */
export function LeadTasksSection({ leadId }: { leadId: string; pipelineId?: string | null }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { tarefas, carregando, criarTarefa, editarTarefa } = useTasks({ lead_id: leadId, aberto: true });
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState<{ title: string; due_date: string; priority: PrioridadeDaTarefa } | null>(
    null,
  );
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const abertas = [...tarefas].sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
    const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    return da - db;
  });

  async function decidir(taskId: string, status: "done" | "cancelled") {
    setDecidindo(taskId);
    try {
      await editarTarefa(taskId, { status });
    } catch {
      toast.error(t("Não consegui salvar. Tente de novo."));
    } finally {
      setDecidindo(null);
    }
  }

  async function criar() {
    if (!nova || !nova.title.trim() || !nova.due_date) return;
    setCriando(true);
    try {
      await criarTarefa({
        title: nova.title.trim(),
        due_date: new Date(nova.due_date).toISOString(),
        priority: nova.priority,
        lead_id: leadId,
      });
      setNova(null);
    } catch {
      toast.error(t("Não consegui criar a tarefa. Tente de novo."));
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Próxima ação")}
      </h3>

      {carregando ? (
        <p className="text-xs text-text-muted">{t("Carregando…")}</p>
      ) : abertas.length === 0 ? (
        <p className="text-xs text-text-muted">{t("Nenhuma tarefa pendente para este negócio.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {abertas.map((tarefa) => {
            const atrasada = estaAtrasada(tarefa);
            return (
              <li
                key={tarefa.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-xs"
                data-testid={`tarefa-${tarefa.id}`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-text">{tarefa.title}</p>
                  <p className={atrasada ? "font-medium text-destructive" : "text-text-muted"}>
                    {t(ROTULO_DA_PRIORIDADE[tarefa.priority])}
                    {tarefa.due_date ? ` · ${new Date(tarefa.due_date).toLocaleString(tagDoIdioma)}` : ""}
                    {atrasada ? ` (${t("atrasada")})` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decidindo === tarefa.id}
                    data-testid={`tarefa-concluir-${tarefa.id}`}
                    onClick={() => decidir(tarefa.id, "done")}
                  >
                    {t("Concluir")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decidindo === tarefa.id}
                    onClick={() => decidir(tarefa.id, "cancelled")}
                  >
                    {t("Descartar")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nova === null ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setNova({ title: "", due_date: "", priority: "medium" })}
        >
          <Plus size={14} className="mr-1" aria-hidden />
          {t("Nova tarefa")}
        </Button>
      ) : (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-2">
          <Input
            autoFocus
            placeholder={t("O que fazer? Ex: Ligar confirmando o orçamento")}
            value={nova.title}
            maxLength={200}
            onChange={(e) => setNova({ ...nova, title: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              type="datetime-local"
              value={nova.due_date}
              onChange={(e) => setNova({ ...nova, due_date: e.target.value })}
              className="flex-1"
            />
            <Select
              value={nova.priority}
              onValueChange={(v) => setNova({ ...nova, priority: v as PrioridadeDaTarefa })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_DA_PRIORIDADE) as PrioridadeDaTarefa[]).map((prioridade) => (
                  <SelectItem key={prioridade} value={prioridade}>
                    {t(ROTULO_DA_PRIORIDADE[prioridade])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={criando || !nova.title.trim() || !nova.due_date} onClick={criar}>
              {criando ? t("Criando…") : t("Criar tarefa")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNova(null)}>
              {t("Cancelar")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
