/**
 * Vocabulário do vínculo de cobrança em `crm_lead_links` — molde de
 * `lib/agenda/tipos.ts` (`ALVO_DE_VINCULO_DO_AGENDAMENTO`/`VINCULO_DE_AGENDAMENTO`).
 *
 * `target_kind`/`link_kind` são colunas SEM CHECK (vocabulário aberto — uma
 * constraint ali quebraria o `update.sh` de um clone com vínculo legado). O
 * que prende o vocabulário são estas constantes: quem grava o vínculo usa
 * daqui, nunca a string solta.
 */
export const ALVO_DE_VINCULO_DA_COBRANCA = "billing_charge" as const;
export const VINCULO_DE_COBRANCA = "charged" as const;
