-- ============================================================================
-- 0208 — SISTEMA DE COBRANÇA (boleto + Pix + cartão via ASAAS)
--
-- Até aqui não existia NENHUM subsistema de cobrança: `orders` (pedidos
-- espelhados de Nuvemshop/VTEX/Shopify) tem `status`/`payment_method`, mas é
-- read-only — não existe emissão de boleto/Pix/cartão em lugar nenhum do
-- schema. Subsistema novo, greenfield.
--
-- Gateway: ASAAS. Cada ORGANIZAÇÃO conecta a PRÓPRIA conta — o dinheiro cai
-- direto nela, DeskcommCRM nunca é intermediário financeiro (mesmo modelo de
-- confiança de `ai_provider_credentials` e das sessões WAHA).
--
-- Três tabelas:
--
-- 1. `billing_gateway_credentials` — a chave da ASAAS por org+ambiente,
--    cifrada com o mesmo esquema AES-256-GCM de `ai_provider_credentials`
--    (chave de cifra SEPARADA, `BILLING_CRED_AES_KEY`, pra não misturar o
--    raio de vazamento de credencial de LLM com o de gateway de pagamento).
--
-- 2. `billing_charges` — a cobrança em si. Nenhuma coluna aqui é dado de
--    cartão: cartão é resolvido pelo link de checkout HOSPEDADO da ASAAS
--    (`invoice_url`) — DeskcommCRM nunca vê nem armazena um PAN. Sobrevive à
--    anonimização do contato (mesma regra de `orders`: histórico contábil não
--    é cascade).
--
-- 3. `billing_webhook_events` — arquivo bruto de todo webhook recebido, molde
--    de `webhook_events_log` da WAHA. Só o service role escreve.
--
-- RLS no molde da 0206 (`catalog_products`): leitura pra org inteira, ESCRITA
-- só de `manager` pra cima — dinheiro é exatamente o caso que motivou a
-- graduação da policy única `tenant_isolation_..._all` pra policies
-- separadas `_select`/`_write` com `fn_role_at_least`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- billing_gateway_credentials — uma credencial ASAAS por organização+ambiente
-- ---------------------------------------------------------------------------
create table if not exists public.billing_gateway_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  -- Vocabulário FECHADO de propósito: greenfield, sem linha legada — não é o
  -- caso de coluna aberta que a doutrina reserva pra vocabulário com
  -- histórico anterior ao CHECK.
  provider text not null default 'asaas' check (provider = 'asaas'),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),

  api_key_encrypted bytea not null,
  api_key_iv bytea not null,
  api_key_tag bytea not null,
  api_key_last4 text not null,

  asaas_cpf_cnpj text,

  -- Dois segredos DISTINTOS, com papéis diferentes — o mesmo par que
  -- `webhook_sources` já usa (`path_token` público + `secret_encrypted`
  -- privado), aqui adaptado a hash em vez de cifra reversível:
  --
  -- `webhook_path_token` é a IDENTIDADE PÚBLICA da URL
  -- (/api/v1/webhooks/asaas/<isto>) — não é segredo forte, é só o que resolve
  -- QUAL organização recebeu o webhook. Pode aparecer em log de acesso.
  --
  -- `webhook_token_hash` é o segredo de VERDADE: o que o tenant cola no
  -- painel ASAAS como "token de acesso", comparado por hash contra o header
  -- `asaas-access-token` que a ASAAS ecoa de volta. Nunca decifrado — só
  -- precisa bater.
  webhook_path_token text not null,
  webhook_token_hash bytea not null,

  validated_at timestamptz,
  validation_error text,
  is_active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_gateway_credentials_org_env_key
  on public.billing_gateway_credentials (organization_id, environment);

create unique index if not exists billing_gateway_credentials_path_token_key
  on public.billing_gateway_credentials (webhook_path_token);

alter table public.billing_gateway_credentials enable row level security;

