---
impacto: capacidade_nova
secao: adicionado
titulo: Modo Orquestra — Visão geral do dono e Mundo dos agentes, com dados reais
---
Um perfil de interface novo, **Orquestra (visão do dono)**, em Configurações ›
Organização › Interface (e no convite de cada pessoa). Ele deixa no menu só o
que o dono de uma loja usa — Visão geral, Mundo dos agentes, Inbox, Funis,
Produtos, Agentes, Conexões e Faturamento —, num menu plano, e abre o app na
Visão geral.

- **Visão geral** (`/app/orquestra`): as entradas no caixa do período (hoje, 7
  dias, mês) em curva, o resultado (entradas − saídas), quantas conversas
  esperam a equipe (a mesma conta da Fila do Inbox), quantas passaram para uma
  pessoa hoje, cada agente de IA com os atendimentos do dia e a última ação, o
  funil padrão, o que está conectado e a miniatura do Mundo.
- **Mundo dos agentes** (`/app/orquestra/mundo`): a operação desenhada como um
  escritório em pixel art. Cada personagem é um dado: os agentes de IA no
  Atendimento (com a última ferramenta que usaram), a Equipe com a fila, o Caixa
  com os lançamentos do dia e o Painel com os atendimentos de IA. Um diário
  lista o que os agentes fizeram hoje.
- **A rotina dos agentes**: quem tem trabalho fica na mesa digitando; quem abriu
  pedido de ajuda levanta a mão; pausado cochila no sofá da **Copa**; fora do ar
  (desativado ou sem versão publicada) descansa lendo na copa, com a placa "FORA
  DO AR" na mesa. Livre, o agente vai tomar café, beber água, sentar no sofá, se
  alongar, regar as plantas ou jogar ping-pong com outro livre — e o painel diz
  que isso é o que ele faz enquanto está livre. Os agentes andam pelas portas e
  corredores, sem atravessar parede.
- **O escritório de cada organização**: móveis, mesas, nome e piso das salas e o
  visual dos agentes vêm de `organizations.settings.escritorio` (sem nada salvo,
  o escritório padrão). Quem monta é o editor do FBhub; um valor que o desenho não
  reconhece é descartado, nunca quebra a tela.
- **Comandar pelo Mundo**: clicar num agente abre a mesa dele. Quem administra
  pausa e retoma o automático do agente (e tem o botão **Pausar todos**, com
  confirmação, para calar todos de uma vez). Quem atende vê os
  **pedidos de ajuda** que o agente abriu e responde ali mesmo (resolver, pedir
  informação ao cliente ou passar para a equipe), e vê as
  **conversas com este agente**, com
  **Assumir** e **Devolver ao agente**. O balão do agente mostra quando ele
  precisa de você, e um agente pausado aparece pausado. Nenhum comando é novo:
  cada botão usa a mesma ação da tela do agente, da fila de casos e do Inbox.

Tudo lido pelo cliente da sessão: cada papel vê o que já via. O que cada agente
fez (as ferramentas usadas) vem da auditoria e aparece para quem administra;
para os demais, o diário mostra os atendimentos.

Nada muda para quem não escolher o perfil: a interface completa continua com o
mesmo menu e a mesma tela inicial, e as duas telas novas ficam só na busca (⌘K).
Sem mudança de schema — o perfil é uma escolha de áreas, que o banco já aceita.
