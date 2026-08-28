import type { NextRequest, NextResponse } from "next/server";

import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { loadImportRuns } from "@/lib/data";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/migration/runs` — contract §20.
 *
 * Admin-only, and checked twice. The 401 here is so an unauthenticated caller
 * gets a useful answer rather than an empty list that looks like "no imports
 * have run"; the check that actually protects the rows is the RLS policy, which
 * confines these tables to `admin` regardless of what this handler does.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  try {
    return jsonOk({ runs: await loadImportRuns(viewerId) });
  } catch (error) {
    return jsonFromError(error, "GET /api/migration/runs");
  }
}
