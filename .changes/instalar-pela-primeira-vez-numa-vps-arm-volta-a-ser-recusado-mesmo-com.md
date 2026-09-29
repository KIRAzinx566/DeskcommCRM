---
impacto: nada_mudou
secao: corrigido
titulo: Instalar pela primeira vez numa VPS ARM volta a ser recusado, mesmo com o .env já preenchido
---

Se você começou a instalar o DeskcommCRM numa VPS ARM (Oracle Ampere,
aarch64) com o `.env` já preenchido — copiado de outra máquina, gerado por
automação, ou deixado por uma instalação que parou no meio —, o `install.sh`
não recusava como devia: confundia a pasta com uma instalação que já estava no
ar e passava 15 a 25 minutos construindo as imagens na própria VPS. Agora ele
recusa logo no começo e orienta a usar uma VPS x86_64/amd64.

A instalação passa a ser reconhecida pelo que ela deixou de verdade: os
contêineres do DeskcommCRM (ou do seu Supabase) no Docker, parados ou
rodando, ou o arquivo `.deskcomm-instalado` que o próprio instalador grava
quando termina. Quem já tem o CRM numa VPS ARM continua atualizando
normalmente, com o aviso e o build local de sempre. Para quem instalou antes
desta versão e ainda não tem o arquivo, o `update.sh` desta versão em diante
o grava sempre que termina com o app no ar. Se nessa VPS ARM você derrubou os contêineres
(`docker compose down` sem `-v`) antes de atualizar, suba-os de novo com
`docker compose ... up -d` e rode a atualização.

Se você usa o comando de "recomeçar" (`docker compose down -v && rm -f .env`),
ele passou a apagar esse arquivo junto — ele faz parte do estado da instalação.

Contribuição de @webtecnica (#1783, issue #1778).
