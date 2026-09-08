"use client";

import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import { useCsatMetrics } from "@/hooks/metrics/useCsatMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/** Verde/neutro/vermelho — a mesma leitura de relance que os badges de status já dão em outras telas. */
function corDaNota(nota: number): "success" | "warning" | "destructive" {
  if (nota >= 4) return "success";
  if (nota === 3) return "warning";
  return "destructive";
}

export function CsatPanel() {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { data, isLoading, isError } = useCsatMetrics();

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (isError || !data)
    return <p className="text-sm text-destructive">{t("Erro ao carregar CSAT.")}</p>;

  const m = data.data;
  const taxaDeResposta = m.enviadas > 0 ? Math.round((m.respondidas / m.enviadas) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Nota média (30 dias)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {m.media_nota != null ? m.media_nota.toFixed(1) : "—"}
              {m.media_nota != null ? (
                <span className="text-base text-muted-foreground"> / 5</span>
              ) : null}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Pesquisas enviadas")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{m.enviadas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Taxa de resposta")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {taxaDeResposta != null ? `${taxaDeResposta}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {m.respondidas} {t("de")} {m.enviadas}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Respostas recentes")}</CardTitle>
        </CardHeader>
        <CardContent>
          {m.recentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("Nenhuma pesquisa respondida ainda nos últimos 30 dias.")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Contato")}</TableHead>
                  <TableHead>{t("Nota")}</TableHead>
                  <TableHead>{t("Resposta")}</TableHead>
                  <TableHead className="text-right">{t("Quando")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.recentes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.contato}</TableCell>
                    <TableCell>
                      {r.nota != null ? <Badge variant={corDaNota(r.nota)}>{r.nota}/5</Badge> : "—"}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {r.resposta ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {r.respondida_em
                        ? new Date(r.respondida_em).toLocaleString(tagDoIdioma)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
