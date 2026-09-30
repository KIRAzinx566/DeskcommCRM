---
impacto: nada_mudou
secao: corrigido
titulo: A atualização não trava mais achando isolamento ausente num módulo opcional que ninguém instalou
---

Desde o primeiro módulo oficial via ADR-0002 (Honorários, migration 0480), o
`create table`/`create policy` das tabelas do módulo mora dentro do corpo de
uma função provisionadora — aplicar o baseline cria a função, nunca executa o
corpo. A tabela só nasce quando um administrador da instalação liga o módulo.

A conferência de regras de isolamento do `update.sh` não sabia disso: tratava
"o arquivo menciona uma regra para esta tabela" como "a regra deveria existir",
mesmo quando a tabela nunca chegou a existir por o módulo nunca ter sido
instalado. Quem atualizasse para uma versão que trouxesse um módulo novo (sem
tê-lo instalado, que é o padrão) via a atualização parar com "REGRAS DE
ISOLAMENTO AUSENTES" e o CRM ficar fora do ar por engano.

Agora a conferência só espera a regra de uma tabela que existe de verdade no
banco. Quem já instala módulos oficiais, ou nunca instalou nenhum, não nota
diferença nenhuma — é o caminho comum que volta a funcionar.
