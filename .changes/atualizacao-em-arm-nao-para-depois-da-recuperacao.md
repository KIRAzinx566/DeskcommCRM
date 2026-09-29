---
impacto: nada_mudou
secao: corrigido
titulo: Numa VPS ARM, a atualização não para mais logo depois de construir as imagens localmente
---

Quem já tinha o DeskcommCRM rodando numa VPS de arquitetura ARM (aarch64/arm64) e atualizava recebia a mensagem de que as imagens foram construídas localmente com sucesso, mas a atualização terminava com erro logo em seguida — o passo seguinte voltava a procurar a imagem publicada (que não existe para essa arquitetura) em vez de usar a que acabou de ser construída. Agora, depois que a construção local funciona, todo o resto da atualização (recriar os serviços e checar a saúde do app) continua usando as imagens construídas ali.

Não há ação para quem opera a VPS — quem estiver numa VPS x86_64/amd64 (a esmagadora maioria) não é afetado.
