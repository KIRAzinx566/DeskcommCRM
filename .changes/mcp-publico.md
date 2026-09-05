---
impacto: capacidade_nova
secao: adicionado
titulo: MCP agora pode ser conectado por clientes externos, com limite de uso próprio
---

Em Configurações › Conectar MCP, qualquer administrador encontra o endereço
do servidor MCP e um botão para criar um token já com os escopos certos —
para conectar Claude Desktop, Cursor ou qualquer outro cliente MCP direto ao
CRM. O mecanismo já existia (o mesmo usado pelos agentes de IA internos);
faltava só a tela.

De quebra, a rota `/api/mcp` ganhou limite de 60 chamadas por minuto por
token — antes não tinha proteção nenhuma contra abuso.
