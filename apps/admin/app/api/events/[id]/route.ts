import { getEvent } from "@csa/api-client";
import { isUuid } from "@csa/domain";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/events/:id` — one event with capacity and pricing.
 *
 * Both numbers come from the data layer, not from here. Capacity is only safe
 * to evaluate under the row lock inside `register_for_event`, and the price a
 * caller will actually pay is resolved server-side from their membership state
 * at registration time — a route that computed either would be a second source
 * of truth that disagrees with the transaction.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("invalid_body");

  try {
    const viewerId = await viewerIdFromRequest(request);
    const event = await getEvent(viewerId, id);

    /* Null covers both "no such row" and "RLS did not show it to you", and the
     * two are deliberately indistinguishable to the caller. */
    if (event === null) return jsonError("event_not_found");

    return jsonOk({ event });
  } catch (error) {
    return jsonFromError(error, "GET /api/events/:id");
  }
}
