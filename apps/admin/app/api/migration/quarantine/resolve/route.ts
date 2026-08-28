import { QuarantineResolutionError } from "@csa/api-client";
import { isUuid } from "@csa/domain";
import type { NextRequest, NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { resolveQuarantine } from "@/lib/data";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `POST /api/migration/quarantine/resolve` — contract §20.
 *
 * Body: `{ id, note, state: "resolved" | "discarded" }`.
 *
 * An empty note is a 422, not a warning. The migration plan's §17 gate requires
 * a documented reason for every rejection, and closing a record with no account
 * of how it was resolved is precisely what that gate exists to prevent. The
 * table's CHECK refuses it as well, so this handler being wrong is not enough
 * to produce an unexplained resolution.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_body", 400);
  }

  const input = body as { id?: unknown; note?: unknown; state?: unknown };
  const state = input.state ?? "resolved";
  if (
    typeof input.id !== "string" ||
    !isUuid(input.id) ||
    typeof input.note !== "string" ||
    (state !== "resolved" && state !== "discarded")
  ) {
    return jsonError("invalid_body", 400);
  }

  try {
    const record = await resolveQuarantine(viewerId, {
      id: input.id,
      note: input.note,
      state,
    });
    return jsonOk({ record });
  } catch (error) {
    if (error instanceof QuarantineResolutionError) {
      // 422: the request was well-formed and the state it asks for is not
      // reachable — an empty note, or a record someone else already closed.
      return jsonError(error.token === "not_found" ? "event_not_found" : "invalid_body", 422);
    }
    return jsonFromError(error, "POST /api/migration/quarantine/resolve");
  }
}
