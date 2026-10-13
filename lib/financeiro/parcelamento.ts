/**
 * O PARCELAMENTO NO CARTÃO — quanto o cliente paga em N vezes, com a taxa da
 * maquininha da loja.
 *
 * Veio da loja de celular (a Bia, do Orquestra), onde a pergunta mais comum
 * depois do preço é "e em 10x, fica quanto?". Sem esta conta o agente ou
 * inventa o valor (e a loja engole a diferença) ou passa toda pergunta de
 * parcela para a equipe. A fórmula é a da planilha que as lojas já usam
 * ("TABELA TAXA CLIENTE 18x"):
 *
 *     A COBRAR = valor à vista / (1 − taxa)        PARCELA = A COBRAR / vezes
 *
 * Isto é, a taxa é REPASSADA: a loja recebe, depois da maquininha, o mesmo que
 * receberia à vista. `sem_acrescimo_ate` cobre a outra prática comum — "até 3x
 * sem juros": até ali a loja absorve a taxa e o cliente paga o valor à vista
 * dividido.
 *
 * ─── Centavos, sempre ──────────────────────────────────────────────────────
 *
 * A conta corre em centavos inteiros e arredonda uma vez, no fim. A parcela é
 * arredondada para o centavo, então `parcela × vezes` pode diferir do total
 * por alguns centavos: os dois números saem, e o agente diz os dois.
 *
 * ─── Sem taxa cadastrada, sem conta ────────────────────────────────────────
 *
 * Uma opção que a loja não cadastrou (ex.: 18x numa tabela que vai até 12x)
 * devolve `null`, nunca um valor estimado a partir das vizinhas: parcela
 * estimada é preço inventado com outro nome.
 *
 * Mora em `organizations.settings.parcelamento`, lida e escrita pelo schema
 * daqui.
 */
import { z } from "zod";

/** O teto de vezes que o produto oferece. Maquininha brasileira vai a 18x, algumas a 21x. */
export const MAX_PARCELAS = 24;

/** Percentual, ex.: 4.29 = 4,29%. Acima de 40% não é taxa de maquininha, é erro de digitação. */
const taxaSchema = z.number().min(0).max(40);

export const configDoParcelamentoSchema = z.object({
  /** Débito, à parte do crédito. `null` = a loja não cadastrou. */
  debito: taxaSchema.nullable().catch(null),
  /** Crédito por número de vezes: `{ "1": 4.29, "2": 5.13, ... }`. "1" é o crédito à vista. */
  credito: z
    .record(z.string().regex(/^\d{1,2}$/), taxaSchema)
    .catch({})
    .transform((r) =>
      Object.fromEntries(
        Object.entries(r).filter(([n]) => Number(n) >= 1 && Number(n) <= MAX_PARCELAS),
      ),
    ),
  /** Até quantas vezes a loja absorve a taxa ("até 3x sem juros"). 0 = repassa sempre. */
  sem_acrescimo_ate: z.number().int().min(0).max(MAX_PARCELAS).catch(0),
});
export type ConfigDoParcelamento = z.infer<typeof configDoParcelamentoSchema>;

export const CONFIG_DO_PARCELAMENTO_PADRAO: ConfigDoParcelamento = {
  debito: null,
  credito: {},
  sem_acrescimo_ate: 0,
};

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `organizations.settings` → a configuração do parcelamento. Pura; nunca lança. */
export function lerConfigDoParcelamento(settings: unknown): ConfigDoParcelamento {
  const bruto = objeto(objeto(settings)?.parcelamento);
  if (!bruto) return CONFIG_DO_PARCELAMENTO_PADRAO;
  const lido = configDoParcelamentoSchema.safeParse(bruto);
  return lido.success ? lido.data : CONFIG_DO_PARCELAMENTO_PADRAO;
}

/** A loja cadastrou alguma taxa? Sem nenhuma, o agente não simula nada. */
export function temTaxas(config: ConfigDoParcelamento): boolean {
  return config.debito !== null || Object.keys(config.credito).length > 0;
}

