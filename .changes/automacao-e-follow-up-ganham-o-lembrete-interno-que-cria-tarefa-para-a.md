---
impacto: capacidade_nova
secao: adicionado
titulo: Automação e follow-up ganham o lembrete interno, que cria tarefa para a equipe sem mandar mensagem ao cliente, e os gatilhos por tempo
---

As regras de automação têm uma ação nova, Criar tarefa. Ela aceita título com
o nome do contato e do negócio, prazo em dias, responsável (o dono do negócio
ou uma pessoa escolhida) e prioridade. O responsável recebe o aviso no
navegador, e a tarefa aparece na linha do tempo do negócio. Os fluxos de
follow-up ganham o nó Lembrete interno, que faz o mesmo sem enviar nada ao
cliente. Também ganham a opção Somente interno, que impede a publicação de um
fluxo com qualquer nó que mande mensagem. Há dois gatilhos novos: N dias sem
mensagem (da equipe, do cliente ou de qualquer lado) e N dias na mesma etapa.
Os dois disparam uma vez por episódio, voltam a valer quando chega mensagem
nova ou o card muda de etapa, e podem ser configurados para respeitar um
compromisso marcado na agenda. O aviso de data do funil volta a disparar quando
a data do negócio muda e passa a olhar só negócios abertos. O que já foi
avisado antes da atualização não é avisado de novo. Não é preciso fazer nada
na instalação.

Contribuição de @webtecnica (#1683, fecha #1540).
