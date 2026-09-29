---
impacto: capacidade_nova
secao: adicionado
titulo: Perguntar ao acervo direto da conversa, e a busca do atendente ganha gráfico próprio em Evolução
---

Quem atende ganha, no painel ao lado da conversa, uma caixa "Acervo" para perguntar sobre o material da própria empresa (as fontes que a IA usa nas respostas). A resposta traz os trechos que passaram no limiar, com a semelhança de cada um, e separa três situações que antes chegavam iguais: o acervo está vazio, a base não tem essa informação, ou há algo parecido abaixo do limiar. É a mesma busca e o mesmo limiar que a IA usa; não existe uma segunda régua para a tela.

Cada pergunta gasta uma chamada de embedding na chave da organização, então a caixa tem limite de 12 perguntas por pessoa e 60 por organização a cada minuto, e a pergunta vai até 1000 caracteres. Sem chave de embedding cadastrada, a caixa diz isso e aponta Credenciais.

A pergunta do atendente passa a ser registrada, e a tela de Evolução a mostra num gráfico próprio, "Consultas da equipe ao acervo". Ela não entra nos números do agente nem nas "perguntas de clientes sem resposta". Não há ação para quem opera a VPS: a migração é aditiva e roda sozinha na atualização.

Contribuição de @webtecnica (#1877).
