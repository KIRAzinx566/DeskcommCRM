---
impacto: capacidade_nova
secao: adicionado
titulo: Automações ganharam "Testar antes de ligar" e "Retomar do que falhou"
---

Em Configurações › Webhooks › Automações, o editor de regra agora tem um
botão "Testar": escolha um evento recente do mesmo gatilho e veja o que a
regra FARIA — nenhuma ação roda de verdade, nada é gravado. Serve para
revisar uma regra antes de ligá-la.

Na aba Atividade, o botão que reenviava uma automação com falha agora se
chama "Retomar" e funciona pra qualquer tipo de ação (antes só funcionava
para "Avisar outro sistema"), e retoma só o que realmente falhou ou foi
pulado — o que já tinha dado certo continua valendo, em vez de rodar tudo
de novo.
