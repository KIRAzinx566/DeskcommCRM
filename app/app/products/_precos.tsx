"use client";

/**
 * PREÇOS E PARCELAS — a régua de preço da loja, na tela onde o preço mora.
 *
 * Duas coisas que mudam o que o atendente de IA diz de dinheiro:
 *
 *   - a TABELA DO DIA (`lib/catalogo/tabela-do-dia.ts`): ligada, o atendente
 *     só passa preço da tabela conferida hoje. O aviso fica NO TOPO da tela
 *     enquanto ela estiver vencida, porque é o que explica um atendente que
 *     "parou de responder preço" — e o botão que resolve está no mesmo lugar;
 *   - as TAXAS DO CARTÃO (`lib/financeiro/parcelamento.ts`), coladas do jeito
 *     que a maquininha mostra, com a simulação ao lado para a loja conferir os
 *     valores antes de o cliente ouvi-los.
 */
import * as React from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ReguaDaTela as Regua } from "@/lib/catalogo/regua-de-preco";
import { lerTabelaDeTaxas, MAX_PARCELAS, simularTodas } from "@/lib/financeiro/parcelamento";
import { formatCents } from "@/lib/money";
import { precoParaCentavos } from "@/lib/schemas/produtos";

const EXEMPLO_DE_TAXAS = "Débito – 2,29%\nCrédito à vista – 4,29%\n2x – 5,13%\n10x – 10,2%";

