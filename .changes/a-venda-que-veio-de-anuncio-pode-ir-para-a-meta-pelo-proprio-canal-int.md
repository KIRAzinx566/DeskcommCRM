---
impacto: capacidade_nova
secao: adicionado
titulo: A venda que veio de anúncio pode ir para a Meta pelo próprio canal intermediado, atrás de uma chave que vem desligada
---

Contribuição de @jmpo (#1819).

Quando o número de WhatsApp está conectado por um canal intermediado que já
liga o conjunto de dados da Meta ao número (na tela do próprio provedor), a
venda fechada no CRM — botão Ganhar, arrasto no quadro ou mover em lote —
pode ser reportada por esse canal: o evento `Purchase` sai com o valor, a
moeda, o telefone e o id da conversa, e o provedor completa o vínculo com o
clique do anúncio.

**Vem desligado.** Nada muda na atualização: o envio só acontece depois que um
administrador liga **Enviar vendas pelo canal da conversa** em Configurações ›
Conversões. Com a chave desligada, nenhum dado da venda sai para o provedor e
a venda segue na pendência "sem conexão" de sempre.

Com a chave ligada, o canal só entra quando a organização não tem conexão
direta com a Meta; quem já configurou a conexão direta segue por ela. A venda
sai por um caminho só, e a resposta do canal é lida por inteiro — um evento
recusado dentro de uma resposta de sucesso aparece como recusa na tela de
conversões, não como enviado.
