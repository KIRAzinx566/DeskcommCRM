import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DEFAULT_APP_NAME, resolveBranding } from "@/lib/branding";

const RAIZ = process.cwd();

describe("resolveBranding", () => {
  it("cai no padrão quando não há marca configurada", () => {
    expect(resolveBranding(undefined, undefined)).toEqual({
      name: DEFAULT_APP_NAME,
      logoUrl: null,
      initial: "D",
      accentColor: null,
      accentForeground: null,
    });
  });

  it("trata string vazia e só-espaços como ausência de marca", () => {
    // `install.sh` grava a chave declarada mesmo quando o operador não responde
    // (APP_NAME=), então "vazio" chega como string — não como undefined. Tratar
    // isso como marca válida deixaria a interface sem nome nenhum.
    expect(resolveBranding("", "").name).toBe(DEFAULT_APP_NAME);
    expect(resolveBranding("   ", "   ").name).toBe(DEFAULT_APP_NAME);
    expect(resolveBranding("   ", "   ").logoUrl).toBeNull();
  });

  it("usa a marca configurada e deriva a inicial", () => {
    const b = resolveBranding("  Vendas Turbo  ", "  https://cdn.exemplo.com/logo.svg  ");
    expect(b.name).toBe("Vendas Turbo");
    expect(b.logoUrl).toBe("https://cdn.exemplo.com/logo.svg");
    expect(b.initial).toBe("V");
  });

  it("mantém o nome mas dispensa o logo quando só o nome é configurado", () => {
    const b = resolveBranding("Acme CRM", undefined);
    expect(b.name).toBe("Acme CRM");
    expect(b.logoUrl).toBeNull();
  });

  it("não parte code point ao derivar a inicial", () => {
    // `[0]` cru devolveria metade do par substituto e renderizaria caractere
    // inválido na sidebar recolhida.
    expect(resolveBranding("🚀 Foguete", null).initial).toBe("🚀");
    expect(resolveBranding("Ótimo CRM", null).initial).toBe("Ó");
  });
});

describe("resolveBranding — cor de destaque", () => {
  it("sem cor configurada, accentColor e accentForeground ficam null", () => {
    const b = resolveBranding("Acme", null, undefined);
    expect(b.accentColor).toBeNull();
    expect(b.accentForeground).toBeNull();
  });

  it("hex inválido não é aplicado — nunca vaza cor quebrada pro CSS", () => {
    expect(resolveBranding("Acme", null, "azul").accentColor).toBeNull();
    expect(resolveBranding("Acme", null, "#12345").accentColor).toBeNull();
    expect(resolveBranding("Acme", null, "rgb(0,0,0)").accentColor).toBeNull();
    expect(resolveBranding("Acme", null, "   ").accentColor).toBeNull();
  });

  it("expande hex curto (#rgb) para o formato completo", () => {
    expect(resolveBranding("Acme", null, "#F00").accentColor).toBe("#ff0000");
  });

  it("normaliza pra minúsculo", () => {
    expect(resolveBranding("Acme", null, "#FF00AA").accentColor).toBe("#ff00aa");
  });

  it("escolhe texto escuro sobre cor clara, e branco sobre cor escura", () => {
    // Amarelo bem claro — luminância alta, texto escuro é o legível.
    expect(resolveBranding("Acme", null, "#ffff00").accentForeground).toBe("#1c1a16");
    // Azul bem escuro — luminância baixa, texto branco é o legível.
    expect(resolveBranding("Acme", null, "#000033").accentForeground).toBe("#ffffff");
  });
});

describe("guarda de white-label (self-host)", () => {
  const branding = fs.readFileSync(path.join(RAIZ, "lib/branding.ts"), "utf8");
  const publicEnvScript = fs.readFileSync(
    path.join(RAIZ, "app/public-env-script.tsx"),
    "utf8",
  );

  it("não usa prefixo NEXT_PUBLIC_ para a marca", () => {
    // POR QUE ESTE TESTE EXISTE: a convenção do Next empurra qualquer valor lido
    // no browser para NEXT_PUBLIC_*, e alguém vai "corrigir" isso um dia. Mas
    // NEXT_PUBLIC_* é queimada no bundle durante o `next build`, e o self-hoster
    // roda uma imagem PRÉ-BUILDADA: a marca dele nunca apareceria. O defeito
    // passaria em typecheck, lint e em toda a suíte, funcionaria em dev e na
    // Vercel, e falharia apenas na VPS de quem a feature existe para servir.
    expect(branding).not.toMatch(/NEXT_PUBLIC_APP_(NAME|LOGO_URL)/);
    expect(publicEnvScript).not.toMatch(/NEXT_PUBLIC_APP_(NAME|LOGO_URL)/);
  });

  it("injeta a marca em runtime pelo PublicEnvScript", () => {
    // Sem estas duas chaves no payload, os client components (Sidebar,
    // AdminSidebar) caem no padrão e só a marca do servidor muda — a instalação
    // ficaria com o nome do revendedor no título da aba e o nosso na sidebar.
    expect(publicEnvScript).toMatch(/APP_NAME:\s*env\.APP_NAME/);
    expect(publicEnvScript).toMatch(/APP_LOGO_URL:\s*env\.APP_LOGO_URL/);
    expect(publicEnvScript).toMatch(/APP_ACCENT_COLOR:\s*env\.APP_ACCENT_COLOR/);
  });

  it("a marca não voltou a ser hardcoded na interface", () => {
    // Varre as superfícies que o usuário final vê. `app/design/` fica de fora:
    // é o showcase interno do design system, onde o nome do produto é o assunto.
    const alvos: string[] = [];
    const varrer = (dir: string) => {
      for (const entrada of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entrada.name);
        if (rel.startsWith("app/design")) continue;
        if (entrada.isDirectory()) varrer(rel);
        else if (rel.endsWith(".tsx")) alvos.push(rel);
      }
    };
    varrer("app");
    varrer("components");

    const reincidentes = alvos.filter((f) =>
      /Deskcomm/.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(
      reincidentes,
      `estes arquivos voltaram a fixar a marca na interface — use branding() de lib/branding.ts:\n` +
        reincidentes.map((f) => `  ${f}`).join("\n"),
    ).toEqual([]);
  });
});
