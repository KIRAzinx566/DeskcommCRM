"use client";

import { useT } from "@/hooks/i18n/useT";
import { useForecast } from "@/hooks/metrics/useForecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatBRL(cents: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

export function ForecastPanel() {
  const t = useT();
  const { data, isLoading, isError } = useForecast(true);

  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (isError || !data)
    return <p className="text-sm text-destructive">{t("Erro ao carregar previsão.")}</p>;

  const f = data.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Total em aberto (bruto)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{formatBRL(f.bruto_cents)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Previsão ponderada")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{formatBRL(f.ponderado_cents)}</p>
            <p className="text-xs text-muted-foreground">
              {t("Só etapas com probabilidade de fechar configurada entram aqui.")}
            </p>
          </CardContent>
        </Card>
      </div>

      {f.por_pipeline.map((p) => (
        <Card key={p.pipeline_id}>
          <CardHeader>
            <CardTitle className="text-base">
              {p.pipeline_name} · {formatBRL(p.bruto_cents)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({t("previsto")} {formatBRL(p.ponderado_cents)})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {p.etapas.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("Nenhuma etapa configurada.")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Etapa")}</TableHead>
                    <TableHead className="text-right">{t("Probabilidade")}</TableHead>
                    <TableHead className="text-right">{t("Bruto")}</TableHead>
                    <TableHead className="text-right">{t("Ponderado")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.etapas.map((e) => (
                    <TableRow key={e.stage_id}>
                      <TableCell className="font-medium">{e.stage_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {e.probabilidade === null ? "—" : `${e.probabilidade}%`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBRL(e.bruto_cents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.ponderado_cents === null ? "—" : formatBRL(e.ponderado_cents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
