-- manifest: `billing_gateway_credentials_write` e `billing_charges_write` trocam `fn_is_platform_admin()` (ignora o scope do JWT) por `fn_is_platform_admin_full()` — mesmo conserto do #2000/#2115, achado nestas duas pelo invariante novo `tests/invariants/platform-admin-full-so-escreve.test.ts` (sincronização com o upstream de 2026-10-06).
--
-- As duas policies são `FOR ALL` (sem `for select`/`for insert` etc. explícito)
-- e aceitavam `fn_is_platform_admin()` puro, que não confere `scope` — um
-- platform admin com `scope = 'support_readonly'` conseguia escrever
-- credencial de gateway e cobrança de QUALQUER organização com o próprio JWT,
-- pelo PostgREST direto, sem passar por nenhuma rota. A leitura (as policies
-- `_select`, que já são `fn_is_platform_admin()` sob `for select`) não muda:
-- support_readonly continua lendo, só não escreve.
--
-- Idempotente: `drop policy if exists` + `create policy`.

drop policy if exists billing_gateway_credentials_write on public.billing_gateway_credentials;
create policy billing_gateway_credentials_write on public.billing_gateway_credentials
  using (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );

drop policy if exists billing_charges_write on public.billing_charges;
create policy billing_charges_write on public.billing_charges
  using (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  )
  with check (
    public.fn_is_platform_admin_full()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'manager'))
  );
