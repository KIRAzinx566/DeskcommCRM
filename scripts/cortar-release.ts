/**
 * Corta a release: lê os fragmentos de `.changes/`, calcula o número, monta a
 * seção do CHANGELOG e apaga os fragmentos consumidos.
 *
 * Ninguém digita o número. Essa é a propriedade que faz duas sessões de
 * trabalho paralelas não colidirem: enquanto a escolha era humana, ela dependia
 * de ler `git tag` e somar um — e duas sessões que leem a mesma lista no mesmo
 * dia chegam ao mesmo número.
 *
 * Casca fina de I/O: a decisão toda mora em `lib/release/`, que é typechecado
 * (`tsconfig.typecheck.json` exclui `scripts/**`, então lógica aqui chegaria
 * verde na `main` sem `tsc` nunca a ter olhado).
 *
 *   pnpm release:conferir     # não escreve; diz que número sairia
 *   pnpm release:cortar       # escreve o CHANGELOG e apaga os fragmentos
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { calcularBump, type Fragmento, parseFragmento, proximaVersao } from "../lib/release/fragmento";
import { aplicarNoChangelog, montarSecao } from "../lib/release/montar-secao";

const RAIZ = path.resolve(__dirname, "..");
const DIR_FRAGMENTOS = path.join(RAIZ, ".changes");
const CHANGELOG = path.join(RAIZ, "CHANGELOG.md");

/**
 * `owner/repo` de ONDE ESTE CLONE REALMENTE PUBLICA — nunca hardcoded.
 *
 * Já foi `"melgarafael/DeskcommCRM"` cravado: correto só para quem roda este
 * script NO upstream. Todo fork que sincroniza com ele (este, por exemplo)
 * herda o mesmo hardcode a cada merge — porque a constante existe também no
 * lado deles, com o valor deles — e passa a gerar link de comparação para o
 * repositório ERRADO na sua própria release (medido: a seção `## [1.13.0]`
 * deste fork nasceu apontando para `melgarafael/DeskcommCRM/compare/...`).
 * Derivar do remoto `origin` resolve certo nos dois lados sem exigir edição
 * manual a cada sincronização — a mesma lógica, resultado diferente por repo.
 */
function repoDeOrigin(): string {
  const url = execFileSync("git", ["remote", "get-url", "origin"], { cwd: RAIZ, encoding: "utf8" }).trim();
  const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!m?.[1]) throw new Error(`remoto "origin" não parece GitHub: ${url}`);
  return m[1];
}

const REPO = repoDeOrigin();

const compararUrl = (de: string, para: string) => `https://github.com/${REPO}/compare/${de}...${para}`;

/** `.gitkeep` e qualquer não-`.md` ficam de fora; o diretório guarda só fragmento. */
export function arquivosDeFragmento(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

function lerFragmentos(dir: string): Fragmento[] {
  const problemas: string[] = [];
  const lidos: Fragmento[] = [];
  for (const arquivo of arquivosDeFragmento(dir)) {
    try {
      lidos.push(parseFragmento(arquivo, fs.readFileSync(path.join(dir, arquivo), "utf8")));
    } catch (erro) {
      problemas.push(`  ${arquivo}: ${erro instanceof Error ? erro.message : String(erro)}`);
    }
  }
  if (problemas.length > 0) {
    throw new Error(`fragmento(s) inválido(s):\n${problemas.join("\n")}`);
  }
  return lidos;
}

/**
 * Tags `vX.Y.Z` PUBLICADAS em `origin` — nunca `git tag --list` local. Um
 * clone que também tem `upstream` configurado (ex.: para sincronizar) recebe
 * as tags DELES no mesmo namespace local (`refs/tags/`) ao dar `fetch`; ler
 * local misturaria as duas numerações sem nenhum aviso. `ls-remote` consulta
 * o remoto na hora, sem depender do que este clone já buscou.
 */
function tagsPublicadas(): string[] {
  try {
    const saida = execFileSync("git", ["ls-remote", "--tags", "origin"], { cwd: RAIZ, encoding: "utf8" });
    return saida
      .split("\n")
      .map((l) => /refs\/tags\/v(\d+\.\d+\.\d+)(?:\^\{\})?$/.exec(l.trim())?.[1])
      .filter((v): v is string => Boolean(v))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => {
        const [A, B] = [a.split(".").map(Number), b.split(".").map(Number)];
        return (A[0]! - B[0]!) || (A[1]! - B[1]!) || (A[2]! - B[2]!);
      });
  } catch {
    return [];
  }
}

/**
 * A base é a maior tag já publicada em `origin` — NUNCA a primeira seção
 * `## [X.Y.Z]` do CHANGELOG.
 *
 * Motivo, medido: o CHANGELOG carrega, acima da numeração DESTE fork, um
 * bloco de releases HISTÓRICAS do upstream ainda não incorporadas (comentário
 * logo abaixo de `## [Não lançado]`) — mesma FORMA de heading
 * (`## [1.18.1]`, `## [1.17.0]`...), conteúdo de outro repositório. Ler
 * heading por heading a partir do topo pega a mais nova DESSAS, não a última
 * que este fork de fato publicou — foi assim que a primeira sincronização
 * com este bloco calculou "1.19.0" a partir de "1.18.1", quando a base real
 * deste fork era 1.13.0. Tag é o único dado que não confunde as duas
 * numerações: só existe tag `origin` aqui para o que ESTE fork publicou.
 *
 * O CHANGELOG entra como fallback só para um repo sem nenhuma tag ainda
 * (instalação nova do zero) — e nesse caso não há bloco histórico de outro
 * repositório para confundir a varredura.
 */
