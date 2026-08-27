"use client";
import { createContext, useContext, type ReactNode } from "react";
import { resolveBranding, type Branding } from "@/lib/branding";

/**
 * Marca resolvida no server (global da instalação + override da org ativa,
 * ver app/app/layout.tsx) — evita todo client component sob /app/* ter que
 * refazer o merge global/org na mão.
 *
 * `useOrgBranding()` cai pro padrão do produto fora do provider — mesmo
 * fallback do `useAuth`, mas sem lançar, porque telas fora de /app/* (login,
 * onboarding) legitimamente não têm org e não devem quebrar.
 *
 * NUNCA `branding()` aqui: aquela função lê `window.__PUBLIC_ENV__` no
 * navegador e `process.env` no servidor, e as duas fontes divergem desde que
 * `app/layout.tsx` passou a injetar a marca do BANCO — hydration mismatch
 * (React #418) num componente `"use client"`. Mesmo defeito e mesmo remédio
 * de `lib/branding/contexto.tsx`: o padrão sai do resolvedor puro
 * (`resolveBranding`), computado uma vez, nunca da função que olha o
 * ambiente de execução.
 */
const PADRAO_DO_PRODUTO: Branding = resolveBranding(undefined, undefined);

const OrgBrandingContext = createContext<Branding | null>(null);

export function OrgBrandingProvider({
  value,
  children,
}: {
  value: Branding;
  children: ReactNode;
}) {
  return <OrgBrandingContext.Provider value={value}>{children}</OrgBrandingContext.Provider>;
}

export function useOrgBranding(): Branding {
  const ctx = useContext(OrgBrandingContext);
  return ctx ?? PADRAO_DO_PRODUTO;
}
