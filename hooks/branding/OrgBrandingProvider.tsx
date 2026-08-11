"use client";
import { createContext, useContext, type ReactNode } from "react";
import { branding, type Branding } from "@/lib/branding";

/**
 * Marca resolvida no server (global da instalação + override da org ativa,
 * ver app/app/layout.tsx) — evita todo client component sob /app/* ter que
 * refazer o merge global/org na mão.
 *
 * `useOrgBranding()` cai pra `branding()` (só global) fora do provider —
 * mesmo fallback do `useAuth`, mas sem lançar, porque telas fora de /app/*
 * (login, onboarding) legitimamente não têm org e não devem quebrar.
 */
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
  return ctx ?? branding();
}
