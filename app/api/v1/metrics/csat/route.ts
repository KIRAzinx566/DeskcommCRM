/**
 * GET /api/v1/metrics/csat — resumo de satisfação dos últimos 30 dias.
 *
 * Read-only, escopo = RLS (`csat_requests_select`, org member) — client de
 * sessão, sem admin client. Sem audit (leitura não muta nada).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface CsatRow {
  id: string;
  status: string;
  score: number | null;
  raw_reply: string | null;
  sent_at: string;
  answered_at: string | null;
  contacts: { display_name: string | null; name: string | null } | { display_name: string | null; name: string | null }[] | null;
}

function nomeDoContato(row: CsatRow): string {
  const c = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
  return c?.display_name ?? c?.name ?? "—";
}

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "metrics" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();
  const desde = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const { data, error } = await supabase
    .from("csat_requests")
    .select("id, status, score, raw_reply, sent_at, answered_at, contacts:contact_id(display_name, name)")
    .gte("sent_at", desde)
    .order("sent_at", { ascending: false })
    .limit(200);

  if (error) return fail("internal_error", error.message, 500, { requestId });

  const rows = (data ?? []) as unknown as CsatRow[];
  const respondidas = rows.filter((r) => r.status === "answered" && r.score != null);
  const mediaNota =
    respondidas.length > 0
      ? respondidas.reduce((acc, r) => acc + (r.score ?? 0), 0) / respondidas.length
      : null;

  return ok(
    {
      window: { from: desde, to: new Date().toISOString() },
      enviadas: rows.length,
      respondidas: respondidas.length,
      media_nota: mediaNota,
      recentes: respondidas.slice(0, 20).map((r) => ({
        id: r.id,
        contato: nomeDoContato(r),
        nota: r.score,
        resposta: r.raw_reply,
        respondida_em: r.answered_at,
      })),
    },
    { requestId },
  );
}
