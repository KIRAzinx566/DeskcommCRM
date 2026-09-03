---
impacto: nada_mudou
secao: corrigido
titulo: Indexar/buscar material e ouvir áudio mostravam o modelo errado no painel de Provedores
---

Os cards de "Indexar o seu material", "Buscar no seu material" e "Ouvir o
áudio do cliente" — os três marcados como fixos, sem seletor — mostravam
"usando o padrão da organização" com o modelo de conversa da organização
(por exemplo, um modelo da Anthropic). Isso nunca foi verdade: os três
sempre bateram na OpenAI, hardcoded no código, indiferente ao que a
organização tem configurado — é assim desde o início, porque embedding e
transcrição não seguem o mesmo catálogo dos modelos de conversa. Quem
olhasse o painel para diagnosticar por que a busca no material não estava
funcionando via uma informação que não correspondia à realidade. Agora os
três mostram o modelo que de fato usam.
