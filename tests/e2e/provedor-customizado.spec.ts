/**
 * O provedor "custom" (API compatível com OpenAI, endereço escolhido por quem
 * administra) — pela tela, nos dois lugares onde ele passou a existir.
 *
 * Bloco 1 (editor de agente, `AgentForm.tsx`): escolher "API customizada" faz
 * aparecer o campo de endereço com a moldura de OBRIGATÓRIO (diferente de
 * OpenRouter/NVIDIA, onde o mesmo campo é opcional); deixá-lo vazio bloqueia o
 * botão de salvar com a mensagem certa; preenchê-lo some com o erro. Também
 * prova que o seletor de credencial reconhece "custom" como provedor real
 * (mostra "nenhuma credencial custom cadastrada", não "provedor desconhecido").
 * Reusa o agente já seedado por `capacidades-do-agente.spec.ts` mas NUNCA clica
 * em "Salvar rascunho": sem chave "custom" cadastrada na organização de teste,
 * um save real publicaria uma versão inválida no rascunho compartilhado. A
 * troca de provedor fica só em memória (React state); a página recarrega no
 * fim e o rascunho no banco não muda uma vírgula.
 *
 * Bloco 2 (painel de Provedores, `PainelDeProvedores.tsx`): aqui SIM até o
 * banco — o binding de ponto auxiliar não exige credencial para salvar (o
 * campo é opcional, cai no padrão da instalação), então dá para provar a volta
 * completa: escolher "custom", preencher endereço, salvar, navegar de novo e
 * ler o valor persistido — a mesma prova que `prova-painel-provedores.spec.ts`
 * já faz para OpenRouter. Usa o ponto `sentiment_classify` (nenhum outro spec
 * do repo mexe nele) porque `stage_classifier`/`operator_turn` já são o molde
 * de outros casos naquele arquivo.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin, type CredsE2E } from "./helpers/login-admin";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), "evidence", "ia-360-w1");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { email: string }>;
  admin_totp?: { secret: string };
  capacidades?: { agent_id: string; version_id: string };
}

function seed(script: string): void {
  execFileSync("npx", ["tsx", `scripts/${script}`], { stdio: "inherit" });
}

function loadCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) seed("seed-e2e-credentials.ts");
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.users?.manager) {
    seed("seed-e2e-credentials.ts");
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  if (!c.capacidades) {
    seed("seed-e2e-followup-agent.ts");
    seed("seed-e2e-capacidades.ts");
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

let creds = loadCreds();
const AGENTE = creds.capacidades!.agent_id;

async function entrarComoAdmin(page: Page): Promise<void> {
  creds = (await loginComoAdmin(page, creds)) as typeof creds;
}

test.beforeEach(() => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
});

// 240s: mesmo orçamento de capacidades-do-agente.spec.ts, pelo mesmo motivo —
// o login pode disparar uma re-semeadura de credenciais (banco compartilhado).
test.describe.configure({ timeout: 240_000 });

test.describe("Provedor 'API customizada' no editor de agente", () => {
  test("endereço nasce obrigatório, bloqueia o salvar vazio, e some o erro ao preencher", async ({
    page,
  }) => {
    await entrarComoAdmin(page);
    await page.goto(`/app/ai/agents/${AGENTE}`);
    await page.getByTestId("tool-picker").waitFor({ state: "visible", timeout: 90_000 });

    // Antes de trocar: nem o campo de endereço nem o aviso de "sem credencial
    // custom" existem — o provedor seedado é anthropic.
    await expect(page.locator("#base_url")).toHaveCount(0);

    const provider = page.locator("#provider");
    await provider.click();
    await page.getByRole("option", { name: /API customizada/i }).click();
    await expect(provider).toContainText(/API customizada/i);

    // O campo aparece com a moldura de OBRIGATÓRIO — diferente da moldura
    // "opcional" que OpenRouter/NVIDIA usam para o mesmo campo.
    const baseUrl = page.locator("#base_url");
    await expect(baseUrl).toBeVisible();
    await expect(page.getByText(/Endereço do endpoint \(obrigatório\)/i)).toBeVisible();

    // Trocar de provedor reseta a credencial — e o seletor reconhece "custom"
    // como provedor de verdade (mensagem nomeia o provedor, não "desconhecido").
    await expect(page.getByText(/Nenhuma credencial custom cadastrada/i)).toBeVisible();

    // Vazio: bloqueia o salvar com a mensagem certa.
    const salvar = page.getByRole("button", { name: /salvar rascunho/i });
    await expect(salvar).toBeDisabled();
    await expect(
      page.getByText(/Provider customizado exige o endereço do endpoint/i),
    ).toBeVisible();

    await page.screenshot({
      path: path.join(EVIDENCIA, "provedor-custom-01-vazio-bloqueado.png"),
      fullPage: true,
    });

    // Preenche: o erro específico do campo some (o botão pode seguir
    // desabilitado por falta de credencial — isso não é o que este caso mede).
    await baseUrl.fill("https://meu-gateway.exemplo.com/v1");
    await expect(
      page.getByText(/Provider customizado exige o endereço do endpoint/i),
    ).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVIDENCIA, "provedor-custom-02-preenchido.png"),
      fullPage: true,
    });

    // Nunca salva: recarrega para devolver o rascunho compartilhado exatamente
    // como encontrou (mudança só existiu em memória).
    await page.reload();
    await page.getByTestId("tool-picker").waitFor({ state: "visible", timeout: 90_000 });
    await expect(page.locator("#base_url")).toHaveCount(0);
  });
});

test.describe("Provedor 'API customizada' no painel de Provedores", () => {
  let credsPanel: CredsE2E;

  test.beforeAll(() => {
    credsPanel = lerCreds();
  });

  test.beforeEach(async ({ page }) => {
    credsPanel = await loginComoAdmin(page, credsPanel);
  });

  test("escolher 'custom', preencher o endereço e salvar grava no banco — a volta completa", async ({
    page,
  }) => {
    await page.goto("/app/ai/providers");
    await page.waitForSelector('[data-testid="painel-de-provedores"]');
    await page.click('[data-testid="avancado-entender"]');

    await page.click('[data-testid="provider-sentiment_classify"]');
    await page.getByRole("option", { name: /API customizada/i }).click();

    // O campo nasce OBRIGATÓRIO — moldura diferente da que OpenRouter/NVIDIA
    // usam para o mesmo campo (lá é "opcional").
    await expect(page.getByText(/Endereço do endpoint \(obrigatório\)/i)).toBeVisible();

    // Sem catálogo sincronizado, o modelo é texto livre (mesmo padrão da
    // OpenRouter antes da primeira sincronização).
    await page.locator('[data-testid="modelo-sentiment_classify"]').fill("qualquer/modelo");

    const salvar = page.locator('[data-testid="salvar-sentiment_classify"]');
    // Modelo preenchido, endereço ainda vazio: continua bloqueado.
    await expect(salvar).toBeDisabled();

    await page
      .locator('[data-testid="base-url-sentiment_classify"]')
      .fill("https://meu-gateway.exemplo.com/v1");
    await expect(salvar).toBeEnabled();

    await salvar.click();
    await expect(page.getByText(/agora usa|não sabe usar/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // A PROVA: navegar de novo e ler o valor que veio do BANCO, pela mesma
    // resolução que o runtime usa — não o estado que o clique deixou em tela.
    await page.goto("/app/ai/providers");
    await page.waitForSelector('[data-testid="painel-de-provedores"]');
    await page.click('[data-testid="avancado-entender"]');
    const cartao = page.locator('[data-testid="ponto-sentiment_classify"]');
    await expect(cartao).toContainText("qualquer/modelo");
    await expect(page.locator('[data-testid="origem-sentiment_classify"]')).toContainText(
      /Escolhido por você/i,
    );

    fs.mkdirSync(EVIDENCIA, { recursive: true });
    await page.screenshot({
      path: path.join(EVIDENCIA, "provedor-custom-03-painel-persistiu.png"),
      fullPage: true,
    });
  });
});
