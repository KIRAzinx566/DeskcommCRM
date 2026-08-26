/**
 * Zod schemas for `/api/v1/meetings/*` endpoints (migration 0167).
 *
 *  - createMeetingSchema → POST /api/v1/meetings
 *  - updateMeetingSchema → PATCH /api/v1/meetings/[id]
 */
import { z } from "zod";

export const MEETING_MODALITIES = ["online", "presencial", "ligacao"] as const;
export type MeetingModality = (typeof MEETING_MODALITIES)[number];

export const MEETING_STATUSES = ["agendada", "realizada", "cancelada", "no_show"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

/**
 * Aceita ISO 8601 ou timestamptz estilo Postgres — mesmo padrão de
 * `flexibleTimestamp` em `lib/schemas/leads.ts`. Sem isto, uma data
 * malformada só falharia no INSERT (erro cru de Postgres na resposta), em vez
 * de um 422 de validação legível.
 */
const flexibleTimestamp = z
  .string()
  .min(10)
  .refine((s) => !Number.isNaN(Date.parse(s)), "precisa ser um timestamp válido");

/**
 * createMeetingSchema → POST /api/v1/meetings
 * `lead_id` é o que a UI de fato oferece (o usuário escolhe um lead, não um
 * contato solto) — o handler deriva `contact_id` do lead escolhido, porque
 * `crm_meetings.contact_id` é a coluna NOT NULL (0167 §"por que contact_id
 * obrigatório").
 */
export const createMeetingSchema = z
  .object({
    lead_id: z.string().uuid(),
    title: z.string().max(200).nullable().optional(),
    starts_at: flexibleTimestamp,
    ends_at: flexibleTimestamp.nullable().optional(),
    modality: z.enum(MEETING_MODALITIES).default("online"),
    meeting_link: z.string().max(2048).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    assigned_to: z.string().uuid().nullable().optional(),
  })
  .refine((v) => !v.ends_at || new Date(v.ends_at) > new Date(v.starts_at), {
    message: "ends_at precisa ser depois de starts_at",
    path: ["ends_at"],
  });
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

/**
 * updateMeetingSchema → PATCH /api/v1/meetings/[id]
 * Cobre reagendar (starts_at/ends_at), trocar status e registrar o desfecho
 * (outcome_notes). Não notifica de novo — só a criação avisa o dono (decisão
 * do produto, 0167). Sem o refine ends_at>starts_at daqui: um PATCH pode
 * mandar só um dos dois campos, e a comparação contra o valor ATUAL do banco
 * não é responsabilidade do Zod — o CHECK `crm_meetings_ends_after_starts`
 * (migration 0167) é quem barra a combinação inconsistente na escrita.
 */
export const updateMeetingSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  starts_at: flexibleTimestamp.optional(),
  ends_at: flexibleTimestamp.nullable().optional(),
  modality: z.enum(MEETING_MODALITIES).optional(),
  meeting_link: z.string().max(2048).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  outcome_notes: z.string().max(2000).nullable().optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});
export type UpdateMeetingInput = z.infer<typeof updateMeetingSchema>;

export const listMeetingsQuerySchema = z.object({
  lead_id: z.string().uuid().optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  from: flexibleTimestamp.optional(),
  to: flexibleTimestamp.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().nullable().optional(),
});
export type ListMeetingsQuery = z.infer<typeof listMeetingsQuerySchema>;
