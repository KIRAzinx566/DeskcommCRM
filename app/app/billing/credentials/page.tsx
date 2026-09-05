import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { branding } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { BillingCredentialsPanel, type BillingCredentialRow } from "./_components/BillingCredentialsPanel";

export const dynamic = "force-dynamic";

const SAFE_COLUMNS =
  "id, organization_id, provider, environment, api_key_last4, asaas_cpf_cnpj, webhook_path_token, validated_at, validation_error, is_active, created_by, created_at, updated_at";

export default async function BillingCredentialsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = user.idioma;
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("billing_gateway_credentials_safe")
    .select(SAFE_COLUMNS)
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false });

  const credentials = (data ?? []) as unknown as BillingCredentialRow[];
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Credenciais de pagamento", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "A conta da ASAAS é sua: você cria a conta direto na ASAAS e cola a chave aqui. O dinheiro das cobranças cai direto nela — nunca passa pela",
            idioma,
          )}{" "}
          {branding().name}.
        </p>
      </header>
      <BillingCredentialsPanel initialData={credentials} canWrite={canWrite} />
    </div>
  );
}
