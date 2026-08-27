import type { MeetingModality, MeetingStatus } from "@/lib/schemas/meetings";

export interface Meeting {
  id: string;
  organization_id: string;
  contact_id: string;
  lead_id: string | null;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  modality: MeetingModality;
  meeting_link: string | null;
  location: string | null;
  notes: string | null;
  outcome_notes: string | null;
  status: MeetingStatus;
  source: "manual" | "agente";
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
