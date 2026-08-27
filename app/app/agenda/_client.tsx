"use client";
import { useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarBlank, MapPin, Robot, VideoCamera } from "@/lib/ui/icons";
import { useMeetingList } from "@/hooks/meetings/useMeetingList";
import { useUpdateMeeting } from "@/hooks/meetings/useUpdateMeeting";
import type { MeetingStatus } from "@/lib/schemas/meetings";
import type { Meeting } from "@/lib/types/meetings";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_show: "Não compareceu",
};

const STATUS_BADGE_VARIANT: Record<MeetingStatus, "warning" | "success" | "error" | "neutral"> = {
  agendada: "warning",
  realizada: "success",
  cancelada: "error",
  no_show: "neutral",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const update = useUpdateMeeting();

  return (
    <Card className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{formatWhen(meeting.starts_at)}</span>
          <Badge variant={STATUS_BADGE_VARIANT[meeting.status]}>{STATUS_LABEL[meeting.status]}</Badge>
          {meeting.source === "agente" && (
            <Badge variant="default" className="gap-1">
              <Robot size={12} aria-hidden />
              Marcada pelo agente
            </Badge>
          )}
        </div>
        {meeting.title && <p className="text-sm text-text">{meeting.title}</p>}
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          {meeting.modality === "presencial" && meeting.location && (
            <span className="flex items-center gap-1">
              <MapPin size={12} aria-hidden />
              {meeting.location}
            </span>
          )}
          {meeting.modality !== "presencial" && meeting.meeting_link && (
            <a
              href={meeting.meeting_link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 underline-offset-2 hover:underline"
            >
              <VideoCamera size={12} aria-hidden />
              Link da reunião
            </a>
          )}
        </div>
        {meeting.notes && <p className="text-xs text-text-muted">{meeting.notes}</p>}
      </div>

      <Select
        value={meeting.status}
        onValueChange={(v) => update.mutate({ id: meeting.id, patch: { status: v as MeetingStatus } })}
      >
        <SelectTrigger className="w-40 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABEL) as MeetingStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}

function MeetingListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

/**
 * Agenda: lista por dia, não calendário em grade (decisão do produto — cabe
 * inteira no padrão visual do resto do CRM, que é Kanban, não grade de
 * calendário). Criar reunião do zero acontece no dossiê do lead (botão
 * "Marcar reunião"), não aqui: não existe hoje um endpoint de busca livre de
 * leads para alimentar um seletor genérico nesta tela, e inventar um só para
 * isto seria escopo fora do que a feature pediu.
 */
export function AgendaClient() {
  const upcoming = useMeetingList({ status: "agendada", limit: 100 });
  const history = useMeetingList({ limit: 100 });

  const upcomingMeetings = useMemo(
    () => upcoming.data?.pages.flatMap((p) => p.data) ?? [],
    [upcoming.data],
  );
  const pastMeetings = useMemo(
    () =>
      (history.data?.pages.flatMap((p) => p.data) ?? [])
        .filter((m) => m.status !== "agendada")
        .slice()
        .reverse(),
    [history.data],
  );

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CalendarBlank aria-hidden />
          Agenda
        </h1>
        <p className="text-sm text-muted-foreground">
          Reuniões marcadas com leads — manualmente ou pelo agente de IA durante a conversa.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-text-muted">Próximas ({upcomingMeetings.length})</h2>
        {upcoming.isLoading ? (
          <MeetingListSkeleton />
        ) : upcomingMeetings.length === 0 ? (
          <Card className="p-6 text-center text-sm text-text-muted">Nenhuma reunião agendada.</Card>
        ) : (
          <div className="space-y-2">
            {upcomingMeetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </div>
        )}
        {upcoming.hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => upcoming.fetchNextPage()} disabled={upcoming.isFetchingNextPage}>
            {upcoming.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
          </Button>
        )}
      </section>

      {pastMeetings.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-text-muted">Histórico ({pastMeetings.length})</h2>
          <div className="space-y-2">
            {pastMeetings.map((m) => (
              <MeetingRow key={m.id} meeting={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
