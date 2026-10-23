/**
 * A PERSONALIDADE do agente — quem ele é e o jeito dele de falar, configurados
 * na tela do agente (seção "Personalidade") e gravados na VERSÃO
 * (`ai_agent_versions.personality`, migration 9003). Como todo conteúdo de
 * versão, só vale depois de publicar, e a publicada é imutável.
 *
 * ## Como ela chega ao atendimento
 *
 * `blocoDaPersonalidade` vira um trecho de texto que o turno junta DEPOIS das
 * instruções do agente, na camada do tenant (`inbound-turn.ts`, `agentLayer`).
 * A camada de plataforma (compliance) segue à frente, sempre. O trecho termina
 * dizendo que personalidade é ESTILO: nunca passa por cima das instruções, das
 * regras da empresa, do catálogo nem das travas — um "brincalhão" não inventa
 * preço nem promete o que não pode.
 *
 * ## Por que estruturado, e não só texto livre
 *
 * As instruções já aceitam texto livre, e a personalidade cabia lá. Estruturar
 * dá três coisas que o texto não dá: a tela mostra controles que qualquer dono
 * entende (formal ↔ descontraído), o escritório virtual usa os gostos de cada
 * um (quem adora café vai mais à cafeteira), e campo vazio significa "não
 * mexe" — sem frase nenhuma no prompt, o agente fala como as instruções dizem.
 *
 * ## Falha aberta
 *
 * O jsonb é livre no banco. `lerPersonalidade` aceita qualquer coisa e devolve
 * só o que reconhece: campo torto é descartado, nunca derruba o turno. Uma
 * personalidade quebrada vira "sem personalidade", não silêncio.
 *
 * Puro e client-safe (a tela importa daqui também).
 */
import { z } from 'zod';

/** Escalas de 0 a 4: 0 = a ponta esquerda, 4 = a direita, 2 = no meio. */
const escala = z.number().int().min(0).max(4);

export const GOSTOS = ['cafe', 'agua', 'plantas', 'pingpong', 'sofa', 'alongar'] as const;
export type Gosto = (typeof GOSTOS)[number];

export const OPCOES_DE_EMOJI = ['nunca', 'as_vezes', 'bastante'] as const;

export const personalidadeSchema = z
  .object({
    /** Quem ele é, em uma ou duas frases ("consultora há anos, adora resolver rápido"). */
    apresentacao: z.string().trim().max(400).optional(),
    /** 0 formal … 4 descontraído */
    formalidade: escala.optional(),
    /** 0 calmo … 4 animado */
    energia: escala.optional(),
    /** 0 sério … 4 brincalhão */
    humor: escala.optional(),
    /** 0 mensagens curtas … 4 detalhadas */
    detalhe: escala.optional(),
    emoji: z.enum(OPCOES_DE_EMOJI).optional(),
    /** Expressões que ele gosta de usar ("show!", "fechou?"). */
    bordoes: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
    /** O que ele nunca diz ("caro", "infelizmente"). */
    nunca_diz: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
    /** Do que ele gosta nas pausas — só o escritório virtual usa. */
    gostos: z.array(z.enum(GOSTOS)).max(4).optional(),
  })
  .strict();

export type Personalidade = z.infer<typeof personalidadeSchema>;

/**
 * Qualquer coisa → personalidade válida, campo a campo. Um campo torto não
 * invalida os outros: perde-se o campo, não a personalidade inteira.
 */
export function lerPersonalidade(bruto: unknown): Personalidade {
  if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
  const entrada = bruto as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  const campos = personalidadeSchema.shape;
  for (const chave of Object.keys(campos) as Array<keyof typeof campos>) {
    if (entrada[chave] === undefined) continue;
    const r = campos[chave].safeParse(entrada[chave]);
    if (r.success && r.data !== undefined) saida[chave] = r.data;
  }
  return saida as Personalidade;
}

/** Algum traço que muda o jeito de falar (gostos não contam: são só do escritório). */
export function temPersonalidade(p: Personalidade | null | undefined): boolean {
  if (!p) return false;
  return (
    !!p.apresentacao ||
    p.formalidade !== undefined ||
    p.energia !== undefined ||
    p.humor !== undefined ||
    p.detalhe !== undefined ||
    p.emoji !== undefined ||
    (p.bordoes?.length ?? 0) > 0 ||
    (p.nunca_diz?.length ?? 0) > 0
  );
}

