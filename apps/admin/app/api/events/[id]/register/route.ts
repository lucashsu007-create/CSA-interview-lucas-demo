import { registerForEvent } from "@csa/api-client";
import { isUuid } from "@csa/domain";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `POST /api/events/:id/register` — calls `register_for_event`.
 *
 * This route does NOTHING except establish who is asking and hand the decision
 * to the database. Every rule that matters — published, deadline, capacity
 * under `SELECT … FOR UPDATE`, member price from an active membership period,
 * a non-sequential ticket code, the audit row — happens inside one transaction
 * in `register_for_event`. Re-checking any of it here would produce a second
 * answer that can disagree with the one that actually took the seat.
 *
 * The failures come back as contract §5 tokens and leave as contract §13 status
 * codes with `{ error: "<token>" }` in the body. `jsonFromError` owns that
 * mapping so no route re-states it.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("invalid_body");

  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  try {
    const registration = await registerForEvent(viewerId, id);
    return jsonOk({ registration }, 201);
  } catch (error) {
    return jsonFromError(error, "POST /api/events/:id/register");
  }
}
