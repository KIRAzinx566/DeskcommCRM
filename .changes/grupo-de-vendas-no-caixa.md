---
impacto: capacidade_nova
secao: adicionado
titulo: Grupo de vendas do WhatsApp lança vendas e gastos no caixa
---
Em Conexões › Grupos, um grupo ligado pode ser marcado como **grupo de vendas**,
com a conta em que o dinheiro cai. A partir daí, o que a equipe já escreve no
grupo vira lançamento pago no Faturamento, sem ninguém redigitar:

- "iPhone 13 128GB vendido por R$ 2.100 no pix" → entrada de R$ 2.100,00;
- "paguei motoboy R$ 25" → saída de R$ 25,00.

O leitor entende o formato (verbo de venda ou de gasto e UM valor), não um
produto: serve para qualquer loja. Linha ambígua — sem valor, ou com dois
valores possíveis — não vira lançamento: lançamento errado no caixa é pior que
lançamento faltando. A data é a da mensagem, no fuso da organização, e a mesma
mensagem nunca lança duas vezes. Os lançamentos aparecem no Faturamento com a
marca "do grupo de vendas" (e os recorrentes e estornos deixam de aparecer como
"de comanda").

Migration 0613 (com apêndice no `baseline.sql`): colunas novas em
`channel_session_groups` e `financial_entries`, e `'grupo'` no vocabulário de
`financial_entries.origin`. Nada muda para quem não marcar um grupo.
