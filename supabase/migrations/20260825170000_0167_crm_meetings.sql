-- 0167 — Agenda de reuniões (crm_meetings).
--
-- Não existe spec/PRD para esta feature (docs/prd/*, docs/business-rules/*,
-- docs/current-state.md grepados antes de escrever isto — zero hit real; os
-- únicos "agendado" existentes são sobre cron de follow-up, coisa diferente).
-- Regra de negócio nova, registrada aqui: uma reunião marcada com o contato de
-- um lead, criada por um humano (UI) ou pelo agente de IA nativo durante a
-- conversa (F-novo, mirror de schedule_followup/0119).
--
-- ## Por que `contact_id` obrigatório e `lead_id` opcional, e não o contrário
--
-- O harness do agente resolve "quem está falando" (contact_id) SEMPRE; "qual
-- negócio" (lead_id) é derivado por `resolveActiveLeadForContact`
-- (lib/leads/active-lead.ts) e pode ficar sem resposta — contato sem negócio
-- aberto, ou com dois negócios abertos empatados em atividade — e a doutrina
-- deste repo é NÃO ADIVINHAR nesse caso (mesma regra de `emitAgentActivityForContact`).
-- Exigir `lead_id NOT NULL` faria o agente simplesmente falhar em agendar toda
-- reunião com um contato sem negócio óbvio — pior que guardar a reunião sem o
-- vínculo. Mesmo desenho de `demandas` (migration 0136): "uma demanda sem lead
-- é desfecho legítimo, não pendência" — aqui vale a mesma frase para reunião.
--
-- ## Por que uma tabela nova, e não um tipo de `crm_lead_activities`
--
-- A atividade (`meeting_scheduled`, adicionada em lib/leads/activity-vocabulary.ts)
-- continua existindo — é o rastro na timeline. Mas uma reunião tem campos
-- próprios que precisam ser QUERYÁVEIS independente de uma linha de atividade
-- (horário, duração, status que muda depois de criada, modalidade) — os mesmos
-- motivos que já valeram para `demandas` sobre `agent_cases`/`conversations`.

create table if not exists public.crm_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Quem tem a reunião (sempre resolvível — é o remetente/destinatário do canal).
  contact_id uuid not null references public.contacts(id) on delete cascade,
  -- Negócio vinculado, quando o roteamento contato→lead resolveu um só
  -- candidato sem ambiguidade. Ausência é desfecho legítimo (ver acima).
  lead_id uuid references public.crm_leads(id) on delete set null,

  title text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  modality text not null default 'online'
    check (modality in ('online', 'presencial', 'ligacao')),
  meeting_link text,
  location text,
  notes text,
  outcome_notes text,

  status text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada', 'no_show')),
  -- Quem marcou: humano pela tela, ou o agente de IA durante a conversa.
  source text not null default 'manual' check (source in ('manual', 'agente')),

  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crm_meetings_ends_after_starts check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_crm_meetings_org_starts
  on public.crm_meetings (organization_id, starts_at);
create index if not exists idx_crm_meetings_lead
  on public.crm_meetings (organization_id, lead_id)
  where lead_id is not null;
create index if not exists idx_crm_meetings_contact
  on public.crm_meetings (organization_id, contact_id);

alter table public.crm_meetings enable row level security;

drop policy if exists tenant_isolation_crm_meetings_all on public.crm_meetings;
create policy tenant_isolation_crm_meetings_all on public.crm_meetings
  for all
  using (organization_id in (select * from public.fn_user_org_ids()))
  with check (organization_id in (select * from public.fn_user_org_ids()));

comment on table public.crm_meetings is
  'Reunião marcada com o contato de um lead — manualmente (UI) ou pelo agente '
  'de IA nativo durante a conversa. lead_id é best-effort (rota de roteamento '
  'contato→negócio, mesma regra de crm_lead_activities); contact_id é sempre '
  'preenchido.';

-- ---------------------------------------------------------------------------
-- Número de WhatsApp que recebe o aviso de reunião marcada (F-novo).
--
-- Coluna dedicada e tipada em `organizations`, não `settings` jsonb — mesmo
-- precedente de `branding_accent_color`/`branding_logo_url` (migration 0150):
-- campo com formato validado merece coluna própria. Mesma regra de formato
-- E.164 já usada em `contacts.phone_number` (constraint `contacts_phone_e164_format`),
-- reaproveitada aqui para não inventar uma segunda definição de "telefone
-- válido" no mesmo banco.
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists owner_whatsapp_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organizations_owner_whatsapp_e164_format'
  ) then
    alter table public.organizations
      add constraint organizations_owner_whatsapp_e164_format
      check (owner_whatsapp_number is null or owner_whatsapp_number ~ '^\+\d{8,15}$');
  end if;
end $$;

comment on column public.organizations.owner_whatsapp_number is
  'E.164 (+5511999999999). Recebe aviso por WhatsApp quando uma reunião é '
  'marcada (crm_meetings). Nulo = notificação desligada, sem erro.';
