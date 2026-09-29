---
impacto: nada_mudou
secao: corrigido
titulo: Host da Graph em `http` externo deixa de ser aceito em produção
---

`META_GRAPH_BASE_URL` e `META_ADS_GRAPH_BASE_URL` aceitavam `http://` em qualquer
ambiente. Em produção o token da Meta viaja no cabeçalho de toda chamada, e um
endereço externo em `http` o mandaria em texto claro por todo o caminho.

Agora, em produção, `http://` só passa para destino que não sai da máquina:
loopback (`127.0.0.0/8`, `::1`), faixas privadas (RFC 1918), ULA e link-local do
IPv6, `localhost` e nome de serviço sem ponto. Fora daí o valor cai no host real,
com o mesmo aviso de antes. Fora de produção nada mudou, e o receptor local da
prova em tela continua aceito — é para isso que ele existe.

Contribuição de @hiro-nikaitou (#1791, issue #1788).
