import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";

import { VisaoGeral } from "./_visao-geral";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visão geral" };

/**
 * A VISÃO GERAL do Modo Orquestra — o quadro do dono: o caixa, quem espera a
 * equipe, o funil, o que está ligado e o que cada agente de IA está fazendo.
 * Os números vêm de `/api/v1/orquestra/painel` (`lib/orquestra/painel.ts`) e
 * da contagem da fila do Inbox; nenhum é calculado só para esta tela.
 */
export default async function OrquestraPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <VisaoGeral />;
}
