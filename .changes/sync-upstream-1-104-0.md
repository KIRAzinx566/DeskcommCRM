---
impacto: exige_acao
secao: adicionado
titulo: Chegam as novidades do upstream 1.100.0 a 1.104.0
---

Destaques: número oficial do WhatsApp conectado com um clique; lembrete da agenda por modelo aprovado mesmo com a janela de 24 h fechada; nota de voz também no número oficial; Cold Call para ligar para uma lista de leads; servidores MCP por agente; skills e visão de foto escolhidas por agente; pausa entre uma resposta da IA e a próxima; o atendente vê as conversas do próprio setor; a IA e as automações escolhem o setor; tarefas em quadro; campos do funil reordenados por arraste ou setas e com mais de uma condição; reserva de lugar com capacidade em pessoas e lista de espera da agenda; ação "Tirar tag"; vários telefones na ficha do contato; duplicados pelo CPF. A lista completa está nas seções 1.100.0 a 1.104.0 deste arquivo.

No fork, a personalidade e o endereço próprio do agente continuam travados na versão publicada, e o canal direto do aviso de caso continua valendo junto com o aviso a membro da equipe (migrations 7004 e 7005). O editor de campos do funil passa a usar a ordenação do upstream (arraste e setas) e mantém o Preview ao lado.

## Requer atenção

**Contato do tipo Fornecedor sai do rodízio automático.** Fornecedor não recebe mais atendente pelo rodízio.

**Condição de regra sobre as colunas de CPF responde só se estão preenchidas.** Regra que comparava o valor do CPF com outro operador deixa de casar; troque por "está preenchido" / "está vazio".

**A API de contatos diz só se há CPF.** As respostas trazem se o contato tem CPF, não o número. Integração ou modelo de mensagem que lia o CPF pela API precisa de outro caminho.
