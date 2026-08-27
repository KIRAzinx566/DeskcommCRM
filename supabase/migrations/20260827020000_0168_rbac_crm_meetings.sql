-- 0168 — crm_meetings (0167) nasceu com policy ALL só-tenancy, sem papel.
--
-- `tests/invariants/rbac-config-ia-canais.test.ts` — "nenhuma tabela NOVA
-- entra com policy ALL só-tenancy" — é exatamente o gate que a 0150 deixou
-- pra impedir a dívida de RBAC de crescer, e a 0167 (agenda de reuniões)
-- caiu nele: copiou o padrão antigo (`tenant_isolation_<tabela>_all`) sem
-- reparar que ele já tinha sido descontinuado.
--
-- FORMA: mesmo par da 0150 — SELECT só-tenancy (todo membro lê, inclusive
-- viewer) + escrita com `fn_role_at_least`. O piso de papel é 'agent', não
-- 'admin': a API já corta exatamente aí (`app/api/v1/meetings/route.ts` e
-- `[id]/route.ts` exigem `requireRole("agent", ...)` pra POST/PATCH — "mesmo
-- corte de leads, viewer é read-only"). A policy passa a espelhar a rota, em
-- vez de ficar mais frouxa que ela — mesmo raciocínio da 0150, papel
-- diferente porque a superfície é diferente (agenda, não config de IA).
--
-- Sem `or fn_is_platform_admin()`: a policy original da 0167 não tinha esse
-- lado, e nenhuma rota de suporte de plataforma lê crm_meetings hoje — nada
-- a preservar aqui (mesmo caso de ai_agent_versions/ai_routers na 0150).

drop policy if exists tenant_isolation_crm_meetings_all on public.crm_meetings;

drop policy if exists crm_meetings_tenant_select on public.crm_meetings;
create policy crm_meetings_tenant_select on public.crm_meetings
  for select using (organization_id in (select public.fn_user_org_ids()));

drop policy if exists crm_meetings_tenant_write on public.crm_meetings;
create policy crm_meetings_tenant_write on public.crm_meetings
  for all using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
  ) with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'agent')
  );

notify pgrst, 'reload schema';
