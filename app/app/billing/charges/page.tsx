import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { BillingChargesPanel, type BillingChargeRow } from "./_components/BillingChargesPanel";

export const dynamic = "force-dynamic";

const COLUNAS =
  "id, organization_id, contact_id, lead_id, external_id, method, status, amount_cents, currency, due_date, description, boleto_url, boleto_barcode, pix_qr_code, pix_copy_paste, invoice_url, paid_at, created_at, updated_at";

export default async function BillingChargesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  const idioma = user.idioma;

  const supabase = await createClient();
  const { data } = await supabase
    .from("billing_charges")
    .select(COLUNAS)
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const charges = (data ?? []) as unknown as BillingChargeRow[];
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{traduzir("Cobranças", idioma)}</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir("Boletos, Pix e cobranças no cartão geradas para os seus clientes.", idioma)}
        </p>
      </header>
      <BillingChargesPanel initialData={charges} canWrite={canWrite} />
    </div>
  );
}
