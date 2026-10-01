---
impacto: nada_mudou
secao: corrigido
titulo: A exportação de dados do titular (LGPD) passa a incluir a memória e os registros da IA sobre ele
---

O direito de acesso entregava conversas, leads, atividades e a ficha do titular, mas não três fontes que a cascata de anonimização já limpa a pedido dele: as notas de memória da IA (`lead_notes`), os argumentos passados às ferramentas (`ai_agent_runs.tool_calls`) e a próxima ação e a qualificação do funil (`lead_state`). O que se apaga a pedido do titular agora é, também, o que se entrega a pedido dele.

A exportação coleta as três, filtradas por organização e contato, e as entrega no arquivo que o titular recebe (`data.json`), com a qualificação íntegra e, de cada execução da IA, o nome e os argumentos de cada ferramenta. O resultado das ferramentas e o texto intermediário do modelo ficam de fora, para não vazar dado de terceiros que o agente tenha consultado.

Quem já usa o produto recebe o relatório mais completo sem precisar fazer nada na instalação.
