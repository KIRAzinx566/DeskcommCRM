-- ============================================================================
-- 0209 — CSAT pelo próprio WhatsApp, ao fechar a conversa
--
-- Inspirado no Chatwoot: quando o atendimento fecha, pergunta a satisfação
-- pelo MESMO canal, sem depender de e-mail ou de um link externo. A ideia
-- inteira só funciona porque o WhatsApp já É a conversa — mandar a pergunta é
-- só mais uma mensagem de saída na mesma thread.
--
-- ─── Por que uma tabela nova, e não uma coluna em `conversations` ──────────
--
-- Uma conversa pode fechar e reabrir várias vezes (o cliente escreve de novo,
-- `fn_upsert_wa_conversation` reusa a linha) — uma coluna única perderia o
-- histórico de pesquisas anteriores e não teria como saber SE já foi
-- perguntado desta vez. Uma linha por pesquisa enviada é o que permite
-- responder "quantas perguntamos, quantas responderam" sem inferir de outra
-- tabela.
--
-- ─── Por que SÓ o service_role escreve ──────────────────────────────────────
--
-- Quem cria e responde uma pesquisa são os dois handlers do event_log
-- (`lib/csat/enviar-pesquisa.ts`, `lib/csat/capturar-resposta.ts`), nunca uma
-- tela. Mesmo molde de `billing_webhook_events`: nenhuma policy de escrita
-- para `authenticated` — nem `admin` altera a nota de uma resposta pela tela.
-- ============================================================================

create table if not exists public.csat_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  channel_session_id uuid not null references public.channel_sessions(id) on delete cascade,

  status text not null default 'pending' check (status in ('pending', 'answered', 'expired')),

  -- A nota só existe depois de respondida — nula até lá, e permanece nula se
  -- a pesquisa expirar sem resposta (expirar é lido em consulta, não vira
  -- uma escrita própria — ver o comentário em `lib/csat/capturar-resposta.ts`).
  score smallint check (score is null or score between 1 and 5),
  raw_reply text,

  sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  answered_at timestamptz,

  created_at timestamptz not null default now()
);

-- Uma pesquisa pendente por contato é o que `capturar-resposta.ts` busca a
-- cada mensagem recebida — o índice parcial é exatamente essa consulta.
create index if not exists csat_requests_org_contato_pendente_idx
  on public.csat_requests (organization_id, contact_id)
  where status = 'pending';

-- O dashboard soma por período — mais recente primeiro.
create index if not exists csat_requests_org_enviada_idx
  on public.csat_requests (organization_id, sent_at desc);

alter table public.csat_requests enable row level security;

drop policy if exists csat_requests_select on public.csat_requests;
create policy csat_requests_select on public.csat_requests
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` do baseline
-- alcança toda tabela criada depois dele — sem o revoke, respostas de
-- cliente ficam legíveis pela anon key, que vai para o browser.
revoke all on public.csat_requests from anon;
grant select on public.csat_requests to authenticated;
grant all on public.csat_requests to service_role;

comment on table public.csat_requests is
  'Uma linha por pesquisa de satisfação enviada ao fechar uma conversa de WhatsApp. Só os handlers do event_log escrevem (enviar-pesquisa.ts cria, captura-resposta.ts responde) — nenhuma tela.';
comment on column public.csat_requests.score is
  'Nota 1-5, extraída da resposta em texto livre por lib/csat/interpretar-nota.ts. Nula até responder, e continua nula se expirar sem resposta.';
comment on column public.csat_requests.expires_at is
  'Depois disso, a mensagem do cliente não é mais interpretada como resposta a ESTA pesquisa — ela pode estar respondendo outra coisa. Lido em consulta (status ainda mostra pending até alguém olhar), não é uma varredura própria.';
