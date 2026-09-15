---
impacto: nada_mudou
secao: corrigido
titulo: Um tropeço de rede no Supabase parava de vez o cron de atualização, e só um restart destravava
---

`/api/v1/system/agent` (o heartbeat que a tela de atualização usa, a cada 5 minutos) passou a errar "Gateway Timeout" em toda chamada, mesmo bem depois de o problema de rede que causou o primeiro erro já ter passado — e continuava errando até o contêiner do app ser reiniciado.

A causa: `createAdminClient()` guardava o client do Supabase num cache de módulo, criado uma vez só e reusado para sempre no processo. Uma chamada que tropeçasse numa rede ruim deixava esse client preso num estado interno que nunca mais se recuperava sozinho — enquanto um `fetch()` direto, sem client guardado (como o do healthcheck), continuava respondendo normalmente o tempo todo, o que mostrava que o problema não era a rede nem o processo, era o client cacheado.

Não guardar mais o client custa nada de desempenho de verdade (é só um envelope leve sobre `fetch`, sem handshake nem pool próprio) e evita a classe inteira do problema: cada chamada agora recebe um client novo, então um tropeço num deles nunca mais contamina os seguintes. Afeta toda rota que faz operação administrativa — crons, webhooks, workers — não só o heartbeat de atualização.
