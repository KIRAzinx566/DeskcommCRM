-- 0507 — Canal direto do dono com o agente de IA.
--
-- O dono manda mensagem pelo WhatsApp usando o número PESSOAL já cadastrado
-- como destino dos avisos de caso (migration 0292, `config_aviso_de_caso`).
-- Essa mensagem abre um canal de correção direto com UM agente escolhido por
-- ele — nunca vira contato/conversa (mesma garantia que
-- `lib/escalacao/numero-interno-de-aviso.ts` já protege hoje). A correção
-- entra como memória ativa do agente, sem revisão humana, valendo já no
-- próximo atendimento.
--
-- ## Achado de segurança embutido nesta migration
--
-- `org_memory_entries`, `org_memory_pointers` e `org_memory_versions`
-- (migration 0067) nunca tiveram `enable row level security` nem `revoke`
-- nenhum. O baseline dá `GRANT ALL ON TABLES` a `anon`/`authenticated` por
-- `ALTER DEFAULT PRIVILEGES` (o mesmo padrão do incidente do `api_audit_log`,
-- migration 0267) — toda tabela nova nasce exposta e precisa revogar por
-- conta própria. Medido: hoje, com a `anon key` pública, qualquer um
-- lê/escreve/apaga a memória de IA de QUALQUER organização via PostgREST
-- direto. Todo acesso legítimo (MCP, rota de UI, `loadOrgMemory` via
-- `pg.Pool`) já usa client admin/conexão privilegiada filtrando
-- `organization_id` manualmente — ligar RLS e revogar não quebra nenhum
-- caminho real. Como esta migration já toca `org_memory_entries` para a
-- coluna `agent_id`, o conserto entra na mesma transação.

-- ---- 1. config_aviso_de_caso ganha o estado do canal direto ----
alter table public.config_aviso_de_caso
  add column if not exists canal_direto_ligado boolean not null default false;
alter table public.config_aviso_de_caso
  add column if not exists canal_direto_agente_id uuid references public.ai_agents(id) on delete set null;
alter table public.config_aviso_de_caso
  add column if not exists canal_direto_selecionado_em timestamptz;

comment on column public.config_aviso_de_caso.canal_direto_ligado is
  'Liga o canal direto (correção/aprendizado) no mesmo número já cadastrado para avisos de caso. Default false: diferente de "ligado" (avisos), este campo controla uma capacidade que reescreve a memória de um agente em produção sem revisão humana.';
comment on column public.config_aviso_de_caso.canal_direto_agente_id is
  'Qual agente o dono está corrigindo agora. NULL = nenhuma seleção ativa (o canal pede #agente <nome>). Escrito pelo ingestor via client admin — a autorização já foi provada por posse do telefone cadastrado, não por sessão logada.';
comment on column public.config_aviso_de_caso.canal_direto_selecionado_em is
  'Carimbo da seleção, para o TTL (aplicado em código, nunca em CHECK — now() em CHECK é instável entre réplicas e no pg_dump).';

-- ---- 2. org_memory_entries ganha escopo por agente + CHECK estendido ----
alter table public.org_memory_entries
  add column if not exists agent_id uuid references public.ai_agents(id) on delete cascade;

comment on column public.org_memory_entries.agent_id is
  'NULL = vale para toda a organização (comportamento histórico, preservado). Preenchido = vale só para este agente. ON DELETE CASCADE: uma correção que só faz sentido para o Agente X morre com o Agente X — SET NULL faria ela "escapar" e voltar a valer para a org inteira.';

alter table public.org_memory_entries
  drop constraint if exists org_memory_entries_source_check;
alter table public.org_memory_entries
  add constraint org_memory_entries_source_check
  check (source in ('manual', 'flywheel', 'agent', 'canal_direto'));

-- ---- 2.1 CONSERTO DE SEGURANÇA: RLS que nunca existiu nestas 3 tabelas ----
alter table public.org_memory_versions  enable row level security;
alter table public.org_memory_pointers  enable row level security;
alter table public.org_memory_entries   enable row level security;

revoke all    on public.org_memory_versions  from anon, authenticated;
revoke all    on public.org_memory_pointers  from anon, authenticated;
revoke all    on public.org_memory_entries   from anon, authenticated;
grant  select on public.org_memory_versions  to authenticated;
grant  select on public.org_memory_pointers  to authenticated;
grant  select on public.org_memory_entries   to authenticated;
grant  all    on public.org_memory_versions  to service_role;
grant  all    on public.org_memory_pointers  to service_role;
grant  all    on public.org_memory_entries   to service_role;

-- Leitura: `agent` — a rota equivalente (GET /api/v1/ai/memory) já exige esse
-- piso. org_memory_versions/pointers não têm organization_id DIRETO na linha
-- de pointers (tem) mas versions não tem organization_id — versions é um
-- doc-mãe sem dono de organização na própria linha; a leitura segura é só
-- pelo pointer, então versions fica com policy via join.
drop policy if exists leitura_org_memory_entries on public.org_memory_entries;
create policy leitura_org_memory_entries
  on public.org_memory_entries
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
  );

