/**
 * COMANDOS DO CANAL DIRETO — `#agente <nome>` e `#agentes`.
 *
 * Mesma família de `lib/escalacao/comando-de-canal.ts` (`#on`/`#off`), mas
 * esses dois carregam ARGUMENTO, então a comparação é por PREFIXO normalizado
 * (trim + minúsculas), não pelo literal inteiro. `#agente` sozinho (sem nome)
 * não é um comando válido — é tratado como mensagem comum, e o dono recebe a
 * mesma resposta de "nenhum agente selecionado ainda" com a lista de nomes.
 *
 * Puro: não toca banco, não depende de relógio.
 */
const PREFIXO_SELECIONAR = "#agente ";
const LISTAR = "#agentes";

export type ComandoDoCanalDireto =
  | { tipo: "selecionar"; nomeDigitado: string }
  | { tipo: "listar" };

/**
 * `null` quando o corpo não é um comando — é correção/pergunta para o agente
 * selecionado (ou, sem seleção, o gatilho para pedir `#agente <nome>`).
 */
export function lerComandoDoCanalDireto(corpo: string | null | undefined): ComandoDoCanalDireto | null {
  if (typeof corpo !== "string") return null;
  const normalizado = corpo.trim().toLowerCase();

  if (normalizado === LISTAR) return { tipo: "listar" };

  if (normalizado.startsWith(PREFIXO_SELECIONAR)) {
    // O nome vem do corpo ORIGINAL (não normalizado) a partir do fim do
    // prefixo normalizado — preserva acentuação e caixa do nome do agente
    // para a resposta de ambiguidade/erro mostrar o que o dono digitou.
    const nomeDigitado = corpo.trim().slice(PREFIXO_SELECIONAR.length).trim();
    if (nomeDigitado.length > 0) return { tipo: "selecionar", nomeDigitado };
  }

  return null;
}
