-- ============================================================================
-- 0144 — MARCA POR ORGANIZAÇÃO (cor de destaque + logo)
--
-- Até aqui a marca (nome/logo/cor) era por INSTALAÇÃO (env vars, lib/branding.ts)
-- — todo tenant de um mesmo self-host via a mesma cor/logo. Este é o pedido
-- inverso: cada organização quer a própria cor e o próprio logo, sem depender
-- de quem hospeda mexer no .env.
--
-- accent_color/logo_url ficam em colunas dedicadas (não em `settings` jsonb)
-- porque accent_color precisa de validação de formato hex antes de virar CSS
-- (lib/branding.ts::validateAccentColor) e logo_url aponta pro bucket novo —
-- os dois merecem tipo e não fariam sentido soltos numa bag de config livre.
-- NULL em qualquer um dos dois = "sem override", cai pro valor global da
-- instalação (mesma semântica de resolveBranding() já usada pelo global).
-- ============================================================================

alter table public.organizations
  add column if not exists branding_accent_color text,
  add column if not exists branding_logo_url text;

comment on column public.organizations.branding_accent_color is
  'Hex (#rrggbb ou #rgb) validado em app antes de gravar. NULL = usa a cor global da instalação (APP_ACCENT_COLOR).';
comment on column public.organizations.branding_logo_url is
  'URL pública do logo no bucket org-branding. NULL = usa o logo global da instalação (APP_LOGO_URL).';

-- Bucket público: o logo aparece em <img src> antes da hidratação/sessão
-- (sidebar, título de página), então precisa de URL direta sem signed-URL.
-- 2MB / só formatos de imagem web comuns — mesmo teto de bom senso usado nos
-- outros buckets desta migration family (ai-policy 20MB, lgpd-exports 50MB,
-- mas aqueles são documentos; logo é um ícone).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-branding',
  'org-branding',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- Escrita sempre passa pelo admin client (app/api/v1/settings/branding/logo/route.ts,
-- mesma doutrina de app/actions/settings/updateTenant.ts — RLS de sessão não é a
-- fronteira real, service role bypassa). As policies abaixo são defesa em
-- profundidade, espelhando o padrão já usado em ai-policy (0014) e
-- whatsapp-media (0055): membro só mexe no prefixo da própria org.
create policy "tenant_write_org_branding" on storage.objects for insert
  with check (
    bucket_id = 'org-branding'
    and exists (
      select 1 from public.user_organizations uo
      where uo.user_id = auth.uid()
        and uo.revoked_at is null
        and uo.organization_id = (split_part(name, '/', 1))::uuid
    )
  );

create policy "tenant_delete_org_branding" on storage.objects for delete
  using (
    bucket_id = 'org-branding'
    and exists (
      select 1 from public.user_organizations uo
      where uo.user_id = auth.uid()
        and uo.revoked_at is null
        and uo.organization_id = (split_part(name, '/', 1))::uuid
    )
  );

-- Sem policy de select: bucket público serve o conteúdo direto por
-- /storage/v1/object/public/org-branding/..., sem passar por RLS.
