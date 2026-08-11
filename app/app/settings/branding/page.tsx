import { redirect } from "next/navigation";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { BrandingForm } from "./_form";

export default async function BrandingSettingsPage() {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!user.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("branding_accent_color, branding_logo_url")
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Marca</h1>
        <p className="text-sm text-muted-foreground">
          Cor de destaque e logo desta organização. Some vazio, usa a marca padrão da instalação.
        </p>
      </div>
      <BrandingForm
        initial={{
          accent_color: data?.branding_accent_color ?? null,
          logo_url: data?.branding_logo_url ?? null,
        }}
      />
    </div>
  );
}
