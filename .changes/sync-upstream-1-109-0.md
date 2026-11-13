---
impacto: exige_acao
secao: adicionado
titulo: Chegam as novidades do upstream 1.105.0 a 1.109.0
---

Destaques: reações e exportar a conversa em PDF no Inbox; vários anexos de uma vez e anexos até 50 MB; o agente passa a conversa para outro agente do mesmo número e cada agente pode ter a própria voz; o agente pode não atender em feriado nacional; cada número pode esperar a IA qualificar antes de distribuir; leads dos formulários de anúncio da Meta entram no funil; o negócio mostra as conversas de todos os números do cliente e abre em página inteira; Agenda em Quadro por profissional e painel do dia; lembrete da reunião com o link do Meet; automação que move para perda com motivo e que não repete para o mesmo contato; follow-up com mais de uma redação; módulos opcionais de link de pagamento, Ouvidoria e Status do WhatsApp. A lista completa está nas seções 1.105.0 a 1.109.0 deste arquivo.

No fork, as tarefas do negócio continuam logo abaixo da conversa no dossiê, o erro do teste do agente continua aparecendo no painel de teste e o limite de pedidos do servidor MCP continua mandando `Retry-After` junto do `X-Request-Id` novo.

## Requer atenção

**Salvar outra configuração da instalação não reabre mais o cadastro fechado por `SIGNUP_MODE`.** Se o cadastro foi fechado pelo ambiente, ele continua fechado.

**O follow-up automático escolhe o agente pelo número da conversa.** Quem tem mais de um agente em números diferentes passa a ver o follow-up sair pelo agente do número em que a conversa está.
