---
impacto: nada_mudou
secao: corrigido
titulo: Agentes com NVIDIA aguentam o limite de requisições sem desistir
---

O tier gratuito da NVIDIA aceita só 40 requisições por minuto por modelo, e uma
rajada de mensagens estourando esse limite fazia o agente desistir em ~6
segundos e nunca responder no WhatsApp — a tela de Execuções mostrava
"Não conseguimos classificar esta falha" para um 429 comum de limite de uso.
Agora duas coisas: a tela reconhece esse erro corretamente como limite de uso,
e o agente tenta por mais tempo (até a janela de um minuto da NVIDIA passar)
antes de desistir de vez.