/** Vezes de crédito cadastradas, em ordem. */
export function vezesCadastradas(config: ConfigDoParcelamento): number[] {
  return Object.keys(config.credito)
    .map(Number)
    .sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// ler a tabela que a loja cola
// ---------------------------------------------------------------------------

const numero = (s: string) => Number(s.replace(",", "."));

/**
 * Lê a tabela do jeito que a maquininha (ou a planilha da loja) a escreve:
 *
 *     Débito – 2,29%
 *     Crédito à Vista – 4,29%
 *     2x – 5,13%
 *
 * Qualquer traço, vírgula ou ponto. Linha que não se lê é IGNORADA e devolvida
 * em `ignoradas`, para a tela mostrar — nunca adivinhada.
 */
export function lerTabelaDeTaxas(texto: string): {
  debito: number | null;
  credito: Record<string, number>;
  ignoradas: string[];
} {
  let debito: number | null = null;
  const credito: Record<string, number> = {};
  const ignoradas: string[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const pct = linha.match(/(\d{1,2}(?:[.,]\d{1,3})?)\s*%/);
    const taxa = pct ? numero(pct[1]!) : NaN;
    if (!(taxa >= 0 && taxa <= 40)) {
      ignoradas.push(linha);
      continue;
    }
    if (/d[eé]bito/i.test(linha)) {
      debito = taxa;
      continue;
    }
    if (/[àa]\s*vista/i.test(linha)) {
      credito["1"] = taxa;
      continue;
    }
    const vezes = linha.match(/(?:^|\D)(\d{1,2})\s*x/i);
    const n = vezes ? Number(vezes[1]) : NaN;
    if (n >= 1 && n <= MAX_PARCELAS) credito[String(n)] = taxa;
    else ignoradas.push(linha);
  }
  return { debito, credito, ignoradas };
}

const pctTexto = (t: number) => `${String(t).replace(".", ",")}%`;

/** O caminho de volta: a tabela gravada, no formato que a tela mostra para edição. */
export function textoDaTabelaDeTaxas(config: Pick<ConfigDoParcelamento, "debito" | "credito">): string {
  const linhas: string[] = [];
  if (config.debito !== null) linhas.push(`Débito – ${pctTexto(config.debito)}`);
  for (const n of Object.keys(config.credito).map(Number).sort((a, b) => a - b)) {
    const taxa = config.credito[String(n)]!;
    linhas.push(n === 1 ? `Crédito à vista – ${pctTexto(taxa)}` : `${n}x – ${pctTexto(taxa)}`);
  }
  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// simular
// ---------------------------------------------------------------------------

export type OpcaoDePagamento = "debito" | number;

export interface Simulacao {
  opcao: OpcaoDePagamento;
  /** A taxa da maquininha para esta opção, em %. */
  taxa: number;
  /** A loja absorve a taxa nesta opção ("sem juros"). */
  sem_acrescimo: boolean;
  /** Quanto o cliente paga ao todo. */
  total_cents: number;
  /** Quanto o cliente paga em cada vez. Débito e crédito à vista: igual ao total. */
  parcela_cents: number;
}

/**
 * Uma opção. `null` quando a loja não cadastrou a taxa dela ou o valor não é
 * positivo — nunca um valor estimado.
 */
export function simularOpcao(
  valorAVistaCents: number,
  opcao: OpcaoDePagamento,
  config: ConfigDoParcelamento,
): Simulacao | null {
  if (!Number.isInteger(valorAVistaCents) || valorAVistaCents <= 0) return null;
  const taxa = opcao === "debito" ? config.debito : config.credito[String(opcao)];
  if (taxa === null || taxa === undefined) return null;
  const vezes = opcao === "debito" ? 1 : opcao;
  const semAcrescimo = opcao !== "debito" && vezes <= config.sem_acrescimo_ate;
  const total = semAcrescimo ? valorAVistaCents : Math.round(valorAVistaCents / (1 - taxa / 100));
  return {
    opcao,
    taxa,
    sem_acrescimo: semAcrescimo,
    total_cents: total,
    parcela_cents: vezes === 1 ? total : Math.round(total / vezes),
  };
}

/** Todas as opções cadastradas: débito primeiro, depois o crédito de 1x em diante. */
export function simularTodas(valorAVistaCents: number, config: ConfigDoParcelamento): Simulacao[] {
  const opcoes: OpcaoDePagamento[] = [
    ...(config.debito !== null ? (["debito"] as const) : []),
    ...vezesCadastradas(config),
  ];
  return opcoes
    .map((o) => simularOpcao(valorAVistaCents, o, config))
    .filter((s): s is Simulacao => s !== null);
}
