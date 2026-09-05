"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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

export interface BillingChargeRow {
  id: string;
  organization_id: string;
  contact_id: string | null;
  lead_id: string | null;
  external_id: string | null;
  method: "boleto" | "pix" | "cartao";
  status: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  description: string | null;
  boleto_url: string | null;
  boleto_barcode: string | null;
  pix_qr_code: string | null;
  pix_copy_paste: string | null;
  invoice_url: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  initialData: BillingChargeRow[];
  canWrite: boolean;
}

function formatCents(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency });
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  awaiting_payment: { label: "Aguardando pagamento", variant: "secondary" },
  paid: { label: "Pago", variant: "default" },
  overdue: { label: "Vencido", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "outline" },
  refunded: { label: "Reembolsado", variant: "outline" },
  failed: { label: "Falhou", variant: "destructive" },
};

const createSchema = z.object({
  contact_id: z.string().uuid("Precisa ser o id do contato"),
  lead_id: z.string().uuid().optional().or(z.literal("")),
  method: z.enum(["boleto", "pix", "cartao"]),
  amount_reais: z.number().positive(),
  due_date: z.string().optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  cpf_cnpj: z.string().trim().min(11).max(18),
});

interface CreateResponse {
  data: BillingChargeRow;
}

interface CancelResponse {
  data: BillingChargeRow & { ja_estava?: boolean };
}

/** Só cabe cancelar quem ainda não chegou a um desfecho — mesma régua do `_handler.ts`. */
const STATUS_CANCELAVEIS = new Set(["pending", "awaiting_payment", "overdue"]);

export function BillingChargesPanel({ initialData, canWrite }: Props) {
  const t = useT();
  const tagIdioma = useTagDeIdioma();
  const router = useRouter();
  const [rows, setRows] = useState(initialData);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<BillingChargeRow | null>(null);
  const [contactId, setContactId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [method, setMethod] = useState<"boleto" | "pix" | "cartao">("pix");
  const [amountReais, setAmountReais] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const reset = () => {
    setContactId("");
    setLeadId("");
    setMethod("pix");
    setAmountReais("");
    setDueDate("");
    setDescription("");
    setCpfCnpj("");
    setError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = createSchema.safeParse({
      contact_id: contactId,
      lead_id: leadId,
      method,
      amount_reais: Number(amountReais.replace(",", ".")),
      due_date: dueDate,
      description,
      cpf_cnpj: cpfCnpj,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Dados inválidos."));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<CreateResponse>("/api/v1/billing/charges", {
        contact_id: parsed.data.contact_id,
        ...(parsed.data.lead_id ? { lead_id: parsed.data.lead_id } : {}),
        method: parsed.data.method,
        amount_cents: Math.round(parsed.data.amount_reais * 100),
        ...(parsed.data.due_date ? { due_date: parsed.data.due_date } : {}),
        ...(parsed.data.description ? { description: parsed.data.description } : {}),
        cpf_cnpj: parsed.data.cpf_cnpj,
      });
      setRows((prev) => [res.data, ...prev]);
      setSelected(res.data);
      setDialogOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      showApiError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = async () => {
    if (!selected) return;
    setCancelError(null);
    if (cancelReason.trim().length < 3) {
      setCancelError(t("Escreva o motivo do cancelamento (pelo menos 3 caracteres)."));
      return;
    }
    setCancelling(true);
    try {
      const res = await apiClient.post<CancelResponse>(
        `/api/v1/billing/charges/${selected.id}/cancel`,
        { reason: cancelReason.trim() },
      );
      setRows((prev) => prev.map((r) => (r.id === res.data.id ? { ...r, status: res.data.status } : r)));
      setSelected((prev) => (prev ? { ...prev, status: res.data.status } : prev));
      setCancelReason("");
      router.refresh();
    } catch (err) {
      showApiError(err);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? (
        <div>
          <Button onClick={() => setDialogOpen(true)}>{t("Nova cobrança")}</Button>
        </div>
      ) : null}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Método")}</TableHead>
              <TableHead>{t("Valor")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Vencimento")}</TableHead>
              <TableHead>{t("Criada em")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  {t("Nenhuma cobrança gerada ainda.")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const s = STATUS_LABEL[r.status] ?? { label: r.status, variant: "outline" as const };
                return (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                    <TableCell className="capitalize">{r.method}</TableCell>
                    <TableCell>{formatCents(r.amount_cents, r.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{t(s.label)}</Badge>
                    </TableCell>
                    <TableCell>{r.due_date ? new Date(r.due_date).toLocaleDateString(tagIdioma) : "—"}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString(tagIdioma)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>{t("Nova cobrança")}</DialogTitle>
              <DialogDescription>
                {t("Gera um boleto, Pix ou link de cartão via ASAAS. O cliente recebe o link para pagar.")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="contact_id">{t("Id do contato")}</Label>
                <Input id="contact_id" value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="uuid" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lead_id">{t("Id do negócio (opcional)")}</Label>
                <Input id="lead_id" value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="uuid" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="method">{t("Método")}</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="boleto">{t("Boleto")}</SelectItem>
                    <SelectItem value="cartao">{t("Cartão")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">{t("Valor (R$)")}</Label>
                <Input id="amount" value={amountReais} onChange={(e) => setAmountReais(e.target.value)} placeholder="150,00" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="due_date">{t("Vencimento (opcional — hoje se vazio)")}</Label>
                <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="cpf_cnpj">{t("CPF/CNPJ de quem paga")}</Label>
                <Input id="cpf_cnpj" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="description">{t("Descrição (opcional)")}</Label>
                <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                {t("Cancelar")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("Gerando…") : t("Gerar cobrança")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={selected !== null} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Cobrança gerada")}</DialogTitle>
          </DialogHeader>
          {selected ? (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm">{formatCents(selected.amount_cents, selected.currency)} — {selected.method}</p>
              {selected.invoice_url ? (
                <div className="flex flex-col gap-1">
                  <Label>{t("Link para pagar")}</Label>
                  <Input readOnly value={selected.invoice_url} onFocus={(e) => e.currentTarget.select()} />
                </div>
              ) : null}
              {selected.pix_copy_paste ? (
                <div className="flex flex-col gap-1">
                  <Label>{t("Pix copia e cola")}</Label>
                  <Input readOnly value={selected.pix_copy_paste} onFocus={(e) => e.currentTarget.select()} />
                </div>
              ) : null}
              {selected.boleto_barcode ? (
                <div className="flex flex-col gap-1">
                  <Label>{t("Código de barras do boleto")}</Label>
                  <Input readOnly value={selected.boleto_barcode} onFocus={(e) => e.currentTarget.select()} />
                </div>
              ) : null}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">{t("Status")}:</span>
                <Badge variant={(STATUS_LABEL[selected.status] ?? { variant: "outline" as const }).variant}>
                  {t(STATUS_LABEL[selected.status]?.label ?? selected.status)}
                </Badge>
              </div>
              {canWrite && STATUS_CANCELAVEIS.has(selected.status) ? (
                <div className="flex flex-col gap-2 border-t pt-3">
                  <Label htmlFor="cancel_reason">{t("Motivo do cancelamento")}</Label>
                  <Input
                    id="cancel_reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder={t("Ex.: cliente desistiu, valor errado…")}
                  />
                  {cancelError ? <p className="text-xs text-destructive">{cancelError}</p> : null}
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={cancelling}
                    onClick={onCancel}
                  >
                    {cancelling ? t("Cancelando…") : t("Cancelar cobrança")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setSelected(null)}>{t("Fechar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