drop policy if exists billing_gateway_credentials_select on public.billing_gateway_credentials;
create policy billing_gateway_credentials_select on public.billing_gateway_credentials
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists billing_gateway_credentials_write on public.billing_gateway_credentials;
create policy billing_gateway_credentials_write on public.billing_gateway_credentials
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` do baseline
-- alcança toda tabela criada depois dele — sem o revoke, credencial de
-- pagamento fica legível pela anon key, que vai para o browser.
revoke all on public.billing_gateway_credentials from anon;
grant select, insert, update, delete on public.billing_gateway_credentials to authenticated;
grant all on public.billing_gateway_credentials to service_role;

drop trigger if exists trg_billing_gateway_credentials_updated_at on public.billing_gateway_credentials;
create trigger trg_billing_gateway_credentials_updated_at
  before update on public.billing_gateway_credentials
  for each row execute function public.fn_set_updated_at();

comment on table public.billing_gateway_credentials is
  'Uma credencial de gateway de pagamento (hoje só ASAAS) por organização e ambiente. Cada organização usa a PRÓPRIA conta — o dinheiro cai direto nela, DeskcommCRM nunca é intermediário financeiro.';
comment on column public.billing_gateway_credentials.webhook_token_hash is
  'SHA-256 do token que o tenant configura no painel ASAAS como "token de acesso" do webhook. Comparado por hash, nunca decifrado.';

-- View "safe": nunca `select *`, nunca `CREATE OR REPLACE` (não pode encolher
-- coluna, e `test:db` reaplica o baseline duas vezes) — DROP + CREATE, molde
-- de `ai_provider_credentials_safe`.
drop view if exists public.billing_gateway_credentials_safe;
create view public.billing_gateway_credentials_safe
  with (security_invoker = true) as
select
  id, organization_id, provider, environment, api_key_last4, asaas_cpf_cnpj,
  webhook_path_token, validated_at, validation_error, is_active, created_by, created_at, updated_at
from public.billing_gateway_credentials;

grant select on public.billing_gateway_credentials_safe to authenticated;
grant all on public.billing_gateway_credentials_safe to service_role;

-- ---------------------------------------------------------------------------
-- billing_charges — a cobrança em si (boleto | pix | cartão)
-- ---------------------------------------------------------------------------
create table if not exists public.billing_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  gateway_credential_id uuid not null references public.billing_gateway_credentials(id) on delete restrict,

  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.crm_leads(id) on delete set null,

  -- id da cobrança no ASAAS. Só fica nulo entre "linha criada" e "resposta da
  -- ASAAS chegou".
  external_id text,

  method text not null check (method in ('boleto', 'pix', 'cartao')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_payment', 'paid', 'overdue', 'cancelled', 'refunded', 'failed')),

  amount_cents bigint not null check (amount_cents > 0),
  currency char(3) not null default 'BRL',
  due_date date,
  description text,

  -- Artefatos de pagamento que a ASAAS devolve — URL/código/QR, nunca dado de
  -- cartão. Cartão é resolvido pelo link de checkout hospedado da ASAAS
  -- (`invoice_url`); DeskcommCRM nunca vê nem armazena um PAN.
  boleto_url text,
  boleto_barcode text,
  pix_qr_code text,
  pix_copy_paste text,
  invoice_url text,

  paid_at timestamptz,
  payload jsonb not null default '{}',

  -- Quem criou: um dos dois, nunca os dois — pessoa pela tela OU agente de
  -- IA pelo MCP.
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_api_token_id uuid references public.api_tokens(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint billing_charges_amount_positivo check (amount_cents > 0),
  constraint billing_charges_moeda_iso check (currency ~ '^[A-Z]{3}$'),
  constraint billing_charges_um_criador check (
    (created_by_user_id is null) or (created_by_api_token_id is null)
  )
);

create unique index if not exists billing_charges_org_external_key
  on public.billing_charges (organization_id, external_id)
  where external_id is not null;

create index if not exists billing_charges_org_contact_idx
  on public.billing_charges (organization_id, contact_id);

create index if not exists billing_charges_org_status_idx
  on public.billing_charges (organization_id, status);

alter table public.billing_charges enable row level security;

drop policy if exists billing_charges_select on public.billing_charges;
create policy billing_charges_select on public.billing_charges
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

drop policy if exists billing_charges_write on public.billing_charges;
create policy billing_charges_write on public.billing_charges
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

revoke all on public.billing_charges from anon;
grant select, insert, update, delete on public.billing_charges to authenticated;
grant all on public.billing_charges to service_role;

drop trigger if exists trg_billing_charges_updated_at on public.billing_charges;
create trigger trg_billing_charges_updated_at
  before update on public.billing_charges
  for each row execute function public.fn_set_updated_at();

comment on table public.billing_charges is
  'Uma cobrança real (boleto, Pix ou cartão) emitida via gateway de pagamento (ASAAS). Sobrevive à anonimização do contato — é histórico contábil, mesma regra de `orders`.';
comment on column public.billing_charges.payload is
  'Snapshot bruto do objeto de cobrança devolvido pela ASAAS, mesmo padrão de `orders.payload` — para auditoria/debug, nunca fonte de verdade de UI.';

-- ---------------------------------------------------------------------------
-- billing_webhook_events — arquivo bruto de todo webhook recebido da ASAAS
-- ---------------------------------------------------------------------------
create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,

  external_event_id text not null,
  event_type text not null,
  raw_payload jsonb not null,
  signature_verified boolean not null default false,
  processed_at timestamptz,

  created_at timestamptz not null default now()
);

create unique index if not exists billing_webhook_events_org_external_key
  on public.billing_webhook_events (organization_id, external_event_id);

alter table public.billing_webhook_events enable row level security;

drop policy if exists billing_webhook_events_select on public.billing_webhook_events;
create policy billing_webhook_events_select on public.billing_webhook_events
  for select using (
    (organization_id in (select public.fn_user_org_ids())) or public.fn_is_platform_admin()
  );

-- Só o service role escreve aqui (o webhook usa admin client) — sem policy
-- de write para `authenticated`, então nem `admin` altera o arquivo bruto
-- pela tela.
revoke all on public.billing_webhook_events from anon;
grant select on public.billing_webhook_events to authenticated;
grant all on public.billing_webhook_events to service_role;

comment on table public.billing_webhook_events is
  'Arquivo bruto de todo webhook recebido da ASAAS, uma linha por evento — molde de `webhook_events_log` da WAHA. Só o service role escreve; a tela só lê, para auditoria.';
