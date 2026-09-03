---
impacto: nada_mudou
secao: corrigido
titulo: Agente em provider "API customizada" não conseguia ter um modelo escolhido
---

O seletor de modelo do editor de agente (`ModelPicker`) só sabia ser uma
lista — quando o catálogo do provedor vinha vazio, mostrava um único item
"Nenhum modelo disponível" desabilitado, sem nenhuma forma de digitar um
identificador. Para os cinco provedores antigos isso raramente aparecia (o
catálogo vem semeado ou chega por sincronização diária), mas o provider "API
customizada" NUNCA tem catálogo — não existe uma lista universal de modelos
para um endpoint que o operador escolheu. Resultado: um agente configurado
em "API customizada" ficava com o campo de modelo permanentemente vazio e
travado, e o formulário — que exige o modelo preenchido para salvar — nunca
conseguia ser salvo. Agora, sem catálogo, o campo vira texto livre (mesmo
comportamento que o painel de Provedores já tinha).
