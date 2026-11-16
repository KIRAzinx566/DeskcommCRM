---
impacto: exige_acao
secao: adicionado
titulo: Chegam as novidades do upstream 1.110.0 a 1.113.0
---

Destaques: pesquisa de satisfação ao encerrar o atendimento, com o resultado na tela; o agente de voz consulta e marca horários na agenda durante a ligação; a IA pode alterar dados no sistema externo, ferramenta por ferramenta; mensagem agendada na conversa; Telegram como canal opcional; a prospecção leva imagem, vídeo ou PDF na primeira abordagem, não volta a abordar quem disse "não tenho interesse" e baixa a lista da campanha; exportar e importar funis; categorias de perda por funil; tarefas com farol de prazo; plano de cobrança em dólar ou euro para quem revende; o Testar do agente vira conversa. A lista completa está nas seções 1.110.0 a 1.113.0 deste arquivo.

No fork, a pesquisa de satisfação própria (CSAT pelo `event_log`, em Configurações › Empresa e na aba CSAT de Métricas) dá lugar à do upstream, em Configurações › Atendimento. Quem usou a do fork nos últimos 90 dias fica com a nova ligada, com a pergunta personalizada se havia uma, e as notas antigas vão para o histórico novo (migration 7008). A personalidade e o endereço próprio do agente continuam travados na versão publicada (migration 7007).

## Requer atenção

**A pesquisa de satisfação mudou de lugar.** Agora fica em Configurações › Atendimento, e vem desligada para quem não usava a antiga. As notas antigas aparecem no resultado novo.

**Transferir a conversa leva o negócio aberto e devolve a conversa ao número em que o cliente falou.**

**Follow-up por nicho passa a casar também com a etiqueta que está no contato.** Pode disparar para mais contatos do que antes.
