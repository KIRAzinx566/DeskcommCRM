---
impacto: capacidade_nova
secao: adicionado
titulo: O canal oficial pode apontar para um servidor de testes próprio
---

Quem opera a instalação pode, pela primeira vez, mandar o canal oficial do
WhatsApp falar com um servidor diferente do da Meta, definindo
`META_GRAPH_BASE_URL` no ambiente. Sem essa variável, nada muda: o sistema
continua enviando, validando credenciais, baixando mídia, sincronizando modelos
e registrando webhook exatamente para onde mandava.

O que se abre com ela é a PROVA EM TELA do canal oficial. Até aqui não havia
para onde a instalação falar durante um teste de ponta a ponta, porque o endereço
do provedor estava escrito dentro do código, em onze lugares: a jornada de
conectar e enviar era coberta só por testes de unidade, que provam a lógica e
não a conversa de verdade com o outro lado. Com a variável apontando para um
servidor local, a mesma jornada passa a poder ser exercitada na tela, contra um
destino que responde. A conta de anúncios tem a sua própria variável,
`META_ADS_GRAPH_BASE_URL`, justamente para que apontar o canal para o servidor de
testes não leve junto o relatório de conversão.

Dois cuidados escritos na própria configuração: o endereço precisa ser uma base
`http://` ou `https://` de verdade (endereço colado sem esquema, `ftp://`,
`file://` ou caminho relativo é recusado, com aviso no log, e a instalação volta
a falar com o endereço de sempre), e ele é decisão da instalação inteira — não
existe campo na tela nem valor por organização, porque destino de chamada
definido por tenant mandaria o token de uma empresa por um servidor escolhido
pela outra.

Crédito: @webtecnica (#817).

Contribuição de @webtecnica (#1787, issue #817).