function quando(iso: string, fuso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: fuso,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `inicial` vem da PÁGINA, lida no servidor — sem busca no navegador. Quando a
 * página é refeita (`router.refresh()` depois de importar a planilha, que pode
 * ter conferido a tabela), o valor novo chega por aqui e substitui o local.
 * `null` = a página não conseguiu ler a régua: o painel não aparece, e o resto
 * da tela de Produtos continua inteiro.
 */
export function PrecosEParcelas({ podeEditar, inicial }: { podeEditar: boolean; inicial: Regua | null }) {
  const t = useT();
  const [regua, setRegua] = React.useState<Regua | null>(inicial);
  const [aberto, setAberto] = React.useState(false);
  const [texto, setTexto] = React.useState(inicial?.parcelamento.texto ?? "");
  const [semJurosAte, setSemJurosAte] = React.useState(String(inicial?.parcelamento.sem_acrescimo_ate ?? 0));
  const [valorDeTeste, setValorDeTeste] = React.useState("1.000,00");
  const [salvando, setSalvando] = React.useState(false);

  const aplicar = React.useCallback((r: Regua) => {
    setRegua(r);
    setTexto(r.parcelamento.texto);
    setSemJurosAte(String(r.parcelamento.sem_acrescimo_ate));
  }, []);

  // Valor novo vindo do servidor: o padrão de "estado derivado da prop" do
  // React, durante o render, em vez de um efeito que pintaria o antigo antes.
  const [inicialVisto, setInicialVisto] = React.useState(inicial);
  if (inicial !== inicialVisto) {
    setInicialVisto(inicial);
    if (inicial) aplicar(inicial);
  }

  async function salvar(corpo: Record<string, unknown>, aviso: string) {
    setSalvando(true);
    try {
      const r = await apiClient.patch<{ data: Regua }>("/api/v1/settings/precos", corpo);
      aplicar(r.data);
      toast.success(aviso);
    } catch (e) {
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  if (!regua) return null;

  const vencida = regua.tabela.situacao === "vencida";
  const lido = lerTabelaDeTaxas(texto);
  const centavosDeTeste = precoParaCentavos(valorDeTeste);
  const simulacao =
    centavosDeTeste && centavosDeTeste > 0
      ? simularTodas(centavosDeTeste, {
          debito: lido.debito,
          credito: lido.credito,
          sem_acrescimo_ate: Number(semJurosAte) || 0,
        })
      : [];

  return (
    <section className="mb-6" data-testid="precos-e-parcelas">
      {vencida ? (
        <div
          className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
          role="alert"
          data-testid="tabela-vencida"
        >
          <p className="font-medium">
            {regua.tabela.conferida_em
              ? `${t("A tabela de preços não foi conferida hoje. Última conferência:")} ${quando(regua.tabela.conferida_em, regua.fuso)}.`
              : t("A tabela de preços ainda não foi conferida.")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              "Enquanto isso, o atendente de IA não passa preço nem parcela: diz que já envia a tabela atualizada e chama a equipe.",
            )}
          </p>
          {podeEditar ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={salvando}
                onClick={() => void salvar({ conferir_agora: true }, t("Tabela conferida para hoje"))}
                data-testid="conferir-tabela"
              >
                {t("Os preços de hoje estão certos")}
              </Button>
              <span className="self-center text-xs text-muted-foreground">
                {t("Importar a planilha inteira sem erro também confere a tabela.")}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        className="text-sm font-medium underline-offset-4 hover:underline"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        data-testid="abrir-precos-e-parcelas"
      >
        {aberto ? "▾" : "▸"} {t("Preços e parcelas")}
      </button>

      {aberto ? (
        <div className="mt-3 grid gap-6 rounded-lg border p-4 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium">{t("Tabela do dia")}</h2>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!podeEditar || salvando}
                checked={regua.tabela.validade === "mesmo_dia"}
                onChange={(e) =>
                  void salvar(
                    { validade: e.target.checked ? "mesmo_dia" : "desligada" },
                    t("Configuração salva"),
                  )
                }
                data-testid="exigir-conferencia"
              />
              <span>
                {t("Exigir que a tabela de preços seja conferida todo dia")}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(
                    "Para quem muda preço durante o dia (celular, eletrônico, câmbio). Sem a conferência do dia, o atendente não passa preço.",
                  )}
                </span>
              </span>
            </label>
            {regua.tabela.validade === "mesmo_dia" && regua.tabela.conferida_em ? (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="ultima-conferencia">
                {t("Última conferência:")} {quando(regua.tabela.conferida_em, regua.fuso)}
              </p>
            ) : null}
          </div>

          <div>
            <h2 className="text-sm font-medium">{t("Taxas do cartão")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Cole a tabela da maquininha, uma linha por opção. O atendente usa estas taxas para dizer o valor exato de cada parcela.",
              )}
            </p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={EXEMPLO_DE_TAXAS}
              rows={7}
              disabled={!podeEditar}
              className="mt-2 w-full rounded-md border px-3 py-2 font-mono text-xs"
              data-testid="taxas-do-cartao"
            />
            {lido.ignoradas.length > 0 ? (
              <p className="mt-1 text-xs text-destructive" data-testid="taxas-ignoradas">
                {t("Não consegui ler:")} {lido.ignoradas.join(" · ")}
              </p>
            ) : null}
            <label className="mt-2 block text-sm">
              {t("Sem juros até")}
              <input
                type="number"
                min={0}
                max={MAX_PARCELAS}
                value={semJurosAte}
                onChange={(e) => setSemJurosAte(e.target.value)}
                disabled={!podeEditar}
                className="ml-2 h-8 w-16 rounded-md border px-2"
                data-testid="sem-juros-ate"
              />
              <span className="ml-1">x</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t("Até aqui a loja absorve a taxa e o cliente paga o valor à vista dividido. 0 = repassa sempre.")}
              </span>
            </label>
            {podeEditar ? (
              <Button
                className="mt-3"
                size="sm"
                disabled={salvando || lido.ignoradas.length > 0}
                onClick={() =>
                  void salvar(
                    { taxas_texto: texto, sem_acrescimo_ate: Math.min(MAX_PARCELAS, Math.max(0, Number(semJurosAte) || 0)) },
                    t("Taxas salvas"),
                  )
                }
                data-testid="salvar-taxas"
              >
                {t(salvando ? "Salvando…" : "Salvar taxas")}
              </Button>
            ) : null}

            {simulacao.length > 0 ? (
              <div className="mt-4" data-testid="simulacao-de-parcelas">
                <label className="text-xs text-muted-foreground">
                  {t("Simular para um valor à vista de")}
                  <input
                    value={valorDeTeste}
                    onChange={(e) => setValorDeTeste(e.target.value)}
                    className="ml-2 h-7 w-28 rounded-md border px-2 text-xs"
                  />
                </label>
                <table className="mt-2 w-full text-xs">
                  <tbody>
                    {simulacao.map((s) => (
                      <tr key={String(s.opcao)} className="border-t">
                        <td className="py-1">
                          {s.opcao === "debito"
                            ? t("Débito")
                            : s.opcao === 1
                              ? t("Crédito à vista")
                              : `${s.opcao}x`}
                          {s.sem_acrescimo ? ` · ${t("sem juros")}` : ""}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {typeof s.opcao === "number" && s.opcao > 1
                            ? `${s.opcao}x ${formatCents(s.parcela_cents, regua.moeda)} = `
                            : ""}
                          {formatCents(s.total_cents, regua.moeda)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
