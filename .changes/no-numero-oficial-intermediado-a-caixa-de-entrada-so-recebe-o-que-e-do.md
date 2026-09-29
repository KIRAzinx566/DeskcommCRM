---
impacto: nada_mudou
secao: corrigido
titulo: No número oficial intermediado, a caixa de entrada só recebe o que é do próprio número
---

O aviso que o provedor intermediado manda ao CRM é por espaço de trabalho, não
por número: quem tinha mais de uma conta no mesmo espaço (outro número, ou as
redes de outro negócio) via na conversa de um número mensagens enviadas por
outro. Agora o evento que traz a conta de outro número é ignorado e fica no
arquivo de webhooks como "evento de outra conta"; o evento sem conta (como o
aviso de queda do número) continua valendo.

Contribuição de @jmpo (#1821).
