---
impacto: nada_mudou
secao: corrigido
titulo: As tabelas de memória da IA ganham a proteção por organização que nunca tiveram
---

As tabelas de memória da organização (`org_memory_entries` e as duas que a sustentam) nunca tiveram a proteção por linha que as demais tabelas do produto têm, e ficavam alcançáveis pela chave pública (`anon key`) que todo self-host expõe no navegador — qualquer um com essa chave lia, escrevia ou apagava a memória de IA de qualquer organização direto pela API do banco, sem passar pelo CRM. Todo acesso legítimo (a tela, o agente de IA, o motor de atendimento) já passava por um caminho privilegiado que filtra a organização corretamente; a falha só abria uma porta que ninguém deveria ter.

Depois desta atualização, a proteção por linha está ligada e a chave pública não alcança mais nenhuma organização. Não é preciso fazer nada: o conserto é automático.
