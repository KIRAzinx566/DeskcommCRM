-- ============================================================================
-- 0211 — Tarefa leve por lead ("próxima ação" com prazo), inspirado no Odoo
--
-- Por que uma tabela nova, e não reaproveitar `lead_state.next_action`
-- (só texto sugerido pela IA, sem data, sem dono humano, sem "atrasado") nem
-- `calendar_appointments` (compromisso de AGENDA de verdade — hora marcada,
-- fuso, sincronização Google, pesado demais pra "lembra de ligar até sexta").
-- Esta tabela é deliberadamente mais simples que as duas: um lembrete com
-- prazo, criável por um humano, sem hora marcada.
--
-- FK direta pra crm_leads (não polimórfica como crm_lead_links): só lead usa
-- isto hoje, e polimorfismo sem consumidor é complexidade que ninguém cobra
-- de volta (anti-pattern nº 8 do CLAUDE.md).
-- ============================================================================

create table if not exists public.crm_lead_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,

  type text not null default 'other'
    check (type in ('call', 'whatsapp_message', 'meeting', 'follow_up', 'other')),
  title text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'dismissed')),

  -- Nullable: lead sem dono ainda pode ganhar uma tarefa (alguém do time se
  -- compromete a ligar antes de o negócio ter um responsável fixo).
  owner_user_id uuid references auth.users(id) on delete set null,
  created_by_user_id uuid references auth.users(id) on delete set null,

  completed_at timestamptz,
  dismissed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A pergunta que o card do Kanban e o Radar fazem o tempo todo: "qual a
-- tarefa pendente de prazo mais próximo, por lead / pela org inteira?".
create index if not exists crm_lead_tasks_lead_pendente_idx
  on public.crm_lead_tasks (lead_id, due_at)
  where status = 'pending';
create index if not exists crm_lead_tasks_org_pendente_idx
  on public.crm_lead_tasks (organization_id, due_at)
  where status = 'pending';

drop trigger if exists trg_crm_lead_tasks_updated_at on public.crm_lead_tasks;
create trigger trg_crm_lead_tasks_updated_at
  before update on public.crm_lead_tasks
  for each row execute function public.fn_set_updated_at();

alter table public.crm_lead_tasks enable row level security;

drop policy if exists crm_lead_tasks_select on public.crm_lead_tasks;
drop policy if exists crm_lead_tasks_insert on public.crm_lead_tasks;
drop policy if exists crm_lead_tasks_update on public.crm_lead_tasks;

-- SELECT herda a visibilidade do lead-pai pela MESMA fn_can_view_lead que
-- crm_lead_activities e crm_lead_links já usam (migration 0036/0038) — por
-- EXISTS no lead_id, nunca por scalar de owner (lição G4-01: scalar devolve
-- NULL pro lead oculto e "own_and_unassigned" trataria como fila, vazando).
create policy crm_lead_tasks_select on public.crm_lead_tasks
  for select using (
    exists (
      select 1 from public.crm_leads l
      where l.id = crm_lead_tasks.lead_id
        and public.fn_can_view_lead(l.organization_id, l.owner_user_id)
    )
  );

-- WRITE fica org-scope (mesmo padrão de crm_lead_links): quem pode ver o
-- negócio o bastante para abrir o dossiê pode criar/editar uma tarefa nele.
create policy crm_lead_tasks_insert on public.crm_lead_tasks
  for insert with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );
create policy crm_lead_tasks_update on public.crm_lead_tasks
  for update using (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  ) with check (
    (organization_id in (select public.fn_user_org_ids()))
    or public.fn_is_platform_admin()
  );

revoke all on public.crm_lead_tasks from anon;
grant select, insert, update on public.crm_lead_tasks to authenticated;
grant all on public.crm_lead_tasks to service_role;

comment on table public.crm_lead_tasks is
  'Tarefa leve com prazo por lead ("lembra de ligar até sexta") — deliberadamente mais simples que calendar_appointments (sem hora marcada, sem fuso, sem Google) e mais concreta que lead_state.next_action (tem prazo, dono humano, e fica "atrasada"). Pode haver várias pendentes por lead; a UI mostra sempre a de prazo mais próximo.';
comment on column public.crm_lead_tasks.type is
  'Vocabulário fechado (greenfield, sem dado legado a proteger): call, whatsapp_message, meeting, follow_up, other.';
