-- ============================================================================
-- 0210 — Previsão de receita ponderada por probabilidade de fechamento
--
-- Inspirado no Odoo: cada etapa do funil pode declarar uma probabilidade de
-- fechar (0-100%). O Kanban e o dashboard passam a mostrar, além da soma bruta
-- de `value_cents` por etapa, uma soma PONDERADA — só das etapas que
-- declararam a probabilidade (DIRC letra C: sem valor configurado, a etapa
-- entra no bruto e fica de fora do ponderado, em vez de inventar um número).
--
-- `is_won`/`is_lost` não gravam 100/0 aqui — o cálculo (`lib/kanban/
-- previsao.ts`) já trata as duas como 100%/0% fixo, independente do que a
-- coluna tiver. A coluna serve só às etapas abertas.
-- ============================================================================

alter table public.crm_stages
  add column if not exists win_probability numeric(5,2)
  check (win_probability is null or win_probability between 0 and 100);

comment on column public.crm_stages.win_probability is
  'Probabilidade de fechar (0-100), configurada pelo dono do funil para etapas abertas. NULL = etapa fora do cálculo ponderado (lib/kanban/previsao.ts). is_won/is_lost usam 100/0 fixo, ignorando esta coluna.';
