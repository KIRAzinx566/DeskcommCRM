/**
 * POST /api/v1/settings/branding/logo — upload do logo da organização.
 * DELETE /api/v1/settings/branding/logo — remove o logo (volta pro global).
 *
 * Multipart, mesma forma de app/api/v1/ai/knowledge/sources/upload/route.ts:
 * valida, sobe pro bucket público `org-branding` (path prefixado pela org —
 * migration 0144), grava a URL em organizations.branding_logo_url via admin
 * client (RLS de organizations só libera write pra platform_admin — mesma
 * doutrina de updateTenant.ts) e limpa o blob se o passo seguinte falhar.
 *
 * Auth: cookie session. Role >= admin — branding é decisão de dono da conta,
 * não de qualquer atendente (mesmo piso de /app/settings/tenant).
 */

import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB — logo, não documento
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("admin", { requestId, resource: "org_branding" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("invalid_request", "Falha ao processar multipart/form-data.", 400, { requestId });
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return fail("invalid_request", "Campo 'file' ausente ou inválido.", 400, { requestId });
  }
  const file = fileEntry;

  if (file.size > MAX_FILE_SIZE) {
    return fail("payload_too_large", "Arquivo excede o limite de 2MB.", 413, { requestId });
  }

  const ext = ALLOWED_MIME_TYPES[file.type];
  if (!ext) {
    return fail(
      "unsupported_media_type",
      "Tipo de arquivo não suportado. Envie PNG, JPEG, WebP ou SVG.",
      415,
      { requestId },
    );
  }

  const admin = createAdminClient();

  // Logo anterior (se houver) é removida DEPOIS do novo upload confirmar —
  // nunca antes: um upload que falha no meio não pode deixar a org sem logo.
  const { data: currentRow } = await admin
    .from("organizations")
    .select("branding_logo_url")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const previousUrl = currentRow?.branding_logo_url ?? null;

  const blobPath = `${activeOrg.orgId}/logo-${randomUUID()}.${ext}`;
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from("org-branding")
    .upload(blobPath, fileBuffer, { contentType: file.type, upsert: false });
  if (uploadErr) {
    console.error("[branding-logo-upload] storage upload failed:", uploadErr.message);
    return fail("internal_error", "Erro ao fazer upload do arquivo.", 500, { requestId });
  }

  const { data: publicUrlData } = admin.storage.from("org-branding").getPublicUrl(blobPath);
  const logoUrl = publicUrlData.publicUrl;

  const { error: updateErr } = await admin
    .from("organizations")
    .update({ branding_logo_url: logoUrl })
    .eq("id", activeOrg.orgId);
  if (updateErr) {
    await admin.storage.from("org-branding").remove([blobPath]);
    console.error("[branding-logo-upload] organizations update failed:", updateErr.message);
    return fail("internal_error", "Erro ao gravar o logo.", 500, { requestId });
  }

  const previousPath = previousUrl ? pathFromPublicUrl(previousUrl) : null;
  if (previousPath) {
    await admin.storage.from("org-branding").remove([previousPath]);
  }

  await audit({
    action: "org.branding_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId,
    metadata: { logo_url: logoUrl },
  });

  return ok({ logo_url: logoUrl }, { status: 201, requestId });
}

export async function DELETE(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("admin", { requestId, resource: "org_branding" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  const admin = createAdminClient();
  const { data: currentRow } = await admin
    .from("organizations")
    .select("branding_logo_url")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  const currentUrl = currentRow?.branding_logo_url ?? null;

  const { error: updateErr } = await admin
    .from("organizations")
    .update({ branding_logo_url: null })
    .eq("id", activeOrg.orgId);
  if (updateErr) {
    return fail("internal_error", "Erro ao remover o logo.", 500, { requestId });
  }

  const currentPath = currentUrl ? pathFromPublicUrl(currentUrl) : null;
  if (currentPath) {
    await admin.storage.from("org-branding").remove([currentPath]);
  }

  await audit({
    action: "org.branding_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId,
    metadata: { logo_url: null },
  });

  return ok({ logo_url: null }, { requestId });
}

/** Extrai o path dentro do bucket a partir da URL pública do Supabase Storage. */
function pathFromPublicUrl(url: string): string | null {
  const marker = "/object/public/org-branding/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}
