---
impacto: exige_acao
secao: corrigido
titulo: Com OpenRouter, o custo das respostas da IA volta a ser contado — e o limite de gasto passa a valer
---

Com o provedor OpenRouter (ou qualquer gateway que nomeie o modelo como `anthropic/claude-…` ou `openai/gpt-…`), o custo das respostas do agente, das guardas e da classificação de etapa ficava em branco: a tela Uso de IA mostrava gasto zero e o limite de gasto da organização nunca era alcançado. A busca de preço agora entende esse formato. Modelo que não está na tabela de preços continua sem custo — nunca com o preço de outro.

A tela Uso de IA passa a mostrar o gasto das chamadas feitas a partir da atualização (as anteriores seguem sem custo, então o total deste mês começa a contar do dia em que você atualizou).

## Requer atenção

Se alguma organização sua tem limite de gasto configurado para interromper o atendimento, esse limite passa a valer de verdade a partir desta atualização: ao chegar nele vem primeiro o aviso na Central e, depois, a IA para de responder e as conversas vão para a fila humana. Confira o limite configurado em Uso de IA › Orçamento antes de atualizar, se você usa OpenRouter. Aumentar o limite evita paradas novas, mas não devolve a IA às conversas que já pararam — cada uma é retomada na própria conversa. A parada de emergência da instalação inteira fica em Administração › Recursos opcionais › Comportamento ("Proteção de gasto de IA"), com `AI_BUDGET_ENFORCEMENT=off` no `.env` como alternativa.
