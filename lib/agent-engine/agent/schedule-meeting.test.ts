import { beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import { applyScheduleMeeting } from './schedule-meeting';

vi.mock('@/lib/channels', () => ({ notifyOwnerWhatsApp: vi.fn(async () => undefined) }));

/**
 * Pool fake: roteia por conteúdo da SQL, mesmo padrão de
 * schedule-followup.test.ts. `openLeads` alimenta o SELECT que
 * `emitAgentActivityForContact` faz em `crm_leads` (roteamento contato→lead).
 */
function fakePool(openLeads: Array<{ id: string; status: string }>) {
  const calls: string[] = [];
  let meetingInserts = 0;
  let leadIdUpdates: string[] = [];

  const db = {
    async query(sql: string) {
      calls.push(sql);
      if (/insert into crm_meetings/i.test(sql)) {
        meetingInserts += 1;
        return { rows: [{ id: 'meeting-novo' }] };
      }
      if (/update crm_meetings set lead_id/i.test(sql)) {
        // segundo parâmetro é o leadId resolvido — capturado via query() abaixo
        return { rows: [] };
      }
      if (/from crm_leads l/i.test(sql)) {
        return {
          rows: openLeads.map((l) => ({
            id: l.id,
            organization_id: 'org-1',
            pipeline_id: 'pipe-1',
            status: l.status,
            last_activity_at: null,
            created_at: '2026-01-01T00:00:00Z',
          })),
        };
      }
      if (/from crm_pipelines/i.test(sql)) {
        return { rows: [{ id: 'pipe-1' }] };
      }
      if (/insert into crm_lead_activities/i.test(sql)) {
        return { rows: [] };
      }
      if (/insert into event_log/i.test(sql)) {
        return { rows: [] };
      }
      throw new Error(`SQL inesperado no fake pool: ${sql}`);
    },
  } as unknown as pg.Pool;

  return {
    db,
    get meetingInserts() {
      return meetingInserts;
    },
    get leadIdUpdates() {
      return leadIdUpdates;
    },
    set leadIdUpdates(v: string[]) {
      leadIdUpdates = v;
    },
    calls,
  };
}

const CFG = { clock: () => new Date('2026-07-23T12:00:00Z') };
const IDS = { tenantId: 'org-1', leadId: 'contact-1', agentId: 'agent-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyScheduleMeeting', () => {
  it('marca a reunião mesmo sem negócio aberto para o contato (lead_id fica sem valor)', async () => {
    const p = fakePool([]); // nenhum lead aberto — routed: false
    const res = await applyScheduleMeeting(p.db, CFG, IDS, {
      starts_at: '2026-07-25T14:00:00Z',
      title: 'Diagnóstico',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('esperava sucesso');
    expect(res.meetingId).toBe('meeting-novo');
    expect(p.meetingInserts).toBe(1);
    expect(p.calls.some((c) => /update crm_meetings set lead_id/i.test(c))).toBe(false);
  });

  it('marca a reunião e preenche lead_id quando o roteamento resolve um único negócio aberto', async () => {
    const p = fakePool([{ id: 'lead-42', status: 'open' }]);
    const res = await applyScheduleMeeting(p.db, CFG, IDS, {
      starts_at: '2026-07-25T14:00:00Z',
    });
    expect(res.ok).toBe(true);
    expect(p.calls.some((c) => /update crm_meetings set lead_id/i.test(c))).toBe(true);
  });

  it('rejeita starts_at no passado, ensinando a hora atual', async () => {
    const p = fakePool([]);
    const res = await applyScheduleMeeting(p.db, CFG, IDS, { starts_at: '2020-01-01T00:00:00Z' });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('esperava falha');
    expect(res.error.code).toBe('starts_at_in_past');
    expect(res.error.message).toContain('2026-07-23T12:00:00');
    expect(p.meetingInserts).toBe(0);
  });

  it('rejeita ends_at antes de starts_at', async () => {
    const p = fakePool([]);
    const res = await applyScheduleMeeting(p.db, CFG, IDS, {
      starts_at: '2026-07-25T14:00:00Z',
      ends_at: '2026-07-25T13:00:00Z',
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('esperava falha');
    expect(res.error.code).toBe('ends_before_starts');
    expect(p.meetingInserts).toBe(0);
  });

  it('rejeita campo forjado (__proto__) sem chegar a tocar o banco', async () => {
    const p = fakePool([]);
    const res = await applyScheduleMeeting(
      p.db,
      CFG,
      IDS,
      JSON.parse('{"starts_at":"2026-07-25T14:00:00Z","__proto__":{"polluted":true}}'),
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('esperava falha');
    expect(res.error.code).toBe('invalid_payload');
    expect(p.meetingInserts).toBe(0);
  });

  it('rejeita campo desconhecido (whitelist estrita)', async () => {
    const p = fakePool([]);
    const res = await applyScheduleMeeting(p.db, CFG, IDS, {
      starts_at: '2026-07-25T14:00:00Z',
      link_da_call: 'https://example.com',
    });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('esperava falha');
    expect(res.error.code).toBe('invalid_payload');
    expect(res.error.message).toContain('link_da_call');
    expect(p.meetingInserts).toBe(0);
  });
});
