---
impacto: nada_mudou
secao: corrigido
titulo: Anonimizar um contato passa a apagar também a transcrição de áudio, o texto lido de imagem/documento, as notas do agente, os argumentos de ferramentas da IA, a próxima ação e a identidade social
---

Quando um contato era anonimizado (LGPD), o texto das mensagens virava "[mensagem anonimizada]", mas várias outras fontes que o agente de IA escreve continuavam guardadas e legíveis sobre a pessoa: a transcrição automática dos áudios, o texto lido das imagens e documentos, as notas de memória da IA (`lead_notes`), o registro de execução com os argumentos passados às ferramentas (`ai_agent_runs.tool_calls`), a próxima ação e a qualificação do funil (`lead_state`) e a identidade social do contato (`contacts.social_identity`).

Agora a cascata de anonimização, disparada quando o contato vira anonimizado, redige todas essas fontes na mesma transação. No registro de execução fica só o nome das ferramentas que rodaram, para a trilha do que o agente fez continuar legível; o texto do modelo, os argumentos e os resultados são apagados. A operação é idempotente, então a varredura diária de retenção não reescreve o que já foi limpo, e também limpa os contatos que já tinham sido anonimizados antes desta sincronização.

Não é preciso fazer nada na instalação.
