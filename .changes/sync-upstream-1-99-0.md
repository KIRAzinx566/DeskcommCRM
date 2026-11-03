---
impacto: exige_acao
secao: adicionado
titulo: Chegam as novidades do upstream 1.93.0 a 1.99.0
---

Destaques: o agente responde por nota de voz; dois agentes no mesmo número divididos por etiqueta e funil; aviso de aniversário e mensagem de manutenção com dias marcados; Memória da IA com aprendizado que vence; conversas da queda do número voltam sozinhas; sair da etapa cancela o follow-up pendente; regras e follow-ups sabem quando o contato tem horário marcado; aviso de caso para o responsável do atendimento e pelo número oficial com modelo aprovado; setor de atendimento com horário próprio; Desempenho separa venda única de recorrência nova; cards compactos no quadro; CNPJ alfanumérico; Supabase próprio no mesmo servidor sobrevive às atualizações. A lista completa está nas seções 1.93.0 a 1.99.0 deste arquivo.

No fork, a personalidade do agente e o canal direto do aviso de caso continuam valendo junto com as novidades (migrations 7001 e 7002).

## Requer atenção

**Campos de lista passam a recusar valor fora das opções.** Quem grava pela API ou pelo agente de IA num campo "Lista de uma escolha", "Lista de várias escolhas" ou "Lista pesquisável" (sem "permitir valor novo") um valor que não está nas opções do funil recebe `custom_field_value_not_in_list`, e nada é gravado. Antes de atualizar, cadastre no funil as opções que faltam ou ajuste a integração. Formulários de captação não são afetados.

**Contas do financeiro gravam sempre na moeda da organização.** `POST`/`PATCH /api/v1/financeiro/catalogo/contas` passa a ignorar `currency`. Só afeta integração que criava conta em outra moeda.
