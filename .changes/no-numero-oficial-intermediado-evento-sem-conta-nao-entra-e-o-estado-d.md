---
impacto: nada_mudou
secao: corrigido
titulo: No número oficial intermediado, evento sem conta não entra e o estado do número só vale para o próprio número
---

Evento de mensagem ou de modelo que chega sem a conta de origem passa a ser
ignorado e fica no arquivo de webhooks, em vez de entrar na caixa de entrada.
Aviso de estado de número (suspenso, liberado, reativado) só muda o canal
quando o número do aviso é o número deste canal; se não houver como comparar,
o aviso fica registrado sem mudar o estado do canal. A tela de conexão passa a
orientar o preenchimento do filtro de contas na inscrição do webhook no
provedor.

Contribuição de @jmpo (#1821, completado no #1823).
