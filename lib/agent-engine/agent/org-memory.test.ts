import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import { composeSystemPrompt, loadOrgMemory, renderOrgMemory } from './org-memory';

function poolSeq(responses: Array<{ rows: unknown[] }>): pg.Pool {
  const query = vi.fn();
  for (const r of responses) query.mockResolvedValueOnce(r);
  return { query } as unknown as pg.Pool;
}

describe('loadOrgMemory', () => {
  it('resolve doc pelo ponteiro e entries active em ordem estável', async () => {
    const pool = poolSeq([
      { rows: [{ content: 'Regras da org.' }] },
      { rows: [{ id: 'e1', title: 'Horário', body: 'Atendemos 8h-18h.' }] },
    ]);
    const mem = await loadOrgMemory(pool, 'org1');
    expect(mem).toEqual({ content: 'Regras da org.', entries: [{ id: 'e1', title: 'Horário', body: 'Atendemos 8h-18h.' }] });
  });

  it('org sem memória: content null e entries vazias', async () => {
    const mem = await loadOrgMemory(poolSeq([{ rows: [] }, { rows: [] }]), 'org1');
    expect(mem).toEqual({ content: null, entries: [] });
  });

  it('sem terceiro argumento, o filtro de entries passa agentId null (regressão zero)', async () => {
    const pool = poolSeq([{ rows: [{ content: null }] }, { rows: [] }]);
    await loadOrgMemory(pool, 'org1');
    const [, params] = (pool.query as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]!;
    expect(params).toEqual(['org1', null]);
  });

  it('com agentId, o filtro de entries passa o id — entries de outro agente não entram na query (agent_id is null or agent_id = $2)', async () => {
    const pool = poolSeq([{ rows: [{ content: null }] }, { rows: [{ id: 'e1', title: 'Correção', body: 'Nunca oferecer desconto.' }] }]);
    const mem = await loadOrgMemory(pool, 'org1', 'agent-x');
    const [sql, params] = (pool.query as unknown as { mock: { calls: unknown[][] } }).mock.calls[1]!;
    expect(sql as string).toContain('agent_id is null or agent_id = $2');
    expect(params).toEqual(['org1', 'agent-x']);
    expect(mem.entries).toEqual([{ id: 'e1', title: 'Correção', body: 'Nunca oferecer desconto.' }]);
  });
});

describe('renderOrgMemory', () => {
  it('vazio quando não há doc nem entries', () => {
    expect(renderOrgMemory({ content: null, entries: [] })).toBe('');
  });
  it('doc + entries viram bloco determinístico', () => {
    const out = renderOrgMemory({ content: 'Doc.', entries: [{ id: 'e1', title: 'T', body: 'B' }] });
    expect(out).toContain('=== memória da organização (regras e aprendizados — valem para TODO atendimento) ===');
    expect(out).toContain('Doc.');
    expect(out).toContain('- T: B');
  });
});

describe('composeSystemPrompt', () => {
  it('ordem: playbook → memória → índice de skills; blocos vazios somem sem separadores órfãos', () => {
    expect(composeSystemPrompt({ playbookPrompt: 'P', orgMemoryBlock: '', skillIndex: '' })).toBe('P');
    const full = composeSystemPrompt({ playbookPrompt: 'P', orgMemoryBlock: 'M', skillIndex: 'S' });
    expect(full.indexOf('P')).toBeLessThan(full.indexOf('M'));
    expect(full.indexOf('M')).toBeLessThan(full.indexOf('S'));
    expect(full).toContain('=== skills (índice — o corpo carrega no turno quando a situação dispara) ===');
  });
});
