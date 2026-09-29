---
impacto: capacidade_nova
secao: adicionado
titulo: A integração que repete o pedido não cria dois textos sugeridos
---

Quando a integração que cria o texto sugerido repete o pedido — timeout, rede, retentativa do
ERP —, a criação do texto sugerido pela API agora aceita o cabeçalho `Idempotency-Key`, como os
outros POSTs de criação do produto: a mesma chave devolve a MESMA resposta gravada, sem criar um
segundo rascunho, e a mesma chave com conteúdo diferente responde 409. Sem o cabeçalho, nada muda
para quem já integra.

Contribuição de @hiro-nikaitou (#1704).
