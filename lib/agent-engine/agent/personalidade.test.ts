import { describe, expect, it } from 'vitest';

import { blocoDaPersonalidade, lerPersonalidade, personalidadeSchema, temPersonalidade } from './personalidade';

describe('personalidade do agente', () => {
  it('sem traço nenhum, nada muda no prompt', () => {
    expect(blocoDaPersonalidade({}, 'Bia')).toBe('');
    // gostos são só do escritório — não mexem no jeito de falar
    expect(blocoDaPersonalidade({ gostos: ['cafe'] }, 'Bia')).toBe('');
  });

  it('cada traço vira uma frase de estilo, e o bloco termina dizendo que estilo não vence regra', () => {
    const bloco = blocoDaPersonalidade(
      {
        apresentacao: 'Consultora há anos, adora resolver rápido.',
        formalidade: 4,
        humor: 0,
        detalhe: 0,
        emoji: 'nunca',
        bordoes: ['show!', 'fechou?'],
        nunca_diz: ['infelizmente'],
      },
      'Bia',
    );
    expect(bloco).toContain('## Sua personalidade');
    expect(bloco).toContain('Você é Bia. Consultora há anos, adora resolver rápido.');
    expect(bloco).toContain('bem descontraída e informal');
    expect(bloco).toContain('nada de piadas');
    expect(bloco).toContain('mensagens bem curtas');
    expect(bloco).toContain('Não use emojis.');
    expect(bloco).toContain('"show!", "fechou?"');
    expect(bloco).toContain('Nunca use estas palavras ou frases: "infelizmente".');
    expect(bloco.trim().endsWith('na dúvida, siga as instruções.')).toBe(true);
  });

  it('o bloco começa com linha em branco — ele é colado depois das instruções', () => {
    expect(blocoDaPersonalidade({ humor: 2 }, 'Leo').startsWith('\n\n## Sua personalidade')).toBe(true);
  });

  it('aspas no que o dono escreveu não quebram a citação', () => {
    expect(blocoDaPersonalidade({ bordoes: ['diz "oi"'] }, 'Ana')).toContain(`"diz 'oi'"`);
  });

  it('o banco é jsonb livre: campo torto se perde, os bons ficam', () => {
    expect(lerPersonalidade(null)).toEqual({});
    expect(lerPersonalidade('texto')).toEqual({});
    expect(lerPersonalidade({ formalidade: 9, humor: 3, emoji: 'muito', gostos: ['cafe', 'foguete'], extra: 1 })).toEqual({ humor: 3 });
    expect(lerPersonalidade({ bordoes: ['show!'], energia: 1 })).toEqual({ bordoes: ['show!'], energia: 1 });
  });

  it('o schema da tela é estrito: chave desconhecida é recusada (não some em silêncio)', () => {
    expect(personalidadeSchema.safeParse({ humor: 2 }).success).toBe(true);
    expect(personalidadeSchema.safeParse({ humor: 2, sotaque: 'baiano' }).success).toBe(false);
    expect(personalidadeSchema.safeParse({ formalidade: 5 }).success).toBe(false);
  });

  it('temPersonalidade só conta o que muda a fala', () => {
    expect(temPersonalidade({})).toBe(false);
    expect(temPersonalidade({ gostos: ['pingpong'] })).toBe(false);
    expect(temPersonalidade({ apresentacao: 'Oi' })).toBe(true);
    expect(temPersonalidade({ formalidade: 0 })).toBe(true);
  });
});
