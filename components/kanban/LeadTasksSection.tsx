"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useCriarTarefa, useLeadTasks, usePatchTarefa } from "@/hooks/leads/useLeadTasks";
import { estaAtrasada } from "@/lib/leads/lead-tasks";
import type { TaskType } from "@/lib/leads/lead-tasks";
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

const ROTULO_DO_TIPO: Readonly<Record<TaskType, string>> = {
  call: "Ligar",
  whatsapp_message: "Mandar mensagem",
  meeting: "Reunião",
  follow_up: "Follow-up",
  other: "Outro",
};

/**
 * "Próxima ação" do dossiê — tarefas leves com prazo, criadas por um humano.
 *
 * Deliberadamente separado de `next_action` (sugestão da IA, sem prazo): esta
 * lista é do dono do negócio, não do assistente. Pode haver várias pendentes
 * ao mesmo tempo; cada linha decide sozinha (concluir/descartar), sem trava de
 * concorrência — mudar o prazo de uma tarefa que outra pessoa já concluiu só
 * reabre uma tarefa concluída, o que é reversível e não precisa de 409.
 */
export function LeadTasksSection({ leadId, pipelineId }: { leadId: string; pipelineId?: string | null }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const tasks = useLeadTasks(leadId);
  const criar = useCriarTarefa(leadId, pipelineId);
  const patch = usePatchTarefa(leadId, pipelineId);
  const [nova, setNova] = useState<{ title: string; due_at: string; type: TaskType } | null>(null);

  const pendentes = (tasks.data ?? [])
    .filter((tk) => tk.status === "pending")
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());

  function decidir(taskId: string, status: "done" | "dismissed") {
    patch.mutate(
      { taskId, patch: { status } },
      { onError: () => toast.error(t("Não consegui salvar. Tente de novo.")) },
    );
  }

  function criarTarefa() {
    if (!nova || !nova.title.trim() || !nova.due_at) return;
    criar.mutate(
      { title: nova.title.trim(), due_at: new Date(nova.due_at).toISOString(), type: nova.type },
      {
        onSuccess: () => setNova(null),
        onError: () => toast.error(t("Não consegui criar a tarefa. Tente de novo.")),
      },
    );
  }

  return (
    <div className="border-t border-border pt-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {t("Próxima ação")}
      </h3>

      {tasks.isLoading ? (
        <p className="text-xs text-text-muted">{t("Carregando…")}</p>
      ) : pendentes.length === 0 ? (
        <p className="text-xs text-text-muted">{t("Nenhuma tarefa pendente para este negócio.")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pendentes.map((tarefa) => {
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
                    {t(ROTULO_DO_TIPO[tarefa.type])} ·{" "}
                    {new Date(tarefa.due_at).toLocaleString(tagDoIdioma)}
                    {atrasada ? ` (${t("atrasada")})` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={patch.isPending}
                    data-testid={`tarefa-concluir-${tarefa.id}`}
                    onClick={() => decidir(tarefa.id, "done")}
                  >
                    {t("Concluir")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={patch.isPending}
                    onClick={() => decidir(tarefa.id, "dismissed")}
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
          onClick={() => setNova({ title: "", due_at: "", type: "other" })}
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
              value={nova.due_at}
              onChange={(e) => setNova({ ...nova, due_at: e.target.value })}
              className="flex-1"
            />
            <Select
              value={nova.type}
              onValueChange={(v) => setNova({ ...nova, type: v as TaskType })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROTULO_DO_TIPO) as TaskType[]).map((tipo) => (
                  <SelectItem key={tipo} value={tipo}>
                    {t(ROTULO_DO_TIPO[tipo])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={criar.isPending || !nova.title.trim() || !nova.due_at}
              onClick={criarTarefa}
            >
              {criar.isPending ? t("Criando…") : t("Criar tarefa")}
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
