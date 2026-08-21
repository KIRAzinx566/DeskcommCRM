/**
 * Marca da instalação — nome e logo configuráveis pelo `.env`, SEM rebuild.
 *
 * Por que existe: quem instala o DeskcommCRM para clientes (agência, revendedor)
 * precisa da própria marca na interface. Fazer isso editando o código quebraria o
 * caminho de atualização — `update.sh` puxa a imagem nova e o patch local se perde,
 * que é exatamente a dor nº 1 de quem hospeda o próprio sistema. Configuração em
 * `.env` sobrevive a toda atualização.
 *
 * Vale para servidor (`process.env`) e navegador (`window.__PUBLIC_ENV__`, injetado
 * em runtime pelo `<PublicEnvScript/>`) — mesmo modelo de `lib/sentry/dsn.ts`.
 *
 * As variáveis NÃO são `NEXT_PUBLIC_*` de propósito: essas são queimadas no bundle
 * durante o `next build`, e o self-hoster roda uma imagem PRÉ-BUILDADA. A marca dele
 * nunca apareceria. É o mesmo motivo pelo qual a URL do Supabase é injetada em
 * runtime em vez de lida do bundle.
 */

export const DEFAULT_APP_NAME = "DeskcommCRM";

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export type Branding = {
  /** Nome exibido na interface e nos títulos de página. */
  name: string;
  /** URL do logo, ou `null` quando a marca deve aparecer como texto. */
  logoUrl: string | null;
  /** Primeira letra do nome — usada onde só cabe um caractere (sidebar recolhida). */
  initial: string;
  /**
   * Cor de destaque (botões, navegação ativa, foco) em hex normalizado
   * (#rrggbb), ou `null` para usar a paleta Sage padrão. Só a cor semântica
   * `--color-accent` é trocada — a escala de 11 tons (50-950, usada em tints/
   * hovers) continua a do design system. Trocar a escala inteira por uma cor
   * arbitrária do operador arriscaria contraste ruim em algum dos 11 tons sem
   * ninguém revisar; a cor semântica sozinha já é o que aparece nos elementos
   * que mais carregam marca (botão primário, item ativo da sidebar).
   */
  accentColor: string | null;
  /** Cor de texto legível sobre `accentColor` (branco ou quase-preto, por contraste). `null` quando `accentColor` é `null`. */
  accentForeground: string | null;
};

/** #abc → #aabbcc. Só chamada depois de validar o formato. */
function expandShorthandHex(hex: string): string {
  if (hex.length !== 4) return hex.toLowerCase();
  const [, r, g, b] = hex;
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

/**
 * Luminância relativa (WCAG) → escolhe texto branco ou quase-preto por cima da
 * cor. Quase-preto (não #000 puro) para bater com `--color-text` do design
 * system em vez de um preto mais duro que destoaria ao lado do resto da UI.
 */
function readableForeground(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.4 ? "#1c1a16" : "#ffffff";
}

/**
 * `null` quando não é um hex válido — nunca aplica cor inválida ao CSS.
 * Exportada para o schema de branding por org (lib/schemas/settings.ts)
 * validar o mesmo formato antes de gravar — uma regra de "hex válido" só.
 */
export function validateAccentColor(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  if (!HEX_COLOR_RE.test(trimmed)) return null;
  return expandShorthandHex(trimmed);
}

/**
 * Resolve a marca a partir dos valores crus. Função pura: recebe a fonte, não a
 * procura — assim o mesmo resolvedor serve servidor, navegador e teste.
 *
 * Valor vazio ou só com espaços cai no padrão. Isso importa porque `.env` gerado
 * por script costuma trazer a chave declarada e vazia (`APP_NAME=`), e tratar isso
 * como "marca sem nome" deixaria a interface em branco.
 */
export function resolveBranding(
  name: string | undefined | null,
  logoUrl: string | undefined | null,
  accentColor?: string | undefined | null,
): Branding {
  const resolvedName = (name ?? "").trim() || DEFAULT_APP_NAME;
  const resolvedLogo = (logoUrl ?? "").trim();
  const resolvedAccent = validateAccentColor(accentColor);
  return {
    name: resolvedName,
    logoUrl: resolvedLogo.length > 0 ? resolvedLogo : null,
    // Spread em vez de [0]: nome começando com emoji ou acento composto quebraria
    // no meio do code point e renderizaria caractere inválido.
    initial: ([...resolvedName][0] ?? DEFAULT_APP_NAME[0]!).toUpperCase(),
    accentColor: resolvedAccent,
    accentForeground: resolvedAccent ? readableForeground(resolvedAccent) : null,
  };
}

/**
 * A marca da instalação — **SOMENTE em componente de servidor.**
 *
 * ⚠️ NÃO CHAME ISTO DE UM `"use client"`. Em client component use
 * `useMarcaDaInstalacao()` (`lib/branding/contexto.tsx`), que recebe a marca por
 * prop do servidor. A regra é vigiada por
 * `tests/unit/marca-sem-divergencia-de-hidratacao.test.tsx`, que varre todo
 * arquivo `"use client"` — comentário não reprova build, teste reprova.
 *
 * ── Por que a regra existe ───────────────────────────────────────────────────
 *
 * Esta função lê fontes DIFERENTES nos dois lados da fronteira, e as duas
 * deixaram de concordar. No navegador ela lê `window.__PUBLIC_ENV__`, que desde
 * a onda do logo carrega a marca RESOLVIDA (banco acima do `.env`). No servidor
 * — inclusive no SSR de um client component, onde `window` não existe — ela lê
 * `process.env`, que é só o `.env`. Numa instalação com logo gravado pela tela e
 * `APP_LOGO_URL` vazio (o caso normal de quem sobe logo pela tela), o SSR
 * renderizava o nome em `<span>` e o cliente hidratava um `<img>`: troca de tipo
 * de elemento, React #418 em toda tela, árvore descartada e regerada.
 *
 * No SERVIDOR o comportamento é correto e é DELIBERADO: o texto sob o "Entrar"
 * sai daqui (o `.env`) enquanto o título da aba sai do banco, e
 * `tests/e2e/icone-da-marca.spec.ts:64-77` cruza as duas resoluções de propósito
 * — é o que faz "trocar o nome pela tela e a aba não acompanhar" reprovar. Por
 * isso o defeito se fecha tirando os client components daqui, e não mudando o
 * que esta função devolve.
 *
 * O ramo do navegador continua de pé porque a alternativa é pior: sem ele, um
 * client component que voltasse a chamar `branding()` cairia no padrão do
 * produto nos DOIS lados e mostraria a marca errada em SILÊNCIO. Divergir é
 * barulhento (o console acusa), e barulhento é o modo de falhar que se conserta.
 */
export function branding(): Branding {
  if (typeof window !== "undefined") {
    const runtime = window.__PUBLIC_ENV__;
    return resolveBranding(runtime?.APP_NAME, runtime?.APP_LOGO_URL, runtime?.APP_ACCENT_COLOR);
  }
  return resolveBranding(process.env.APP_NAME, process.env.APP_LOGO_URL, process.env.APP_ACCENT_COLOR);
}
