/**
 * PATCH /api/v1/meetings/[id] — update meeting (handler em ../_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateMeetingSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { updateMeetingHandler } from "../_handler";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: meetingId } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "crm_meetings" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(updateMeetingSchema, req);
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
    const updated = await updateMeetingHandler(
      supabase,
      { organization_id: activeOrg.orgId, actor: { type: "user", id: authUser.id }, requestId },
      meetingId,
      input,
    );
    return ok(updated, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
