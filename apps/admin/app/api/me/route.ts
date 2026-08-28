import { activeMembership } from "@csa/api-client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { loadViewer } from "@/lib/data";
import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/me` — identity, role, active membership.
 *
 * Three separate facts, and the separation is contract §2: role governs
 * permissions only, membership decides pricing, and neither is derived from the
 * other. A user with role `attendee` and an active membership gets the member
 * price; the same user after expiry gets the public price.
 *
 * `activeMembership` is the server's resolved answer at this instant, not a
 * date range for the caller to judge — a client that re-derived it would
 * disagree with the database on exactly the boundary that matters. It is null,
 * never an empty object, when no period is active.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  try {
    const viewer = await loadViewer(viewerId);
    if (viewer === null) return jsonError("user_not_found");

    const membership = await activeMembership(viewerId);

    return jsonOk({
      user: {
        id: viewer.id,
        email: viewer.email,
        fullName: viewer.fullName,
        role: viewer.role,
      },
      activeMembership:
        membership === null
          ? null
          : {
              memberNumber: membership.memberNumber,
              membershipType: membership.membershipType,
              status: membership.status,
              startsAt: membership.startsAt,
              expiresAt: membership.expiresAt,
            },
    });
  } catch (error) {
    return jsonFromError(error, "GET /api/me");
  }
}
