---
impacto: capacidade_nova
secao: adicionado
titulo: O Jev passa a perceber quando o cliente pede para falar com uma pessoa ou para parar de receber mensagens, e pode avisar a equipe na Central
---

O Jev ganha duas tarefas: **Perceber pedido para falar com uma pessoa** e **Perceber pedido para parar de receber mensagens**. Hoje quem percebe esses pedidos é uma regra sem IA: ela passa a conversa a uma pessoa quando o cliente escreve "quero falar com um atendente" (ou uma das palavras de passagem do agente) e bloqueia o contato quando ele manda "PARAR". Ela é precisa, mas estreita: "quero falar com alguém de verdade, não com robô" passa por ela sem ser visto.

O Jev só é perguntado **onde a regra de hoje disse não** — a mensagem que ela já pegou nem sai para a TypeSafe, e a regra olha todas as mensagens do cliente ainda sem resposta, como o atendimento automático olha. Pedido mandado por áudio não é perguntado. As duas tarefas **começam só observando**: o cartão do Jev, em IA › Provedores, mostra em quantas mensagens o Jev percebeu um pedido que a regra de hoje não reconheceu, com links para as conversas. Em nenhum estado o Jev passa a conversa, bloqueia alguém, cala o agente ou responde o cliente: quem passa a conversa continua sendo a regra de hoje ou uma pessoa, e quem bloqueia o contato é só a regra de hoje, quando o próprio cliente manda "PARAR".

Quando quiser, clique em **"Avisar a equipe"** na tarefa. A partir daí, cada pedido que o Jev perceber abre um aviso na Central de avisos, um por conversa, com o botão "Abrir a conversa". O aviso não repete o que o cliente escreveu — a mensagem fica na conversa, para quem pode vê-la.

Quem já tem o Jev ligado vê as duas tarefas com o selo "Nova", já observando — isso é uma chamada a mais ao Jev por mensagem em que a regra de hoje não viu algum dos pedidos (uma fração de centavo de dólar, cobrada na sua conta da TypeSafe). Para não usar, clique em "Pausar esta tarefa" no cartão. Nada precisa ser editado para atualizar.
