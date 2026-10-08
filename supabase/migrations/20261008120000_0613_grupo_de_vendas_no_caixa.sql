-- manifest: **O grupo de vendas do WhatsApp lança no caixa.** Um grupo ligado em Conexões › Grupos pode ser marcado como "grupo de vendas" (`channel_session_groups.lanca_no_caixa` + a conta em que o dinheiro cai, `conta_do_caixa_id`); cada venda ou gasto escrito nele vira um `financial_entries` pago, com `origin = 'grupo'`. O CHECK de `origin` ganha `'grupo'` (drop + add do `financial_entries_origin_check`, que só AMPLIA o vocabulário: toda linha existente continua válida). A idempotência é do schema, não do consumidor: `source_message_id` + `source_line` com índice único parcial — o replay do `event_log`, ou dois workers na mesma mensagem, não lançam duas vezes a mesma linha. `source_message_id` é `on delete set null`: a anonimização LGPD que apaga a mensagem não apaga o dinheiro que já entrou (cascata fantasma é anti-pattern nº 7). Idempotente: `add column if not exists`, `create unique index if not exists`, e o CHECK refeito dentro de `do $$` só quando ainda não conhece `'grupo'`.

alter table public.channel_session_groups
  add column if not exists lanca_no_caixa boolean not null default false;
alter table public.channel_session_groups
  add column if not exists conta_do_caixa_id uuid references public.financial_accounts(id) on delete set null;

comment on column public.channel_session_groups.lanca_no_caixa is
  'Grupo de vendas: cada venda/gasto escrito no grupo vira lançamento pago em conta_do_caixa_id (lib/financeiro/grupo-de-vendas.ts). Só vale com enabled = true.';

alter table public.financial_entries
  add column if not exists source_message_id uuid references public.messages(id) on delete set null;
alter table public.financial_entries
  add column if not exists source_line integer;

create unique index if not exists financial_entries_da_linha_do_grupo
  on public.financial_entries (organization_id, source_message_id, source_line)
  where source_message_id is not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.financial_entries'::regclass
       and conname = 'financial_entries_origin_check'
       and pg_get_constraintdef(oid) not like '%grupo%'
  ) then
    alter table public.financial_entries drop constraint financial_entries_origin_check;
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.financial_entries'::regclass
       and conname = 'financial_entries_origin_check'
  ) then
    alter table public.financial_entries
      add constraint financial_entries_origin_check
      check (origin in ('manual', 'sale', 'reversal', 'recurring', 'grupo'));
  end if;
end $$;
