---
impacto: capacidade_nova
secao: adicionado
titulo: Tabela de preços do dia e simulação de parcelas no cartão para o atendente de IA
---
Duas réguas de preço novas na tela de Produtos, em **Preços e parcelas**, para a
loja que vende pelo WhatsApp:

- **Tabela do dia.** Ligando "Exigir que a tabela de preços seja conferida todo
  dia", o atendente de IA só passa preço da tabela conferida HOJE (no fuso da
  organização). Sem a conferência, a busca de produtos devolve o produto sem o
  preço, e o atendente diz ao cliente que já envia a tabela atualizada e chama a
  equipe. A tabela é conferida pelo botão "Os preços de hoje estão certos" ou
  importando a planilha inteira sem nenhuma linha recusada. Um aviso no topo da
  tela de Produtos explica por que o atendente parou de passar preço.
- **Parcelas no cartão.** A loja cola a tabela de taxas da maquininha (débito,
  crédito à vista e cada número de vezes) e, se quiser, até quantas vezes é sem
  juros. Quando o cliente pergunta "em 10x fica quanto?", a busca de produtos do
  atendente (`crm_search_products`, parâmetro novo `vezes`) devolve o valor exato
  da parcela de cada produto — valor à vista ÷ (1 − taxa), dividido pelas vezes.
  Opção sem taxa cadastrada não é estimada: o atendente diz que vai confirmar com
  a equipe. Não é uma capacidade nova: todo agente que já procura produto passa a
  saber parcelar, sem ninguém ligar nada e sem ocupar vaga no teto de
  capacidades.

Desligado por padrão: sem configurar nada, o atendente passa o preço cadastrado
como sempre passou, e pergunta de parcela continua indo para a equipe. Nenhuma
mudança de schema — as duas configurações moram em `organizations.settings`.
