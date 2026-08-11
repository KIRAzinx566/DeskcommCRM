"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBranding } from "@/app/actions/settings/updateBranding";
import { brandingSchema } from "@/lib/schemas/settings";

interface Props {
  initial: { accent_color: string | null; logo_url: string | null };
}

export function BrandingForm({ initial }: Props) {
  const [accentColor, setAccentColor] = useState(initial.accent_color ?? "");
  const [logoUrl, setLogoUrl] = useState(initial.logo_url);
  const [isSaving, startSaving] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview em tempo real: só aplica se o hex já é válido, senão não distorce
  // o swatch com lixo digitado no meio de um valor ainda incompleto.
  const previewColor = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accentColor.trim())
    ? accentColor.trim()
    : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = { accent_color: accentColor.trim() || null };
    const parsed = brandingSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Cor inválida.");
      return;
    }
    startSaving(async () => {
      const r = await updateBranding(parsed.data);
      if (r.ok) toast.success("Marca atualizada.");
      else toast.error(`Erro: ${r.error}`);
    });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Arquivo excede o limite de 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/v1/settings/branding/logo", {
        method: "POST",
        body: formData,
      });
      const body = (await res.json()) as { data?: { logo_url: string }; error?: { message: string } };
      if (!res.ok || !body.data) {
        toast.error(body.error?.message ?? "Erro ao enviar o logo.");
        return;
      }
      setLogoUrl(body.data.logo_url);
      toast.success("Logo atualizado.");
    } catch {
      toast.error("Erro ao enviar o logo.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveLogo() {
    setIsUploading(true);
    try {
      const res = await fetch("/api/v1/settings/branding/logo", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Erro ao remover o logo.");
        return;
      }
      setLogoUrl(null);
      toast.success("Logo removido.");
    } catch {
      toast.error("Erro ao remover o logo.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="font-medium">Logo</h2>
          <p className="text-xs text-muted-foreground">PNG, JPEG, WebP ou SVG — até 2MB.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border bg-card">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo da organização" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="text-xs text-muted-foreground">Sem logo</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFileSelected}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? "Enviando…" : logoUrl ? "Trocar logo" : "Enviar logo"}
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" disabled={isUploading} onClick={handleRemoveLogo}>
                Remover
              </Button>
            )}
          </div>
        </div>
      </Card>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-4 p-6">
          <div>
            <h2 className="font-medium">Cor de destaque</h2>
            <p className="text-xs text-muted-foreground">
              Usada em botões e itens ativos da navegação. Vazio usa a cor padrão.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Escolher cor"
              value={previewColor ?? "#1a56db"}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-9 w-9 cursor-pointer rounded border p-0.5"
            />
            <div className="flex-1 space-y-2">
              <Label htmlFor="accent_color">Hex</Label>
              <Input
                id="accent_color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                placeholder="#1a56db"
              />
            </div>
            {accentColor && (
              <Button type="button" variant="ghost" onClick={() => setAccentColor("")}>
                Limpar
              </Button>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
