---
impacto: capacidade_nova
secao: adicionado
titulo: Sistema de cobrança — boleto, Pix e cartão via ASAAS
---

O CRM agora gera cobranças de verdade. Cada organização conecta a própria
conta ASAAS (sandbox ou produção) em **Configurações › Credenciais de pagamento**
— o dinheiro cai direto na conta dela, nunca passa pela DeskcommCRM. A partir
daí:

- Pela tela, em **Cobranças**: gerar boleto/Pix/cartão manualmente, ver o
  status de cada cobrança e o link/código para o cliente pagar.
- Pelo agente de IA (quando as ferramentas de cobrança forem habilitadas no
  pacote "Vender"): `crm_gerar_cobranca`, `crm_consultar_cobranca`,
  `crm_listar_cobrancas` e `crm_cancelar_cobranca` — a IA pode gerar e
  acompanhar cobrança durante o atendimento, sempre com o CPF/CNPJ confirmado
  com o cliente antes.
- Confirmação de pagamento chega por webhook da ASAAS e atualiza o status
  automaticamente, com uma linha na timeline do negócio ("Pagamento
  confirmado").

Nenhum dado de cartão passa pela DeskcommCRM — cartão é sempre um link de
checkout hospedado pela própria ASAAS.
