/**
 * A TABELA DO DIA — preço que ninguém conferiu hoje não sai para o cliente.
 *
 * Veio da loja de celular (a Bia, do Orquestra): preço e estoque de aparelho
 * mudam DURANTE o dia, e a tabela de ontem passada a um cliente hoje é promessa
 * que a loja terá de cumprir ou desfazer. A régua da loja era simples — "a
 * tabela é a de hoje ou não é" —, e é ela que mora aqui.
 *
 * ─── Desligada por padrão ──────────────────────────────────────────────────
 *
 * Uma clínica não reconfere preço de consulta todo dia, e nem deve: para ela a
 * tabela não vence. Por isso `validade` nasce `desligada`, e o comportamento de
 * quem nunca abriu esta configuração é EXATAMENTE o de antes — o agente passa o
 * preço cadastrado. Só a organização que liga `mesmo_dia` passa a exigir a
 * conferência diária.
 *
 * ─── O que conta como "conferida" ─────────────────────────────────────────
 *
 * Duas portas, e só duas: importar a planilha inteira sem erro (a loja mandou a
 * tabela do dia) ou o botão "os preços de hoje estão certos" na tela de
 * Produtos. Editar UM produto não confere a tabela: os outros continuam sem
 * ninguém ter olhado.
 *
 * O dia é o do FUSO DA ORGANIZAÇÃO, nunca o do servidor: a VPS roda em UTC, e
 * às 21h de Brasília já é amanhã em UTC — a tabela conferida às 20h venceria
 * uma hora depois.
 *
 * Mora em `organizations.settings.catalogo`. Quem lê usa `lerConfigDaTabela`,
 * e quem escreve usa o mesmo schema: ninguém lê o caminho do jsonb na mão.
 */
import { z } from "zod";

import { FUSO_PADRAO, fusoValido } from "@/lib/tempo/fusos";

export const VALIDADES_DA_TABELA = ["desligada", "mesmo_dia"] as const;
export type ValidadeDaTabela = (typeof VALIDADES_DA_TABELA)[number];

/**
 * O que fica gravado. `.catch` em cada campo: um valor torto no jsonb (escrito
 * à mão, ou por uma versão futura) vira o padrão — desligada, nunca conferida —
 * em vez de lançar no turno do agente.
 */
export const configDaTabelaSchema = z.object({
  validade: z.enum(VALIDADES_DA_TABELA).catch("desligada"),
  conferida_em: z.string().datetime({ offset: true }).nullable().catch(null),
});
export type ConfigDaTabela = z.infer<typeof configDaTabelaSchema>;

export const CONFIG_DA_TABELA_PADRAO: ConfigDaTabela = { validade: "desligada", conferida_em: null };

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** `organizations.settings` → a configuração da tabela. Pura; nunca lança. */
export function lerConfigDaTabela(settings: unknown): ConfigDaTabela {
  const catalogo = objeto(objeto(settings)?.catalogo);
  if (!catalogo) return CONFIG_DA_TABELA_PADRAO;
  const lido = configDaTabelaSchema.safeParse(catalogo);
  return lido.success ? lido.data : CONFIG_DA_TABELA_PADRAO;
}

export type SituacaoDaTabela =
  | { estado: "sem_validade" }
  | { estado: "em_dia"; conferidaEm: string }
  | { estado: "vencida"; conferidaEm: string | null };

/** O dia civil (AAAA-MM-DD) de um instante, no fuso dado. */
function diaNoFuso(instante: Date, fuso: string): string {
  return instante.toLocaleDateString("en-CA", { timeZone: fuso });
}

/**
 * A tabela vale agora? `fuso` inválido cai no padrão do produto — derrubar o
 * atendimento por um fuso torto seria pior que errar a virada do dia.
 */
export function situacaoDaTabela(config: ConfigDaTabela, agora: Date, fuso: string): SituacaoDaTabela {
  if (config.validade === "desligada") return { estado: "sem_validade" };
  if (!config.conferida_em) return { estado: "vencida", conferidaEm: null };
  const tz = fusoValido(fuso) ? fuso : FUSO_PADRAO;
  const conferida = new Date(config.conferida_em);
  if (Number.isNaN(conferida.getTime())) return { estado: "vencida", conferidaEm: null };
  return diaNoFuso(conferida, tz) === diaNoFuso(agora, tz)
    ? { estado: "em_dia", conferidaEm: config.conferida_em }
    : { estado: "vencida", conferidaEm: config.conferida_em };
}

/** "07/10", no fuso da organização. */
export function diaCurto(iso: string, fuso: string): string {
  const tz = fusoValido(fuso) ? fuso : FUSO_PADRAO;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "2-digit" });
}

/**
 * O que o AGENTE lê quando a tabela venceu. A conduta é a da loja: não passar
 * preço nenhum, dizer que já manda a tabela atualizada, e chamar a equipe — que
 * é quem confere a tabela e responde o cliente com o valor certo.
 */
export function avisoDaTabelaVencidaParaOAgente(
  situacao: Extract<SituacaoDaTabela, { estado: "vencida" }>,
  fuso: string,
): string {
  const quando = situacao.conferidaEm
    ? `a última conferência foi em ${diaCurto(situacao.conferidaEm, fuso)}`
    : "ela nunca foi conferida";
  return (
    `a tabela de preços desta loja NÃO foi conferida hoje (${quando}), e preço muda durante o dia. ` +
    "NÃO passe preço nenhum, nem parcela, nem um valor que você lembra. Diga ao cliente que já envia a " +
    "tabela atualizada e chame a equipe com request_human_handoff, informando o produto que ele quer."
  );
}
