import { myRegistrations } from "@csa/api-client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/me/registrations` — tickets held.
 *
 * Scoped by the session subject, and additionally by RLS's `registrations_read_own`
 * on the same connection, so "my" is enforced twice and neither check depends on
 * a query parameter the caller controls.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  try {
    const registrations = await myRegistrations(viewerId);
    return jsonOk({ registrations });
  } catch (error) {
    return jsonFromError(error, "GET /api/me/registrations");
  }
}