const FORMALIDADE = [
  'Fale de forma formal e cerimoniosa: trate o cliente por "o senhor" / "a senhora".',
  'Fale de forma educada e profissional, sem gírias.',
  'Fale de forma cordial e natural, nem formal demais nem solto demais.',
  'Fale de forma descontraída e próxima, como quem conversa com um conhecido.',
  'Fale de forma bem descontraída e informal, com o jeito leve de uma conversa de WhatsApp entre amigos.',
] as const;

const ENERGIA = [
  'Seu ritmo é calmo e tranquilo: transmita paciência.',
  'Seu ritmo é sereno, sem pressa.',
  'Seu ritmo é equilibrado.',
  'Você é animado e transmite entusiasmo.',
  'Você é muito animado e cheio de energia — mostre empolgação com o que o cliente quer.',
] as const;

const HUMOR = [
  'Seja sério: nada de piadas ou brincadeiras.',
  'Seja mais sério; uma leveza ocasional é aceitável.',
  'Use bom humor com moderação, quando couber.',
  'Você é bem-humorado: pode brincar de leve quando o clima permitir.',
  'Você é brincalhão: use humor com frequência, sem nunca ser desrespeitoso nem fazer piada com o problema do cliente.',
] as const;

const DETALHE = [
  'Escreva mensagens bem curtas, de uma ou duas frases.',
  'Prefira mensagens curtas e diretas.',
  'Use o tamanho de mensagem que o assunto pedir.',
  'Pode dar mais detalhes quando ajudar o cliente a decidir.',
  'Explique com detalhes e capricho, sem deixar dúvidas — mas sem enrolar.',
] as const;

const EMOJI = {
  nunca: 'Não use emojis.',
  as_vezes: 'Use emojis de vez em quando, no máximo um por mensagem.',
  bastante: 'Use emojis com frequência para deixar a conversa mais calorosa.',
} as const;

/** Aspas de citação sem quebrar o texto: o que o dono escreveu vai entre aspas, cru. */
const citar = (s: string) => `"${s.replace(/"/g, "'")}"`;

/**
 * O trecho que vai para o prompt, DEPOIS das instruções do agente. Vazio
 * quando não há traço nenhum — e aí nada muda no atendimento.
 */
export function blocoDaPersonalidade(p: Personalidade | null | undefined, nomeDoAgente: string): string {
  // Sem personalidade (config antiga, ou montada sem o campo) = bloco vazio:
  // o turno nunca cai por causa do estilo.
  if (!p || !temPersonalidade(p)) return '';
  const linhas: string[] = ['', '', '## Sua personalidade'];
  const nome = nomeDoAgente.trim();
  if (p.apresentacao) linhas.push(nome ? `Você é ${nome}. ${p.apresentacao}` : p.apresentacao);
  const jeito: string[] = [];
  if (p.formalidade !== undefined) jeito.push(FORMALIDADE[p.formalidade]!);
  if (p.energia !== undefined) jeito.push(ENERGIA[p.energia]!);
  if (p.humor !== undefined) jeito.push(HUMOR[p.humor]!);
  if (p.detalhe !== undefined) jeito.push(DETALHE[p.detalhe]!);
  if (p.emoji !== undefined) jeito.push(EMOJI[p.emoji]);
  if (jeito.length > 0) {
    linhas.push('', 'Seu jeito de falar:');
    for (const j of jeito) linhas.push(`- ${j}`);
  }
  if (p.bordoes?.length) {
    linhas.push('', `Expressões suas, para usar de vez em quando (sem repetir em toda mensagem): ${p.bordoes.map(citar).join(', ')}.`);
  }
  if (p.nunca_diz?.length) {
    linhas.push('', `Nunca use estas palavras ou frases: ${p.nunca_diz.map(citar).join(', ')}.`);
  }
  linhas.push(
    '',
    'Esses traços são o seu ESTILO. Eles nunca passam por cima das suas instruções, das regras da empresa, ' +
      'das informações do catálogo nem dos limites de segurança: na dúvida, siga as instruções.',
  );
  return linhas.join('\n');
}
