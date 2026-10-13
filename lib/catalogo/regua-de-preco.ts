/**
 * A RÉGUA DE PREÇO como a tela a lê — tabela do dia + taxas do cartão, já
 * resolvidas para a organização. Um formato só para a rota
 * (`/api/v1/settings/precos`) e para a página de Produtos, que a carrega no
 * servidor: as duas mostram a mesma coisa, então montam pelo mesmo lugar.
 *
 * Pura e client-safe (só zod por baixo): quem chama traz a linha da organização.
 */
import {
  lerConfigDaTabela,
  situacaoDaTabela,
  type ConfigDaTabela,
  type SituacaoDaTabela,
} from "@/lib/catalogo/tabela-do-dia";
import {
  lerConfigDoParcelamento,
  textoDaTabelaDeTaxas,
  type ConfigDoParcelamento,
} from "@/lib/financeiro/parcelamento";
import { FUSO_PADRAO } from "@/lib/tempo/fusos";

/** O que a consulta a `organizations` precisa trazer: `settings, timezone, currency`. */
export interface LinhaDaRegua {
  settings: unknown;
  timezone: string | null;
  currency?: string | null;
}

export interface ReguaDaTela {
  tabela: ConfigDaTabela & { situacao: SituacaoDaTabela["estado"] };
  parcelamento: ConfigDoParcelamento & { texto: string };
  fuso: string;
  /** A simulação da tela formata na moeda da loja, a mesma que o agente usa. */
  moeda: string;
}

export function reguaDaTela(linha: LinhaDaRegua | null, agora: Date = new Date()): ReguaDaTela {
  const settings = linha?.settings ?? null;
  const fuso = linha?.timezone || FUSO_PADRAO;
  const tabela = lerConfigDaTabela(settings);
  const parcelamento = lerConfigDoParcelamento(settings);
  return {
    tabela: { ...tabela, situacao: situacaoDaTabela(tabela, agora, fuso).estado },
    parcelamento: { ...parcelamento, texto: textoDaTabelaDeTaxas(parcelamento) },
    fuso,
    moeda: linha?.currency || "BRL",
  };
}