drop policy if exists leitura_org_memory_pointers on public.org_memory_pointers;
create policy leitura_org_memory_pointers
  on public.org_memory_pointers
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
  );

drop policy if exists leitura_org_memory_versions on public.org_memory_versions;
create policy leitura_org_memory_versions
  on public.org_memory_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.org_memory_pointers p
       where p.version_id = org_memory_versions.id
         and p.organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(p.organization_id, 'agent')
    )
  );

-- ---- 3. canal_direto_mensagens — log/transcript (Sistema Vivo: log visível) ----
create table if not exists public.canal_direto_mensagens (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  agent_id            uuid references public.ai_agents(id) on delete set null,
  channel_session_id  uuid references public.channel_sessions(id) on delete set null,
  autor               text not null check (autor in ('dono', 'ia')),
  corpo               text not null,
  memory_entry_id     uuid references public.org_memory_entries(id) on delete set null,
  erro_codigo         text,
  external_id         text,
  created_at          timestamptz not null default now()
);

create index if not exists canal_direto_mensagens_org_idx
  on public.canal_direto_mensagens (organization_id, created_at desc);

comment on table public.canal_direto_mensagens is
  'Transcrição do canal direto dono↔agente. O autor é sempre dono/funcionário (nunca contacts) — não entra na cascata de anonimização de LGPD de contato. Dívida nomeada: não há expurgo automático ainda; considerar retenção numa rodada futura, mesmo precedente de agent_case_chat_messages.body.';

alter table public.canal_direto_mensagens enable row level security;
revoke all    on public.canal_direto_mensagens from anon, authenticated;
grant  select on public.canal_direto_mensagens to authenticated;
grant  all    on public.canal_direto_mensagens to service_role;

-- SELECT restrito a admin (não "qualquer membro"): é a correção viva de um
-- agente em produção, mais sensível que histórico de aviso (que é `manager`).
drop policy if exists leitura_canal_direto_mensagens on public.canal_direto_mensagens;
create policy leitura_canal_direto_mensagens
  on public.canal_direto_mensagens
  for select to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'admin')
  );

-- ---- 4. fn_definir_aviso_de_caso ganha o parâmetro do canal direto ----
--
-- Postgres identifica função por NOME+TIPOS dos parâmetros. Um `create or
-- replace` que só ACRESCENTA um parâmetro no fim cria uma função SEPARADA
-- (overload) em vez de substituir a de 6 parâmetros — e a chamada com 6
-- argumentos passaria a ser AMBÍGUA entre as duas (a de 6 exata e a de 7 com
-- o último defaultado). O `drop function` da assinatura ANTIGA, antes do
-- `create or replace` da NOVA, evita a ambiguidade. Nenhum chamador quebra:
-- o PostgREST chama por nome de parâmetro, nunca por posição, e
-- `p_canal_direto_ligado` tem default `null` = "não mexer".
drop function if exists public.fn_definir_aviso_de_caso(uuid,uuid,text,text,boolean,boolean);

