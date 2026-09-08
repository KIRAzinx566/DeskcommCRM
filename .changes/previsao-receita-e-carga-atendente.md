---
impacto: capacidade_nova
secao: adicionado
titulo: Previsão de receita ponderada e carga atual do atendente
---

Duas visões novas em **Métricas** (manager+):

- **Previsão**: cada etapa aberta do funil pode ganhar uma probabilidade de
  fechar (%), configurada em **Configurações › Funis › Etapas**. Com isso, o
  Kanban mostra — ao lado do total bruto de cada coluna — o valor previsto
  ponderado por essa probabilidade, e a nova aba "Previsão" no dashboard soma
  tudo por funil e por etapa. Etapa sem probabilidade configurada continua
  entrando no total bruto, só fica de fora do ponderado.
- **Em atendimento agora**: a tabela de performance por atendente ganhou uma
  coluna mostrando quantas conversas cada um tem abertas neste momento contra
  o teto configurado (`capacidade`) — o mesmo limite que o roteamento
  automático já respeitava por baixo dos panos, agora visível.
