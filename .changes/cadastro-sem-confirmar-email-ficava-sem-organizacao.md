---
impacto: nada_mudou
secao: corrigido
titulo: Cadastro sem clicar no e-mail de confirmação deixava a pessoa presa sem organização
---

Quem criava conta e, por qualquer motivo, nunca chegava a clicar no link de
confirmação de e-mail — provedor de auth configurado sem exigir confirmação,
ou o próprio e-mail de confirmação mal configurado — conseguia logar
normalmente, mas ficava para sempre numa tela dizendo "você não tem nenhuma
organização ativa, aceite um convite ou contate o admin". Não havia nada que
essa pessoa pudesse fazer sozinha: a organização só nascia no momento exato
do clique naquele link, e sem ele, nunca nascia.

Agora, ao entrar pela primeira vez sem organização nenhuma, o sistema tenta
provisionar ali mesmo — com o mesmo nome de empresa que a pessoa digitou no
cadastro. Quem foi convidado para uma organização que já existe continua
sendo direcionado para o convite, normalmente: essa rede de segurança nunca
cria uma organização nova para quem tinha, na verdade, um convite esperando.
