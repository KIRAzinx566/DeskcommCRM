-- 0383 — o merge de `csat` em `organizations.settings` vira ATÔMICO.
--
-- `app/actions/settings/updateTenant.ts` lia `organizations.settings` inteiro,
-- espalhava em memória e regravava o objeto junto com os campos escalares do
-- tenant — o MESMO desenho que a 0157/0158 já tinham corrigido para `branding`
-- (`fn_definir_marca_da_organizacao`, migration 0158): dois round-trips deixam
-- uma janela para escrita concorrente sumir sem erro. Medido para `branding`
-- (comentário da própria função): `visibility_mode` voltava de `own` para
-- `all` quando as duas escritas se cruzavam, e a RLS lê essa chave.
--
-- `csat` corria o mesmo risco: salvar a moeda/timezone do tenant (que não
-- toca em `settings`) ainda assim lia o jsonb inteiro só para regravá-lo —
-- qualquer chave escrita por OUTRO caminho entre o SELECT e o UPDATE desta
-- action (branding, visibility_mode, roteamento) seria sobrescrita pelo valor
-- que esta action tinha em memória.
--
-- `fn_definir_atendimento_da_organizacao` segue o MESMO molde de
-- `fn_definir_marca_da_organizacao`: `jsonb_set` numa chave específica
-- (`csat`), sem tocar nas demais (`branding`, `llm`, `routing`,
-- `visibility_mode`, `atrito`, `ai_dispatch_mode`,
-- `canonical_conversation_tags`, `lost_reasons_extra`, `plan`).
-- `updateTenant.ts` passa a chamar esta função em vez de ler+mesclar+escrever
-- o jsonb inteiro.
--
-- ⚠️ `lost_reasons_extra` NÃO entra aqui: o campo saiu do produto na mesma
-- sincronização (o editor em Configurações › Organização nunca era lido nem
-- pela janela de perder nem pela validação — `tests/unit/idioma-aparece-…`,
-- `lib/schemas/settings.test.ts`). A régua que funciona é "Motivos de perda"
-- por FUNIL, em `crm_pipelines.settings.lost_reasons`.

create or replace function public.fn_definir_atendimento_da_organizacao(
  p_org           uuid,
  p_actor         uuid,
  p_csat_enabled  boolean,
  p_csat_pergunta text
) returns integer
    language plpgsql
    volatile
    security definer
    set search_path to 'public', 'pg_temp'
as $$
declare
  v_linhas integer;
begin
  if p_org is null or p_actor is null then
    raise exception 'atendimento_da_organizacao_argumento_nulo'
      using errcode = '22023';
  end if;

  if not exists (
       select 1 from public.user_organizations uo
        where uo.user_id = p_actor
          and uo.organization_id = p_org
          and uo.role = 'admin'
          and uo.revoked_at is null
     )
     and not exists (
       select 1 from public.platform_admins pa
        where pa.user_id = p_actor
          and pa.revoked_at is null
     )
  then
    raise exception 'atendimento_da_organizacao_sem_permissao'
      using errcode = '42501';
  end if;

  update public.organizations o
     set settings = jsonb_set(
           coalesce(o.settings, '{}'::jsonb),
           '{csat}',
           jsonb_build_object('enabled', p_csat_enabled, 'pergunta', p_csat_pergunta),
           true
         )
   where o.id = p_org;

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

comment on function public.fn_definir_atendimento_da_organizacao(uuid, uuid, boolean, text) is
  'Grava organizations.settings.csat com merge ATÔMICO (jsonb_set), sem tocar nas demais chaves do jsonb (branding, llm, routing, visibility_mode, atrito, ai_dispatch_mode, canonical_conversation_tags, lost_reasons_extra, plan). Devolve linhas afetadas: 0 = a organização não existe. Papel insuficiente levanta 42501. Chamador: app/actions/settings/updateTenant.ts.';

-- ── OS DOIS REVOKES (CLAUDE.md, item 9): duas origens distintas de EXECUTE ──
-- Só o service_role chama (via updateTenant.ts, admin client): a autorização
-- mora NO CORPO da função (role admin ou platform_admin), não na RLS de
-- sessão — mesmo desenho de fn_definir_marca_da_organizacao (migration 0158).
revoke execute on function public.fn_definir_atendimento_da_organizacao(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant  execute on function public.fn_definir_atendimento_da_organizacao(uuid, uuid, boolean, text)
  to service_role;
