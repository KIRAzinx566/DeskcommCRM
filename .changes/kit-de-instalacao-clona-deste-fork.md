---
impacto: nada_mudou
secao: corrigido
titulo: O kit de instalação passa a clonar o código deste fork, não o do upstream
---

`install.sh`, `comecar.sh`, `_common.sh` e os labels de procedência dos quatro Dockerfiles apontavam para `github.com/melgarafael/DeskcommCRM` mesmo neste fork já publicando as próprias imagens em `ghcr.io/kirazinx566` — desde antes desta sincronização. Quem instalasse por este kit clonava o repositório do upstream: código diferente do que as imagens publicadas por este fork esperam, um jeito silencioso de a instalação divergir da imagem que ela vai rodar.

Agora os quatro arquivos apontam para este repositório, com a mesma casinha que o GHCR já exige em minúsculas.

Ninguém precisa fazer nada: quem já instalou não reclona nada na atualização — o `update.sh` só troca a imagem. O efeito é só para quem instalar do zero por este kit a partir de agora.
