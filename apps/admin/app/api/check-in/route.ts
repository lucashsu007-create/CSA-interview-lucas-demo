import { checkInTicket } from "@csa/api-client";
import { checkInTicketInputSchema } from "@csa/validation";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { loadViewer } from "@/lib/data";
import { jsonError, jsonFromError, jsonOk } from "@/lib/http";
import { isCommitteeRole } from "@/lib/identities";
import { viewerIdFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * `POST /api/check-in` — calls `check_in_ticket`. Staff or admin only.
 *
 * Two things this route must not do, both from contract §5:
 *
 *  - It must not decide the outcome. `check_in_ticket` writes a `scan_attempts`
 *    row BEFORE it decides anything, owns `checked_in_at`, and resolves a
 *    repeat scan to `duplicate` with the canonical time rather than an error.
 *    Every one of those is a property of the transaction, not of this handler.
 *  - It must not treat `duplicate`, `wrong_event` or `invalid` as HTTP errors.
 *    They are successful calls that returned a rejection, and the scanner needs
 *    the `scanAttemptId` that came back with them — it is the audit handle for
 *    the scan that just happened, present on every outcome including rejections.
 *    A 4xx here would throw that away.
 *
 * `scannedAt` is the SCANNER's clock and is trusted only up to the server's:
 * the database clamps it with `least(p_scanned_at, now())`, which is also what
 * makes a queued offline scan reporting an earlier time correct the value
 * downward instead of booking a check-in in the future.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const viewerId = await viewerIdFromRequest(request);
  if (viewerId === null) return jsonError("unauthenticated");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("invalid_body");
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const scannedAt = typeof raw["scannedAt"] === "string" ? new Date(raw["scannedAt"]) : new Date();

  const input = checkInTicketInputSchema.safeParse({
    ticketCode: raw["ticketCode"],
    eventId: raw["eventId"],
    deviceId: raw["deviceId"],
    scannedAt,
  });
  if (!input.success) return jsonError("invalid_arguments");

  try {
    const viewer = await loadViewer(viewerId);
    if (viewer === null) return jsonError("user_not_found");
    if (!isCommitteeRole(viewer.role)) return jsonError("forbidden");

    const result = await checkInTicket(viewerId, input.data);
    return jsonOk({ result });
  } catch (error) {
    return jsonFromError(error, "POST /api/check-in");
  }
}
