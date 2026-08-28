import { listPartners } from "@csa/api-client";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { jsonFromError, jsonOk } from "@/lib/http";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `GET /api/partners` — the partner directory.
 *
 * Readable by anon and authenticated alike (`partners_read_all`), so a guest is
 * a valid caller and the viewer id is passed through rather than gated on.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const viewerId = await viewerIdFromRequest(request);
    const partners = await listPartners(viewerId);
    return jsonOk({ partners });
  } catch (error) {
    return jsonFromError(error, "GET /api/partners");
  }
}
