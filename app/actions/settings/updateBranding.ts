"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { brandingSchema, type BrandingInput } from "@/lib/schemas/settings";
import { validateAccentColor } from "@/lib/branding";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export type UpdateBrandingResult =
  | { ok: true }
  | { ok: false; error: string; details?: unknown };

export async function updateBranding(input: BrandingInput): Promise<UpdateBrandingResult> {
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }

  // Mesma doutrina de updateTenant.ts: a única write policy de `organizations`
  // exige fn_is_platform_admin(), então a escrita vai pelo admin client — o gate
  // de papel real é o de cima, resolvido de fonte confiável (não do JWT direto).
  const accentColor = validateAccentColor(parsed.data.accent_color);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("organizations")
    .update({ branding_accent_color: accentColor })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: error.message };

  const hdrs = await headers();
  await audit({
    action: "org.branding_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
    metadata: { accent_color: accentColor },
  });

  revalidatePath("/app/settings/branding");
  revalidatePath("/app", "layout");
  return { ok: true };
}
