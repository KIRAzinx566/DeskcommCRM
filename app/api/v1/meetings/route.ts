/**
 * GET /api/v1/meetings — list · POST /api/v1/meetings — create (handlers em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createMeetingSchema, listMeetingsQuerySchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { createMeetingHandler, listMeetingsHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "crm_meetings" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  const url = new URL(req.url);
  const parsed = listMeetingsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return fail("validation_failed", "Query inválida.", 422, {
      details: parsed.error.flatten() as unknown as Record<string, unknown>,
      requestId,
    });
  }

  const supabase = await createClient();
  try {
    const result = await listMeetingsHandler(
      supabase,
      { organization_id: activeOrg.orgId, actor: { type: "user", id: authUser.id }, requestId },
      parsed.data,
    );
    return ok(result.meetings, {
      requestId,
      meta: { cursor: result.cursor, has_more: result.has_more },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // Escrita é agent+ (mesmo corte de leads — viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_meetings" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(createMeetingSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();
  try {
    const meeting = await createMeetingHandler(
      supabase,
      { organization_id: activeOrg.orgId, actor: { type: "user", id: authUser.id }, requestId },
      input,
    );
    return ok(meeting, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
