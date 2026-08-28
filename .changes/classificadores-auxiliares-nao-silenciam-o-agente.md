---
impacto: nada_mudou
secao: corrigido
titulo: Erro num classificador auxiliar não silencia mais o agente no WhatsApp
---

Dois classificadores auxiliares do turno (estágio do funil e anti-jailbreak)
são documentados como "não bloqueiam a conversa", mas uma falha de provedor
neles (ex.: limite de uso, fora do ar) derrubava o turno inteiro ANTES de a
resposta principal ser tentada — o cliente mandava mensagem no WhatsApp e não
recebia resposta nenhuma, nem da IA nem de um humano. Agora os dois degradam
sem sugestão/sinal e o turno segue normalmente, exatamente como já prometiam.