function versaoBase(changelog: string): string {
  const ultima = tagsPublicadas().at(-1);
  if (ultima) return ultima;
  for (const linha of changelog.split("\n")) {
    const m = /^##\s+\[(\d+\.\d+\.\d+)\]/.exec(linha);
    if (m?.[1]) return m[1];
  }
  throw new Error("CHANGELOG.md sem nenhuma seção `## [X.Y.Z]`, e nenhuma tag em origin");
}

/**
 * O número que está no TOPO do CHANGELOG agora — nunca confundir com
 * `versaoBase()`. Usada só por `--versao-do-changelog`, que o job de CI
 * chama DEPOIS que um commit de release já escreveu a seção nova: nesse
 * momento a tag ainda não existe (é o job que está prestes a criá-la), então
 * `versaoBase()` (que lê tags) devolveria a release ANTERIOR — a que já tem
 * tag —, não a que acabou de ser cortada.
 *
 * O heading-scan simples resolve certo aqui porque `aplicarNoChangelog`
 * sempre insere a seção nova logo abaixo de `## [Não lançado]`, ou seja, ela
 * é sempre a primeira `## [X.Y.Z]` do arquivo assim que existe — mesmo
 * quando o número coincide com uma release histórica do upstream mais abaixo
 * (ver o comentário em `montarSecao`).
 */
function versaoDoTopoDoChangelog(changelog: string): string {
  for (const linha of changelog.split("\n")) {
    const m = /^##\s+\[(\d+\.\d+\.\d+)/.exec(linha);
    if (m?.[1]) return m[1];
  }
  throw new Error("CHANGELOG.md sem nenhuma seção `## [X.Y.Z]`");
}

function hoje(): string {
  // Data local, não UTC: a seção é lida por quem opera no Brasil, e `toISOString`
  // vira o dia anterior a cada release cortada depois das 21h.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function main(argv: readonly string[]): number {
  const escrever = argv.includes("--escrever");
  const soAVersao = argv.includes("--versao-do-changelog");
  const conhecidos = new Set(["--escrever", "--versao-do-changelog"]);
  const desconhecido = argv.find((a) => !conhecidos.has(a));
  if (desconhecido) {
    process.stderr.write(`argumento desconhecido: ${desconhecido}\n`);
    return 2;
  }

  // O workflow de release usa isto para saber se o merge que acabou de entrar
  // na main trouxe uma versão nova. Imprime só o número, sem mais nada, para
  // caber num `$(...)`.
  if (soAVersao) {
    process.stdout.write(`${versaoDoTopoDoChangelog(fs.readFileSync(CHANGELOG, "utf8"))}\n`);
    return 0;
  }

  const fragmentos = lerFragmentos(DIR_FRAGMENTOS);
  const changelog = fs.readFileSync(CHANGELOG, "utf8");
  const base = versaoBase(changelog);

  if (fragmentos.length === 0) {
    const tag = tagsPublicadas().at(-1) ?? null;
    // Terceiro desfecho, e não uma recusa: depois de `--escrever` o estado
    // normal da branch de release é exatamente este — `.changes/` vazio e a
    // seção nova à frente da última tag, porque a tag só nasce no merge.
    if (tag && tag !== base) {
      process.stdout.write(`já cortado: ${base} aguarda a tag (última publicada: ${tag})\n`);
      return 0;
    }
    process.stderr.write(
      "nenhum fragmento em `.changes/`: não há versão a cortar.\n" +
        "Todo PR que muda comportamento traz o seu — docs/doctrine/versionamento.md.\n",
    );
    return 1;
  }

  const bump = calcularBump(fragmentos.map((f) => f.impacto));
  const versao = proximaVersao(base, bump);
  const secao = montarSecao(fragmentos, versao, hoje());

  process.stdout.write(`${base} + ${bump} = ${versao}  (${fragmentos.length} fragmento(s))\n`);
  for (const f of fragmentos) {
    process.stdout.write(`  ${f.impacto.padEnd(16)} ${f.secao.padEnd(11)} ${f.titulo}\n`);
  }

  if (!escrever) {
    process.stdout.write("\n(conferência: nada foi escrito — use --escrever)\n");
    return 0;
  }

  fs.writeFileSync(CHANGELOG, aplicarNoChangelog(changelog, secao, base, compararUrl));
  for (const f of fragmentos) fs.rmSync(path.join(DIR_FRAGMENTOS, f.arquivo));
  process.stdout.write(`\nCHANGELOG.md atualizado; ${fragmentos.length} fragmento(s) consumido(s).\n`);
  process.stdout.write("A tag NÃO é criada aqui — ela nasce no CI, do merge do PR de release.\n");
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (erro) {
    process.stderr.write(`${erro instanceof Error ? erro.message : String(erro)}\n`);
    process.exit(1);
  }
}
