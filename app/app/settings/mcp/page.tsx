import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { McpConnectClient } from "./_components/McpConnectClient";

export const dynamic = "force-dynamic";

export default async function McpPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Conectar um assistente de IA (MCP)", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "O CRM inteiro fica disponível como ferramentas para Claude Desktop, Cursor, ou qualquer cliente MCP — a mesma conexão que os agentes internos já usam.",
            idioma,
          )}
        </p>
      </header>
      <McpConnectClient />
    </div>
  );
}
