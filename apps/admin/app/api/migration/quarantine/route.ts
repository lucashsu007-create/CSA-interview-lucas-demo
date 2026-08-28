import { isQuarantineState } from "@csa/domain";
import type { NextRequest, NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { loadQuarantine } from "@/lib/data";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/migration/quarantine` — contract §20. Optional `?state=`.
 *
 * `quarantine_state` is a CLOSED enum, so an unknown value is a 400 rather than
 * a filter that quietly returns everything. A console that silently ignores the
 * filter shows a reviewer the wrong set and gives them no way to notice.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  const raw = request.nextUrl.searchParams.get("state");
  if (raw !== null && !isQuarantineState(raw)) return jsonError("invalid_body", 400);

  try {
    const records = await loadQuarantine(viewerId, raw === null ? {} : { state: raw });
    return jsonOk({ records });
  } catch (error) {
    return jsonFromError(error, "GET /api/migration/quarantine");
  }
}