create or replace function public.fn_definir_aviso_de_caso(
  p_org uuid,
  p_channel uuid,
  p_telefone text,
  p_rotulo text,
  p_ligado boolean,
  p_confirma_contato boolean default false,
  p_canal_direto_ligado boolean default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes public.config_aviso_de_caso;
  v_arch timestamptz;
  v_digitos text;
  v_variantes text[];
begin
  -- Papel + suporte, nesta ordem e na MESMA transação da escrita. `auth.uid()`
  -- nulo é o caminho do service role: quem escreve configuração é gente.
  if auth.uid() is null or p_org is null
     or not public.fn_role_at_least(p_org, 'admin')
     or not public.fn_support_write_allowed(p_org) then
    raise exception 'aviso_de_caso_forbidden' using errcode = '42501';
  end if;
  -- Quem NÃO tem fator cadastrado passa: a função já trata isso, e é coerente
  -- com a política de MFA opcional deste produto.
  if not public.fn_session_mfa_proven() then
    raise exception 'aviso_de_caso_mfa_required' using errcode = '42501';
  end if;
  if p_telefone is null or p_telefone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'aviso_de_caso_telefone_invalido' using errcode = '22023';
  end if;

  -- O canal é DA organização e não está arquivado. Sem isto a FK simples
  -- deixaria apontar para o canal de outro tenant — a FK composta do padrão
  -- 0228 não serve aqui porque o `on delete set null` anularia também
  -- `organization_id`, que é a chave primária desta tabela.
  if p_channel is not null then
    select archived_at into v_arch
      from public.channel_sessions
     where id = p_channel and organization_id = p_org;
    if not found or v_arch is not null then
      raise exception 'aviso_de_caso_canal_invalido' using errcode = '22023';
    end if;
  end if;

  -- As duas grafias do nono dígito — a MESMA regra de
  -- `lib/channels/phone-variants.ts`. Comparar a string crua deixaria passar o
  -- número do suporte cadastrado com 9 e registrado sem.
  v_digitos := regexp_replace(p_telefone, '\D', '', 'g');
  v_variantes := array[v_digitos];
  if v_digitos like '55%' then
    if length(v_digitos) = 13
       and substring(v_digitos from 5 for 1) = '9'
       and substring(v_digitos from 6 for 1) between '6' and '9' then
      v_variantes := v_variantes || (substring(v_digitos from 1 for 4) || substring(v_digitos from 6));
    elsif length(v_digitos) = 12
       and substring(v_digitos from 5 for 1) between '6' and '9' then
      v_variantes := v_variantes || (substring(v_digitos from 1 for 4) || '9' || substring(v_digitos from 5));
    end if;
  end if;

  -- O NÚMERO DE AVISO NÃO PODE SER UM NÚMERO DA PRÓPRIA ORGANIZAÇÃO. É o laço
  -- robô-com-robô: a conexão de avisos manda para o número oficial, o agente
  -- dele responde, e as duas pontas se alimentam sem fim.
  -- A conexão ARQUIVADA fica FORA da conta. Ela não envia nem recebe, então o
  -- laço não acontece por ela — e contá-la bloqueia o número PARA SEMPRE, porque
  -- a conexão que já teve agente publicado não pode ser apagada (as versões a
  -- seguram) e o número nunca mais poderia receber aviso.
  if exists (
       select 1 from public.channel_sessions s
        where s.organization_id = p_org
          and s.archived_at is null
          and s.phone_number is not null
          and regexp_replace(s.phone_number, '\D', '', 'g') = any (v_variantes)) then
    raise exception 'aviso_de_caso_numero_da_propria_org' using errcode = '22023';
  end if;

  -- O número de aviso vira INTERNO: tudo o que chegar dele deixa de virar
  -- contato, conversa, lead e despacho do agente. Se ele já é um CLIENTE desta
  -- organização, as mensagens dessa pessoa param de chegar ao CRM — e isso não
  -- pode acontecer por engano. A tela pergunta e reenvia com `p_confirma_contato`.
  if not coalesce(p_confirma_contato, false) and exists (
       select 1 from public.contacts c
        where c.organization_id = p_org
          and c.phone_number is not null
          and regexp_replace(c.phone_number, '\D', '', 'g') = any (v_variantes)) then
    raise exception 'aviso_de_caso_numero_de_cliente' using errcode = '22023';
  end if;

  select * into v_antes from public.config_aviso_de_caso where organization_id = p_org;

  insert into public.config_aviso_de_caso
    (organization_id, channel_session_id, telefone_destino, rotulo, ligado, canal_direto_ligado, criado_por, atualizado_por)
  values
    (p_org, p_channel, p_telefone, nullif(btrim(p_rotulo), ''), coalesce(p_ligado, false), coalesce(p_canal_direto_ligado, false), auth.uid(), auth.uid())
  on conflict (organization_id) do update
    set channel_session_id = excluded.channel_session_id,
        telefone_destino   = excluded.telefone_destino,
        rotulo             = excluded.rotulo,
        ligado             = excluded.ligado,
        -- NULL = "não mexer": a tela de avisos resubmete o formulário inteiro
        -- sem conhecer o campo do canal direto, e tratar ausência como
        -- "desligar" apagaria a escolha de quem configurou pela tela nova.
        canal_direto_ligado = coalesce(p_canal_direto_ligado, config_aviso_de_caso.canal_direto_ligado),
        atualizado_por     = auth.uid(),
        -- Trocou o número, o JID resolvido do anterior não vale mais — e é o
        -- JID que o corte da ingestão usa para reconhecer quem está em modo
        -- privacidade. Mantê-lo faria o corte continuar valendo para o número
        -- ANTIGO, que pode voltar a ser um cliente.
        destino_jid        = case
                               when excluded.telefone_destino is distinct from config_aviso_de_caso.telefone_destino
                               then null
                               else config_aviso_de_caso.destino_jid
                             end,
        updated_at         = now();

  return jsonb_build_object(
    'trocou_numero', (v_antes.telefone_destino is distinct from p_telefone),
    'antes_ligado',  coalesce(v_antes.ligado, false)
  );
end;
$$;
-- AS DUAS ORIGENS DE EXECUTE (item 9 da doutrina de migrations): o grant direto
-- a `anon` do `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO anon` do
-- baseline (que `revoke from public` não remove) e o grant implícito a PUBLIC
-- que o Postgres dá a toda função ao criá-la (que `revoke from anon` não
-- remove). Fechar uma só deixa a função exposta com o gate verde.
revoke all     on function public.fn_definir_aviso_de_caso(uuid,uuid,text,text,boolean,boolean,boolean) from public, anon;
grant  execute on function public.fn_definir_aviso_de_caso(uuid,uuid,text,text,boolean,boolean,boolean) to authenticated;
