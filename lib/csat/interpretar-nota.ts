/**
 * Interpreta a resposta de uma pesquisa de CSAT como nota 1-5, ou não
 * interpreta nada.
 *
 * ⚠️ EXIGE O CORPO INTEIRO bater, não uma substring. "bom dia, ainda preciso
 * de ajuda" contém "bom" mas não é uma nota — é o cliente continuando a
 * conversa. Uma resposta que não bate deixa a pesquisa como estava
 * (`pending`); ela nunca é forçada a virar nota errada.
 */

const PALAVRA_PARA_NOTA: Record<string, 1 | 2 | 3 | 4 | 5> = {
  otimo: 5,
  excelente: 5,
  bom: 4,
  regular: 3,
  mediano: 3,
  ruim: 2,
  pessimo: 1,
  horrivel: 1,
};

/** Minúsculo, sem acento, sem pontuação nas pontas, espaços colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/^[!.,;:?"'()\s]+|[!.,;:?"'()\s]+$/g, "");
}

export function interpretarNota(corpo: string): 1 | 2 | 3 | 4 | 5 | null {
  const normalizado = normalizar(corpo);
  if (!normalizado) return null;

  if (/^[1-5]$/.test(normalizado)) return Number(normalizado) as 1 | 2 | 3 | 4 | 5;

  const nota = PALAVRA_PARA_NOTA[normalizado];
  return nota ?? null;
}
