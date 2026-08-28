import { listPublishedEvents } from "@csa/api-client";
import { isEventCategory } from "@csa/domain";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/events` — published events, optional `?category=`.
 *
 * A guest is a valid caller: contract §11 says an unauthenticated request sets
 * no claims, `current_app_user_id()` returns NULL, and RLS shows only published
 * events. So there is no auth check here — the database is the referee, and the
 * viewer id is passed through rather than being used to branch.
 *
 * `event_category` is a CLOSED enum. An unknown value is rejected rather than
 * silently ignored, because a filter that quietly returns everything is worse
 * than one that says no.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const raw = request.nextUrl.searchParams.get("category");
  if (raw !== null && !isEventCategory(raw)) {
    return jsonError("invalid_body", 400);
  }

  try {
    const viewerId = await viewerIdFromRequest(request);
    const events = await listPublishedEvents(
      viewerId,
      raw === null ? undefined : { category: raw },
    );
    return jsonOk({ events });
  } catch (error) {
    return jsonFromError(error, "GET /api/events");
  }
}
