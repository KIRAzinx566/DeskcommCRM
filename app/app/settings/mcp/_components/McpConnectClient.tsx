"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateApiToken, type CreatedApiToken } from "@/hooks/team/useApiTokens";
import { copyToClipboard } from "@/lib/clipboard";
import { PlugsConnected, Copy } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

/**
 * `window.location.origin` > env: `NEXT_PUBLIC_APP_URL` fica congelada no
 * placeholder do build numa imagem Docker pré-buildada — a origem da
 * própria página é o único valor confiável em runtime (mesmo raciocínio de
 * `app/app/webhooks/_components/SourceDetail.tsx:publicUrl`).
 */
function mcpUrl(): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/api/mcp`;
}

async function copy(texto: string, mensagem: string): Promise<void> {
  const ok = await copyToClipboard(texto);
  if (ok) toast.success(mensagem);
}

export function McpConnectClient() {
  const t = useT();
  const create = useCreateApiToken();
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiToken | null>(null);
  const url = mcpUrl();

  const onCreate = async () => {
    try {
      const res = await create.mutateAsync({
        name: t("Cliente MCP externo"),
        scopes: ["mcp:read", "mcp:write", "role:manager"],
      });
      setCreated(res.data);
      setCreateOpen(false);
    } catch {
      /* showApiError já mostrou o toast */
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlugsConnected size={18} aria-hidden /> {t("1. Endereço do servidor")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t("Cole este endereço na configuração de servidor MCP do seu cliente.")}
          </p>
          <div className="flex gap-2">
            <Input readOnly value={url} className="font-mono text-xs" />
            <Button
              type="button"
              variant="secondary"
              onClick={() => copy(url, t("Endereço copiado."))}
            >
              <Copy size={14} aria-hidden /> {t("Copiar")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("2. Token de acesso")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "O cliente MCP se autentica com um Bearer token — o mesmo mecanismo dos tokens de API server-to-server. Crie um específico para isto (não reaproveite um token de outro uso).",
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setCreateOpen(true)}>
              {t("Criar token para MCP")}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href="/app/settings/api-tokens">{t("Ver todos os tokens")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("3. Configure o cliente")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            {t(
              "Claude Desktop, Cursor ou qualquer cliente MCP com suporte a Streamable HTTP: adicione um servidor remoto com o endereço acima e o header abaixo (troque SEU_TOKEN pelo token criado).",
            )}
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
            {`Authorization: Bearer SEU_TOKEN`}
          </pre>
          <p>
            {t(
              "Cada chamada é limitada a 60 por minuto por token — passar disso devolve erro de limite (HTTP 429), não trava a conta.",
            )}
          </p>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Criar token para MCP")}</DialogTitle>
            <DialogDescription>
              {t(
                "Já nasce com os escopos certos (mcp:read, mcp:write, papel gerente). O plaintext aparece só uma vez, na próxima tela.",
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={onCreate} disabled={create.isPending}>
              {create.isPending ? t("Criando…") : t("Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Token criado")}</DialogTitle>
            <DialogDescription>
              {t("Copie e guarde agora — não conseguiremos exibir novamente.")}
            </DialogDescription>
          </DialogHeader>
          {created ? (
            <div className="space-y-3">
              <Label className="text-xs">{t("Token")}</Label>
              <code className="block break-all rounded-md border bg-muted p-3 text-sm">
                {created.plaintext}
              </code>
              <Button
                type="button"
                variant="secondary"
                onClick={() => copy(created.plaintext, t("Token copiado."))}
              >
                <Copy size={14} aria-hidden /> {t("Copiar para clipboard")}
              </Button>
              <p className="text-xs text-muted-foreground">{created._warning}</p>
            </div>
          ) : null}
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>{t("Fechar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
