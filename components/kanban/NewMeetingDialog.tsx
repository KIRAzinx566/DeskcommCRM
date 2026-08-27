"use client";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateMeeting } from "@/hooks/meetings/useCreateMeeting";
import { createMeetingSchema, MEETING_MODALITIES, type MeetingModality } from "@/lib/schemas/meetings";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
}

const MODALITY_LABEL: Record<MeetingModality, string> = {
  online: "Online",
  presencial: "Presencial",
  ligacao: "Ligação",
};

export function NewMeetingDialog({ open, onOpenChange, leadId }: Props) {
  const create = useCreateMeeting();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [modality, setModality] = useState<MeetingModality>("online");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setTitle("");
    setStartsAt("");
    setModality("online");
    setMeetingLink("");
    setLocation("");
    setNotes("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // `datetime-local` guarda a hora no fuso de QUEM OLHA — `new Date(...)`
    // interpreta o mesmo jeito, então o round-trip é consistente sem
    // adivinhar o fuso da organização (mesmo padrão de DossieDoFollowup).
    const startsIso = startsAt ? new Date(startsAt).toISOString() : "";

    const payload = {
      lead_id: leadId,
      title: title.trim() || null,
      starts_at: startsIso,
      modality,
      meeting_link: meetingLink.trim() || null,
      location: location.trim() || null,
      notes: notes.trim() || null,
    };

    const parsed = createMeetingSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos.");
      return;
    }

    try {
      await create.mutateAsync(parsed.data);
      toast.success("Reunião marcada.");
      reset();
      onOpenChange(false);
    } catch {
      // toast já mostrado por showApiError
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar reunião</DialogTitle>
          <DialogDescription>Fica registrada na Agenda e avisa o responsável por WhatsApp.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Assunto</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Apresentação da proposta"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meeting-starts-at">Data e hora</Label>
            <Input
              id="meeting-starts-at"
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Modalidade</Label>
            <Select value={modality} onValueChange={(v) => setModality(v as MeetingModality)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEETING_MODALITIES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODALITY_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {modality === "presencial" ? (
            <div className="space-y-2">
              <Label htmlFor="meeting-location">Local</Label>
              <Input id="meeting-location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="meeting-link">Link da reunião</Label>
              <Input
                id="meeting-link"
                value={meetingLink}
                onChange={(e) => setMeetingLink(e.target.value)}
                placeholder="https://meet.google.com/..."
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="meeting-notes">Notas</Label>
            <Textarea id="meeting-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending || !startsAt}>
              {create.isPending ? "Marcando…" : "Marcar reunião"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
