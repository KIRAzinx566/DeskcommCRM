"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

export interface BillingCredentialRow {
  id: string;
  organization_id: string;
  provider: string;
  environment: "sandbox" | "production";
  api_key_last4: string | null;
  asaas_cpf_cnpj: string | null;
  webhook_path_token: string | null;
  validated_at: string | null;
  validation_error: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialData: BillingCredentialRow[];
  canWrite: boolean;
}

function webhookUrl(pathToken: string | null): string {
  if (!pathToken || typeof window === "undefined") return "";
  return `${window.location.origin}/api/v1/webhooks/asaas/${pathToken}`;
}

function statusBadge(row: BillingCredentialRow, t: (s: string) => string) {
  if (!row.is_active) return <Badge variant="outline">{t("Desativada")}</Badge>;
  if (row.validation_error) return <Badge variant="destructive">{t("Chave inválida")}</Badge>;
  if (row.validated_at) return <Badge variant="default">{t("Validada")}</Badge>;
  return <Badge variant="secondary">{t("Validando…")}</Badge>;
}

const formSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
  api_key: z.string().trim().min(8, "Chave muito curta").max(2048),
});

interface CreateResponse {
  data: BillingCredentialRow & { webhook_token: string };
}

export function BillingCredentialsPanel({ initialData, canWrite }: Props) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [rows, setRows] = useState(initialData);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ url: string; token: string } | null>(null);
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEnvironment("sandbox");
    setApiKey("");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = formSchema.safeParse({ environment, api_key: apiKey });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Dados inválidos."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<CreateResponse>("/api/v1/billing/credentials", parsed.data);
      setRows((prev) => [res.data, ...prev]);
      setWebhookInfo({ url: webhookUrl(res.data.webhook_path_token), token: res.data.webhook_token });
      reset();
      router.refresh();
    } catch (err) {
      showApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <div>
          <Button onClick={() => setDialogOpen(true)}>{t("Conectar conta ASAAS")}</Button>
        </div>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Ambiente")}</TableHead>
              <TableHead>{t("Chave")}</TableHead>
              <TableHead>{t("Conectada como")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Criada em")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  {t("Nenhuma credencial conectada ainda.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="capitalize">{r.environment}</TableCell>
                  <TableCell>•••• {r.api_key_last4}</TableCell>
                  <TableCell>{r.asaas_cpf_cnpj ?? "—"}</TableCell>
                  <TableCell>{statusBadge(r, t)}</TableCell>
                  <TableCell>{new Date(r.created_at).toLocaleDateString(tagIdioma)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{t("Conectar conta ASAAS")}</DialogTitle>
              <DialogDescription>
                {t("Crie uma conta em asaas.com (ou use o sandbox para testar) e cole a API key aqui. Ela fica cifrada e não aparece mais depois de salva.")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="environment">{t("Ambiente")}</Label>
                <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
                  <SelectTrigger id="environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sandbox">{t("Sandbox (testes)")}</SelectItem>
                    <SelectItem value="production">{t("Produção (cobra de verdade)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="api_key">{t("API key da ASAAS")}</Label>
                <Input
                  id="api_key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="$aact_..."
                  autoComplete="off"
                />
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("Salvando…") : t("Salvar")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={webhookInfo !== null} onOpenChange={(o) => { if (!o) setWebhookInfo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Configure o webhook na ASAAS")}</DialogTitle>
            <DialogDescription>
              {t("Este token só aparece agora — copie os dois valores e cole no painel da ASAAS em Integrações › Webhooks, antes de fechar esta janela.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <Label>{t("URL do webhook")}</Label>
              <Input readOnly value={webhookInfo?.url ?? ""} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>{t("Token de acesso (cole em \"asaas-access-token\")")}</Label>
              <Input readOnly value={webhookInfo?.token ?? ""} onFocus={(e) => e.currentTarget.select()} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setWebhookInfo(null); toast.success(t("Credencial conectada.")); }}>
              {t("Já configurei")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
