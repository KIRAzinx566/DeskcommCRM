/**
 * O CONTEXTO DO CANAL DIRETO — monta o `system` que vai para o modelo.
 *
 * Três camadas, nesta ordem: o `system_prompt` REAL do agente selecionado
 * (o dono está falando com ELE, não com uma persona neutra — ao contrário de
 * `conversa-do-caso/persona.ts`, que degrada para `PERSONA_NEUTRA` quando não
 * há agente), a memória da org já escopada ao `agent_id` (o que ele já
 * aprendeu, para não repetir correção já feita), e a instrução fixa do
 * formato de saída.
 */
import { renderOrgMemory, type LoadedOrgMemory } from "../org-memory";

export const INSTRUCAO_DE_FORMATO = `Você está falando com o DONO do negócio, pelo canal direto de correção — não é um cliente, e esta conversa nunca aparece no atendimento. O dono pode te corrigir um comportamento, tirar uma dúvida sobre como você age, ou só conversar.

Responda SEMPRE em JSON puro, sem markdown, com exatamente este formato:
{"resposta_ao_dono": "<o que você diz de volta, em português, curto e direto>", "correcao": {"titulo": "<resumo de uma linha>", "corpo": "<a regra, em uma ou duas frases, pronta para guiar seu próprio comportamento futuro>"} ou null}

"correcao" é null quando a mensagem do dono NÃO pede uma mudança durável de comportamento (pergunta, elogio, cumprimento, ou algo que já está correto). Quando ele pedir uma mudança, preencha "correcao" com uma regra clara e ESPECÍFICA — nunca vaga. Só grave o que ele disse de verdade; não invente regra que ele não pediu.`;

export function montarSystemDoCanalDireto(input: {
  systemPromptDoAgente: string;
  orgMemory: LoadedOrgMemory;
}): string {
  const blocos = [input.systemPromptDoAgente];
  const memoria = renderOrgMemory(input.orgMemory);
  if (memoria !== "") blocos.push(memoria);
  blocos.push(INSTRUCAO_DE_FORMATO);
  return blocos.join("\n\n");
}
