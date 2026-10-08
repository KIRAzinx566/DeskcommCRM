/**
 * O GRUPO DE VENDAS — lê o que a equipe já escreve no grupo do WhatsApp e
 * transforma em lançamento de caixa.
 *
 * Veio do Orquestra (a loja de celular): o vendedor fecha a venda e posta no
 * grupo da loja "iPhone 13 128GB vendido por R$ 2.100 no pix"; o motoboy posta
 * "paguei entrega R$ 25". O caixa se monta sozinho, sem ninguém redigitar. Lá o
 * leitor só conhecia iPhone; aqui ele lê o FORMATO, não o produto: uma linha com
 * verbo de venda (ou de gasto) e UM valor.
 *
 * ─── Ambíguo não vira lançamento ───────────────────────────────────────────
 *
 * Lançamento errado no caixa é pior que lançamento faltando: o faltando a
 * equipe percebe e lança; o errado fica, e o fechamento do mês mente. Por isso:
 *
 *   - linha sem verbo de venda nem de gasto é conversa, e é ignorada;
 *   - linha com dois valores possíveis ("2 capinhas por 50 e 1 película por
 *     30") é ignorada — o leitor não escolhe qual dos dois;
 *   - valor fora de 1 real a 10 milhões é erro de digitação, e é ignorado.
 *
 * Quem chama recebe `ignoradas` para contar (e mostrar), nunca para adivinhar.
 *
 * ─── Venda manda no verbo ──────────────────────────────────────────────────
 *
 * "vendido por 2100 PAGO no pix" é uma venda: "pago" ali é a forma de
 * pagamento. Só é saída a linha que fala de gasto SEM falar de venda.
 *
 * Pura e testável: nenhum acesso a banco.
 */

export type DirecaoDoLancamento = "in" | "out";

export interface LancamentoLido {
  /** Índice da linha na mensagem — é o que torna o lançamento idempotente por mensagem. */
  linha: number;
  direcao: DirecaoDoLancamento;
  valorCents: number;
  /** "pix", "dinheiro", "cartão", "débito", "crédito", "transferência" — ou null. */
  forma: string | null;
  descricao: string;
}

export interface LeituraDoGrupo {
  lancamentos: LancamentoLido[];
  /** Linhas que falavam de venda/gasto mas não deu para ler com segurança. */
  ignoradas: number;
}

const VENDA = /\b(vend(?:i|ido|ida|idos|idas|eu|emos|a|as)|recebi|recebido|recebida)\b/i;
const GASTO =
  /\b(pague[i]|pagamos|despesa|despesas|gasto|gastos|gastei|comprei|comprado|comprada|compra|custo|sa[ií]da|retirada|sangria)\b/i;
const FORMAS: Array<[RegExp, string]> = [
  [/\bpix\b/i, "pix"],
  [/\bdinheiro\b|\besp[eé]cie\b/i, "dinheiro"],
  [/\bd[eé]bito\b/i, "débito"],
  [/\bcr[eé]dito\b/i, "crédito"],
  [/\bcart[aã]o\b|\bmaquininha\b/i, "cartão"],
  [/\btransfer[eê]ncia\b|\bted\b/i, "transferência"],
];

/** "2.100,00" → 210000 · "2100" → 210000 · "9.290" → 929000 · "2100,5" → 210050. */
export function valorEmCentavos(texto: string): number | null {
  const s = texto.trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let reais: number;
  if (/,\d{1,2}$/.test(s)) reais = Number(s.replace(/\./g, "").replace(",", "."));
  else if (/\.\d{1,2}$/.test(s) && !/\.\d{3}$/.test(s)) reais = Number(s.replace(/,/g, ""));
  else reais = Number(s.replace(/[.,]/g, ""));
  if (!Number.isFinite(reais)) return null;
  return Math.round(reais * 100);
}

const limpar = (t: string) =>
  t
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[*_~`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Onde pode estar o valor, em ordem de confiança: depois de "R$"; depois de
 * "por", "valor", "=" ou ":"; logo depois do verbo ("vendido 9290").
 *
 * NÃO existe o nível "qualquer número da linha": em "vendi o iphone 15 do
 * Carlos" ele faria do modelo uma venda de R$ 15 — exatamente o lançamento
 * errado que este leitor existe para não criar.
 */
function candidatos(linha: string): string[][] {
  const comCifrao = [...linha.matchAll(/r\$\s*(\d[\d.,]*)/gi)].map((m) => m[1]!);
  const aposMarcador = [...linha.matchAll(/(?:\bpor\b|\bvalor\b|=|:)\s*(?:r\$\s*)?(\d[\d.,]*)/gi)].map((m) => m[1]!);
  const aposVerbo = [
    ...linha.matchAll(
      /\b(?:vend\w*|recebi\w*|pague\w*|gastei|comprei|comprad\w*|custo)\s+(\d[\d.,]*)(?!\s*(?:gb|tb|x\b|%|un|unid|pe[cç]as?|capinhas?))/gi,
    ),
  ].map((m) => m[1]!);
  return [comCifrao, aposMarcador, aposVerbo];
}

function escolherValor(linha: string): number | null {
  const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.replace(/[.,]$/, "")))];
  for (const grupo of candidatos(linha)) {
    const u = unicos(grupo);
    if (u.length === 1) return valorEmCentavos(u[0]!);
    // Dois valores no mesmo nível de confiança: não escolhe.
    if (u.length > 1) return null;
  }
  return null;
}

const MINIMO = 100; // R$ 1,00
const MAXIMO = 1_000_000_000; // R$ 10 milhões

function descricaoDa(linha: string): string {
  const semValor = linha
    .replace(/r\$\s*\d[\d.,]*/gi, " ")
    .replace(/(?:\bpor\b|\bvalor\b|=|:)\s*\d[\d.,]*/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, "")
    .trim();
  return (semValor || linha).slice(0, 140);
}

/** Lê uma mensagem do grupo. Uma linha, no máximo um lançamento. */
export function lerMensagemDoGrupo(texto: string): LeituraDoGrupo {
  const lancamentos: LancamentoLido[] = [];
  let ignoradas = 0;
  String(texto ?? "")
    .split(/\r?\n/)
    .forEach((bruta, linha) => {
      const l = limpar(bruta);
      if (!l) return;
      const ehVenda = VENDA.test(l);
      const ehGasto = !ehVenda && GASTO.test(l);
      if (!ehVenda && !ehGasto) return; // conversa
      const valorCents = escolherValor(l);
      if (valorCents === null || valorCents < MINIMO || valorCents > MAXIMO) {
        ignoradas += 1;
        return;
      }
      const forma = FORMAS.find(([re]) => re.test(l))?.[1] ?? null;
      lancamentos.push({ linha, direcao: ehVenda ? "in" : "out", valorCents, forma, descricao: descricaoDa(l) });
    });
  return { lancamentos, ignoradas };
}
