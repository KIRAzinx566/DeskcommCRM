import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { Mundo } from "./_mundo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mundo dos agentes" };

/**
 * O MUNDO DOS AGENTES — a operação desenhada como um escritório. Cada
 * personagem é um dado real (`lib/orquestra/mundo/personagens.ts`); o desenho
 * veio do painel do Orquestra.
 */
export default async function MundoPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <Mundo />;
}
