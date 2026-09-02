---
impacto: capacidade_nova
secao: adicionado
titulo: Novo provedor de IA "API customizada" — qualquer endpoint compatível com OpenAI
---

Até aqui, os únicos provedores disponíveis (em IA › Provedores e em cada
agente) eram Anthropic, OpenAI, Google, OpenRouter e NVIDIA — todos com
endpoint fixo. Quem queria usar Groq, Together, Cerebras, um gateway próprio
ou um modelo rodando na própria máquina não tinha como, mesmo o serviço
falando a mesma API da OpenAI.

Agora existe a opção "API customizada (compatível com OpenAI)", que aceita
qualquer endereço `https://` escolhido por quem administra. O endereço é
obrigatório (não existe um padrão para cair sozinho) e pode ser configurado
tanto no painel de Provedores (para os pontos auxiliares) quanto na própria
versão do agente — inclusive para o ponto que responde o cliente no
WhatsApp, que antes só herdava o endpoint fixo de um dos cinco provedores
prontos.
