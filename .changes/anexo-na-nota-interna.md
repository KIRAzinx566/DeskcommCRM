---
impacto: capacidade_nova
secao: adicionado
titulo: Anexo de imagem, arquivo, áudio ou vídeo dentro de nota interna
---

A nota interna de conversa passa a aceitar anexo. Quem escreve nota pode anexar imagem, documento, áudio ou vídeo, e o anexo aparece na própria nota como apoio para o time. Documento aparece como cartão com o tipo e o tamanho do arquivo; o nome original do arquivo não é guardado.

O arquivo não sai da empresa: ele fica num espaço de armazenamento próprio (`internal-media`), separado da mídia de conversa, e **nunca vai para o cliente no WhatsApp**. Ele também fica fora da retenção por idade da mídia de conversa (a que a empresa configura): enquanto a nota existir, o anexo continua lá.

Para quem lê a nota, o anexo abre por um endereço temporário (60 segundos) e só se a pessoa puder ver a conversa daquela nota — a mesma regra de permissão que a própria nota já tinha, sem permissão nova.

**Limpeza**: quando uma nota com anexo é apagada, a rotina diária de limpeza remove o arquivo dela depois de 1 dia. Quando um contato pede exclusão de dados (LGPD), o texto das notas das conversas dele é redigido e o anexo vai para a fila de remoção. A exportação de dados do titular passa a listar as notas internas, com os dados do anexo (tipo, tamanho e caminho), sem o arquivo em si.

**Para quem opera a VPS**: anexo de nota que continua existindo **não expira** e ocupa o armazenamento da instalação (o mesmo espaço da mídia do WhatsApp). Cada anexo pode ter até 50 MB.

**Sem mudança de comportamento para a nota sem anexo**: ela continua como estava.

Contribuição de @webtecnica (#1883).
