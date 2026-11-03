-- manifest: **Sai o que sobrou da marca por organização da 0169 (fork), que nenhum código lê.** As colunas `organizations.branding_accent_color`/`branding_logo_url` e as policies `tenant_write_org_branding`/`tenant_delete_org_branding` só existiam na cadeia — o baseline nunca as teve —, e a cerca `baseline-e-cadeia-chegam-ao-mesmo-schema` acusava a diferença. A marca da plataforma hoje é a do upstream (bucket `brand-logos`, o único público). O bucket `org-branding` fica, mas privado: apagar linha de `storage.buckets` direto é recusado pelo Supabase. Idempotente.

alter table public.organizations
  drop column if exists branding_accent_color,
  drop column if exists branding_logo_url;

drop policy if exists "tenant_write_org_branding" on storage.objects;
drop policy if exists "tenant_delete_org_branding" on storage.objects;

update storage.buckets set public = false where id = 'org-branding' and public;
