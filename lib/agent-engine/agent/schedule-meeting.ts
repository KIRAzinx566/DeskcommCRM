/**
 * Tool schedule_meeting (F-novo) — o agente marca uma reunião com o PRÓPRIO
 * lead durante a conversa. Mirror disciplinado de schedule_followup
 * (schedule-followup.ts): whitelist `.strict()` + guard de prototype pollution
 * ANTES do parse (mesmo motivo — Zod v4 dropa `__proto__` em silêncio); tenant
 * e contato vêm SEMPRE do runtime (row do job), jamais do payload do modelo.
 * Data no passado / fim antes do início → ensino, sem agendar nada.
 *
 * ⚠️ "leadId" aqui É O CONTATO (mesma convenção de schedule-followup e de
 * `emitAgentActivityForContact`: no harness, "lead" = `job.contact_id`).
 * `crm_meetings.lead_id` (o NEGÓCIO) só é preenchido se
 * `emitAgentActivityForContact` conseguir rotear o contato para um negócio
 * aberto sem ambiguidade — ausência é desfecho legítimo (migration 0167),
 * não erro: a reunião fica de pé, vinculada ao contato, sem lead.
 */
import { z } from 'zod';
import type pg from 'pg';

import { emitAgentActivityForContact } from '@/lib/leads/agent-activity';
import { notifyOwnerWhatsApp } from '@/lib/channels';

import { findForbiddenKey, zodIssuesSummary } from './lead-state';

const MODALITIES = ['online', 'presencial', 'ligacao'] as const;

/** Whitelist EXATA do que o modelo agenda — .strict() rejeita o resto. */
export const scheduleMeetingInputSchema = z.strictObject({
  starts_at: z.string().min(1).max(64),
  ends_at: z.string().min(1).max(64).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  modality: z.enum(MODALITIES).optional(),
  meeting_link: z.string().max(2048).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type ScheduleMeetingInput = z.infer<typeof scheduleMeetingInputSchema>;

export type ScheduleMeetingResult =
  | { ok: true; meetingId: string; startsAt: Date; message: string }
  | {
      ok: false;
      error: {
        code: 'invalid_payload' | 'starts_at_in_past' | 'ends_before_starts';
        message: string;
      };
    };

const PAYLOAD_TEACHING =
  'Campos aceitos: starts_at (data/hora ISO 8601 do início, no futuro), ends_at (fim, opcional), ' +
  'title (opcional), modality (online | presencial | ligacao, opcional), meeting_link (opcional), ' +
  'location (opcional), notes (opcional) — nada além. Lead e organização vêm do runtime, nunca do payload da tool.';

function teachInvalidPayload(issues: string): ScheduleMeetingResult {
  return {
    ok: false,
    error: { code: 'invalid_payload', message: `payload inválido em schedule_meeting (${issues}). ${PAYLOAD_TEACHING}` },
  };
}

/**
 * Valida o payload prometido e cria a reunião. Erros de DB sobem — o tool
 * wrapper do run os captura e ensina o modelo a encerrar (padrão F2-09).
 */
export async function applyScheduleMeeting(
  db: pg.Pool,
  cfg: { clock: () => Date },
  ids: { tenantId: string; leadId: string; agentId?: string | null },
  rawInput: unknown,
): Promise<ScheduleMeetingResult> {
  const forbidden = findForbiddenKey(rawInput);
  if (forbidden !== null) {
    return teachInvalidPayload(`campos não reconhecidos: ${forbidden}`);
  }
  const parsed = scheduleMeetingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return teachInvalidPayload(zodIssuesSummary(parsed.error));
  }
  const input = parsed.data;

  const agora = cfg.clock();
  const startsAt = new Date(input.starts_at);
  if (Number.isNaN(startsAt.getTime())) {
    return teachInvalidPayload(
      `starts_at não é uma data ISO 8601 válida. AGORA é ${agora.toISOString()} — some o prazo pedido a este instante e mande o resultado absoluto`,
    );
  }
  if (startsAt.getTime() <= agora.getTime()) {
    return {
      ok: false,
      error: {
        code: 'starts_at_in_past',
        message:
          `a data da reunião (starts_at) já passou ou é agora: AGORA é ${agora.toISOString()}. ` +
          `Some o prazo combinado a este instante e mande a data absoluta resultante — não repita a mesma data.`,
      },
    };
  }

  let endsAt: Date | null = null;
  if (input.ends_at) {
    endsAt = new Date(input.ends_at);
    if (Number.isNaN(endsAt.getTime())) {
      return teachInvalidPayload(`ends_at não é uma data ISO 8601 válida. AGORA é ${agora.toISOString()}`);
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      return {
        ok: false,
        error: {
          code: 'ends_before_starts',
          message: 'ends_at precisa ser depois de starts_at — confira as duas datas e mande de novo.',
        },
      };
    }
  }

  const { rows } = await db.query<{ id: string }>(
    `insert into crm_meetings
       (organization_id, contact_id, title, starts_at, ends_at, modality, meeting_link, location, notes, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'agente')
     returning id`,
    [
      ids.tenantId,
      ids.leadId,
      input.title ?? null,
      startsAt.toISOString(),
      endsAt ? endsAt.toISOString() : null,
      input.modality ?? 'online',
      input.meeting_link ?? null,
      input.location ?? null,
      input.notes ?? null,
    ],
  );
  const meetingId = rows[0]!.id;

  // A REUNIÃO ENTRA NA TIMELINE DO NEGÓCIO — mesmo motivo de
  // schedule-followup: sem isto, o compromisso só existiria em `crm_meetings`,
  // e o humano vendo o card não teria onde ler que uma reunião foi marcada.
  // `emitAgentActivityForContact` também resolve o contato→lead (0167 §"por
  // que lead_id é opcional") — reaproveita-se o resultado pra preencher
  // `crm_meetings.lead_id` quando o roteamento não é ambíguo.
  const atividade = await emitAgentActivityForContact({
    pool: db,
    organizationId: ids.tenantId,
    contactId: ids.leadId,
    type: 'meeting_scheduled',
    reason: input.title ? `Reunião marcada — ${input.title}` : 'Reunião marcada',
    sourceModule: 'crm_meetings',
    sourceId: meetingId,
    agentId: ids.agentId ?? null,
    payload: { meeting_id: meetingId, starts_at: startsAt.toISOString(), modality: input.modality ?? 'online' },
  });
  if (atividade.routed) {
    await db.query(`update crm_meetings set lead_id = $1 where id = $2`, [atividade.leadId, meetingId]);
  }

  // Aviso ao dono é side effect não-crítico: nunca derruba a criação da
  // reunião, e `notifyOwnerWhatsApp` já engole os próprios erros. Data em UTC
  // ISO, não localizada: este módulo não conhece o timezone da organização
  // (`organizations.timezone`), e adivinhar um fuso errado na mensagem seria
  // pior do que mandar a data em formato inequívoco.
  await notifyOwnerWhatsApp(
    ids.tenantId,
    `Reunião marcada pelo assistente${input.title ? ` — ${input.title}` : ''} para ${startsAt.toISOString()} (UTC).`,
  );

  return {
    ok: true,
    meetingId,
    startsAt,
    message: `reunião marcada para ${input.starts_at}. Encerre o turno agora; o compromisso já está na agenda.`,
  };
}
