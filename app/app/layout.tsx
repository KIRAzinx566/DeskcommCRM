import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isMfaEnrolled, loadAuthUser, requiresMfa, resolveActiveOrg } from "@/lib/auth/server";
import { DEFAULT_VISIBILITY_MODE, type VisibilityMode } from "@/lib/auth/types";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import { AppShell } from "./_components/AppShell";
import { MfaEnrollGate } from "@/components/auth/MfaEnrollGate";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMPERSONATE_COOKIE_NAME,
  verifyImpersonateCookie,
} from "@/lib/impersonate/cookie";
import {
  ImpersonateBanner,
  type ImpersonatingInfo,
} from "@/components/app/ImpersonateBanner";
import { env } from "@/lib/env";
import { resolveBranding } from "@/lib/branding";
import { OrgBrandingProvider } from "@/hooks/branding/OrgBrandingProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");

  let activeOrg = await resolveActiveOrg(user);

  // Marca global (env da instalação) — ponto de partida do merge abaixo.
  // Sem override de org, é exatamente o que <PublicEnvScript/> já aplicava.
  let orgBranding = resolveBranding(env.APP_NAME, env.APP_LOGO_URL, env.APP_ACCENT_COLOR);

  // EPIC-02: gate /app/* on completed onboarding.
  // EPIC-11: gate /app/* on org not being suspended (S-11.08).
  if (activeOrg) {
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("organizations")
      .select("onboarded_at, status, settings, branding_accent_color, branding_logo_url")
      .eq("id", activeOrg.orgId)
      .maybeSingle();
    if (orgRow && !orgRow.onboarded_at) redirect("/onboarding");
    if (orgRow?.status === "suspended") redirect("/account-suspended");
    // G4-02: expõe visibility_mode ao client (inbox decide visões visíveis).
    // Fonte confiável (admin client, org do cookie validado) — nunca do body.
    const mode = (orgRow?.settings as { visibility_mode?: VisibilityMode } | null)
      ?.visibility_mode;
    activeOrg = { ...activeOrg, visibility_mode: mode ?? DEFAULT_VISIBILITY_MODE };

    // Marca por organização (feature nova): a org sobrescreve nome global só
    // em logo/cor — `resolveBranding` já sabe cair pro default/`null` quando
    // o override está ausente ou é um hex inválido, então basta encadear
    // "valor da org, senão valor global" nos dois parâmetros que ela aceita.
    orgBranding = resolveBranding(
      env.APP_NAME,
      orgRow?.branding_logo_url || env.APP_LOGO_URL,
      orgRow?.branding_accent_color || env.APP_ACCENT_COLOR,
    );
  }

  // Read sidebar collapsed state SSR to avoid flash.
  const store = await cookies();
  const collapsed = store.get("sidebar_collapsed")?.value === "1";

  // Impersonate (S-11.07): verify cookie server-side and resolve tenant name.
  // Middleware already validates HMAC + expiry on /app/*; we re-verify here as
  // defence-in-depth and to extract the payload safely.
  let impersonating: ImpersonatingInfo | null = null;
  const impCookie = store.get(IMPERSONATE_COOKIE_NAME)?.value;
  if (impCookie) {
    const result = verifyImpersonateCookie(impCookie);
    if (result.valid && result.payload) {
      const admin = createAdminClient();
      const { data: org } = await admin
        .from("organizations")
        .select("display_name")
        .eq("id", result.payload.tenantId)
        .maybeSingle();
      if (org) {
        impersonating = {
          tenantId: result.payload.tenantId,
          tenantName: org.display_name,
          expiresAt: new Date(result.payload.exp * 1000).toISOString(),
        };
      }
    }
  }

  const enrolled = await isMfaEnrolled();
  const needsMfaGate = requiresMfa(activeOrg?.role, user.is_platform_admin);
  const shell = <AppShell sidebarCollapsed={collapsed}>{children}</AppShell>;

  return (
    <OrgBrandingProvider value={orgBranding}>
      {/*
        Sobrescreve a cor de destaque global (já aplicada em <head> por
        <PublicEnvScript/>) com o override da org — mesma técnica (CSS var em
        vez de re-render), só que resolvida aqui porque só /app/* tem sessão
        pra saber qual é a org ativa. Vem depois no documento, então ganha a
        cascata em especificidade igual sem precisar de !important.
      */}
      {orgBranding.accentColor && (
        <style
          dangerouslySetInnerHTML={{
            __html:
              `:root,[data-theme="dark"]{` +
              `--color-accent:${orgBranding.accentColor};--color-accent-fg:${orgBranding.accentForeground};}`,
          }}
        />
      )}
      <AuthProvider user={user} activeOrg={activeOrg}>
        <ImpersonateBanner impersonating={impersonating} />
        {needsMfaGate ? (
          // Gate always mounted for MFA-required roles; it latches the blocking
          // decision client-side so the enroll Server Action's revalidation
          // can't tear down the recovery-codes screen mid-flow.
          <MfaEnrollGate enrolled={enrolled}>{shell}</MfaEnrollGate>
        ) : (
          shell
        )}
      </AuthProvider>
    </OrgBrandingProvider>
  );
}
