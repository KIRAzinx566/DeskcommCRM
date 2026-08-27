/**
 * F-novo (migration 0167) — agenda de reuniões.
 *
 * Fluxo: abre o dossiê de um lead seed → "Marcar reunião" → preenche
 * data/hora → salva → a reunião aparece em /app/agenda, em "Próximas".
 * Reusa o seed de kanban (mesmo pipeline/leads de kanban-owner-filter.spec.ts)
 * em vez de inventar um seed próprio.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
  kanban?: { pipeline_id: string };
}

function loadCreds(): Creds {
  const needsBase = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    return !c.users?.manager;
  };
  if (needsBase()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.kanban?.pipeline_id) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-kanban.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

const creds = loadCreds();

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

/** `YYYY-MM-DDTHH:mm` no futuro, formato que o `<input type="datetime-local">` aceita. */
function amanhaAsQuatorzeHoras(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(14, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

test("marca reunião pelo dossiê do lead e ela aparece na Agenda", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await page.goto(`/app/pipelines/${creds.kanban!.pipeline_id}`);

  // Abre o dossiê: clique no card (aria-label "Lead: <título>") abre o Sheet.
  await page.getByRole("group", { name: /^Lead: Pedido E2E/ }).first().click();
  await expect(page.getByRole("button", { name: /marcar reunião/i })).toBeVisible();

  await page.getByRole("button", { name: /marcar reunião/i }).click();

  const titulo = `Reunião E2E ${Date.now()}`;
  await page.getByLabel("Assunto").fill(titulo);
  await page.getByLabel("Data e hora").fill(amanhaAsQuatorzeHoras());
  await page.getByRole("button", { name: /^marcar reunião$/i }).click();

  await expect(page.getByText("Reunião marcada.")).toBeVisible();

  // Fecha o dossiê e confere na Agenda.
  await page.keyboard.press("Escape");
  await page.goto("/app/agenda");
  await expect(page.getByText(titulo)).toBeVisible();
  await expect(page.getByText("Agendada").first()).toBeVisible();
});
