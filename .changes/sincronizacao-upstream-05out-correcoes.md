---
impacto: nada_mudou
secao: corrigido
titulo: Quatro buracos que a sincronização com o upstream expôs — imutabilidade de versão, duplicação de agente, cobrança por IA e escrita de support_readonly
---

Esta sincronização com o `melgarafael/DeskcommCRM` trouxe, junto do volume normal de PRs, dois testes novos que medem o schema inteiro em vez de uma lista escrita à mão — e acharam quatro buracos que já existiam no fork, nenhum deles causado por esta sincronização:

- **A trava de imutabilidade de uma versão publicada do agente não cobria `base_url`** (o endereço do endpoint do provider "custom"). Uma versão já publicada podia ter o endpoint trocado pela service key sem virar versão draft nova, sem trilha — o mesmo buraco que a migration 0503 já tinha fechado para outras duas colunas.
- **Duplicar um agente com provider "custom" perdia o endereço do endpoint.** O formulário de duplicação em Configurações › Agentes gravava a versão nova sem `base_url`, e o clone saía apontando para o endpoint padrão (ou sem nenhum), não para o que a origem usava.
- **O agente de IA não conseguia gerar nem cancelar cobrança durante uma conversa.** A ponte que confere o dono de cada identificador numa escrita do turno (`lib/ai/runtime/escopo-das-escritas.ts`) não tinha entrada para `crm_gerar_cobranca`/`crm_cancelar_cobranca` — sem entrada, a ponte recusa a ferramenta inteira com "esta ação não está disponível durante uma conversa", então as duas ficavam inacessíveis para o agente dentro do atendimento (continuavam funcionando por fora, via MCP direto).
- **Um platform admin `support_readonly` conseguia escrever credencial de gateway de pagamento e cobrança de qualquer organização.** As policies de escrita de `billing_gateway_credentials` e `billing_charges` aceitavam `fn_is_platform_admin()` — a função que não confere o `scope` do JWT — em vez de `fn_is_platform_admin_full()`. Mesma classe de buraco que o upstream já tinha fechado em outras tabelas (#2000/#2115); a leitura não muda.

Os quatro estão corrigidos. Nenhuma ação é necessária na instalação — o `update.sh` aplica as migrations novas (0559 e 0561 no apêndice do baseline) normalmente.

Esta sincronização também achou uma colisão de número de migration entre o fork e o upstream (os dois escolheram `0504` para migrations diferentes, de forma independente). A migration do upstream (`credencial_de_mapas`) foi renumerada para `0560` no fork — puramente interno, sem efeito de comportamento: o conteúdo é idêntico, só o número do arquivo muda.

Fragmento interno de sincronização, sem crédito de contribuidor externo — os três defeitos já existiam no fork antes desta rodada.
