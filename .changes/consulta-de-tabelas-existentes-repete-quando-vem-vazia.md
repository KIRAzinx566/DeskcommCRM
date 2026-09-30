---
impacto: nada_mudou
secao: corrigido
titulo: A consulta de tabelas existentes do update.sh repete quando vem vazia
---

Acompanha o conserto anterior (a atualização não travar mais achando
isolamento ausente num módulo opcional nunca instalado): numa VPS real, logo
depois de um apply pesado do baseline, a mesma consulta produziu o alarme
falso numa rodada e não na seguinte, com o banco idêntico nas duas — sintoma
de timing na conexão com o pooler, não de lógica errada. A causa exata dentro
do pooler não foi determinada.

Agora, se a consulta vier vazia, o `update.sh` repete uma vez antes de
seguir — mesmo espírito das "passadas" que a aplicação do baseline já usa
para banco que ainda está se acalmando. Quem nunca bate nesta janela não
nota diferença nenhuma.
