---
impacto: nada_mudou
secao: corrigido
titulo: Voltar da autorização do Google não pede login de novo
---

Ao conectar o Google Agenda, o navegador voltava e caía na tela de login — o que
se lia como "o sistema me deslogou". A sessão nunca foi encerrada: o navegador é
que, por segurança, não apresenta a credencial numa página aberta a partir de
outro site, e a volta do Google era exatamente isso. Agora o retorno passa por
uma página intermediária do próprio sistema, e a pessoa cai direto na Agenda,
ainda conectada. Quem já usava não precisa fazer nada.
