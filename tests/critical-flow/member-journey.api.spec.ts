/**
 * The member journey over the JSON API the Expo app consumes (contract §13).
 *
 * Concept prototype. Fictional data only.
 *
 * `apps/admin` serves both surfaces — the committee UI and this API — so this
 * is the contract between the two runtimes. Everything asserted here is frozen
 * in §13: the paths, the verbs, and the rule that a failure travels as
 * `{ error: "event_full" }` so a client switches on a token instead of parsing
 * prose. Response envelopes are not frozen, so this reads through `collection()`
 * rather than pinning a wrapper the Admin workstream is free to choose.
 *
 * Skipped, with the reason, when nothing is serving the API. It is never
 * softened into a test that passes because a request 404'd.
 */
import type { APIResponse } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  BASE_URL,
  DEMO,
  type Probe,
  adminApiBuilt,
  databaseReady,
  serverReachable,
} from "./support/environment";

const built = adminApiBuilt();
const db = databaseReady();
let reachable: Probe = { ok: false, reason: "not probed" };

/** The array in a response, whether it arrived bare or inside an envelope. */
function collection(body: unknown, key: string): unknown[] {
  if (Array.isArray(body)) return body;
  if (typeof body === "object" && body !== null) {
    const value = (body as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value;
  }
  throw new Error(`expected an array of ${key}, got ${JSON.stringify(body).slice(0, 200)}`);
}

function unwrap(body: unknown, key: string): Record<string, unknown> {
  if (typeof body !== "object" || body === null) throw new Error(`expected an object for ${key}`);
  const record = body as Record<string, unknown>;
  const inner = record[key];
  return typeof inner === "object" && inner !== null ? (inner as Record<string, unknown>) : record;
}

async function token(response: APIResponse): Promise<string> {
  const body = (await response.json()) as { error?: string };
  return body.error ?? `<no error token, status ${response.status()}>`;
}

interface ApiEvent {
  id: string;
  title: string;
  status: string;
  capacity: number;
  registeredCount: number;
  spotsRemaining: number;
  priceMemberCents: number;
  pricePublicCents: number;
}

test.describe("member journey — contract §13 HTTP API", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    if (built.ok && db.ok) reachable = await serverReachable();
  });

  test.beforeEach(() => {
    test.skip(!built.ok, built.reason);
    test.skip(!db.ok, `${db.reason}. Run scripts/dev-setup.sh first.`);
    test.skip(
      !reachable.ok,
      `${reachable.reason}. Start it, or re-run with CSA_E2E_START_SERVER=1.`,
    );
  });

  let eventId = "";
  let ticketCode = "";

  test("a guest sees published events and nothing else", async ({ request }) => {
    const response = await request.get("/api/events");
    expect(response.status(), "the event list is public — discovery needs no account").toBe(200);

    const events = collection(await response.json(), "events") as ApiEvent[];
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.status, "a guest must never be shown a draft").toBe("published");
      // Contract §12: the list carries capacity so no screen computes it.
      expect(event.spotsRemaining).toBe(event.capacity - event.registeredCount);
    }
  });

  test("picking a demo identity mints a session", async ({ request }) => {
    const response = await request.post("/api/session", { data: { email: DEMO.member } });
    expect(response.status(), await response.text()).toBe(200);

    const me = await request.get("/api/me");
    expect(me.status()).toBe(200);
    const identity = unwrap(await me.json(), "user");
    expect(JSON.stringify(identity)).toContain(DEMO.member);
  });

  test("a signed-in member registers and receives a ticket", async ({ request }) => {
    await request.post("/api/session", { data: { email: DEMO.member } });

    const held = collection(
      await (await request.get("/api/me/registrations")).json(),
      "registrations",
    ) as Array<{ event?: { id?: string }; eventId?: string }>;
    const heldEventIds = new Set(
      held
        .map((r) => r.eventId ?? r.event?.id)
        .filter((id): id is string => typeof id === "string"),
    );

    const events = collection(
      await (await request.get("/api/events")).json(),
      "events",
    ) as ApiEvent[];
    const target = events.find((e) => e.spotsRemaining > 0 && !heldEventIds.has(e.id));
    expect(
      target,
      "the seed must offer at least one open event this member has not taken",
    ).toBeDefined();
    if (target === undefined) return;
    eventId = target.id;

    const response = await request.post(`/api/events/${eventId}/register`);
    expect(response.status(), await response.text()).toBe(201);

    const registration = unwrap(await response.json(), "registration");
    expect(String(registration["ticketCode"])).toMatch(/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(registration["isMemberPrice"], "an active membership must set the member price").toBe(
      true,
    );
    ticketCode = String(registration["ticketCode"]);
  });

  test("the ticket is listed among the member’s registrations", async ({ request }) => {
    await request.post("/api/session", { data: { email: DEMO.member } });
    const registrations = collection(
      await (await request.get("/api/me/registrations")).json(),
      "registrations",
    );
    expect(JSON.stringify(registrations)).toContain(ticketCode);
  });

  test("registering twice returns 409 with the already_registered token", async ({ request }) => {
    await request.post("/api/session", { data: { email: DEMO.member } });
    const response = await request.post(`/api/events/${eventId}/register`);
    expect(response.status()).toBe(409);
    expect(await token(response), "clients switch on the token, not on prose").toBe(
      "already_registered",
    );
  });

  test("an attendee cannot check anyone in; staff can", async ({ request }) => {
    await request.post("/api/session", { data: { email: DEMO.member } });
    const denied = await request.post("/api/check-in", {
      data: { ticketCode, eventId, scannedAt: new Date().toISOString(), deviceId: "e2e-api" },
    });
    expect(denied.status(), "contract §13: check-in is staff and admin only").toBe(403);
    expect(await token(denied)).toBe("forbidden");

    await request.post("/api/session", { data: { email: DEMO.staff } });
    const first = await request.post("/api/check-in", {
      data: { ticketCode, eventId, scannedAt: new Date().toISOString(), deviceId: "e2e-api" },
    });
    expect(first.status(), await first.text()).toBe(200);
    const firstBody = unwrap(await first.json(), "result");
    expect(firstBody["outcome"]).toBe("success");

    const again = await request.post("/api/check-in", {
      data: { ticketCode, eventId, scannedAt: new Date().toISOString(), deviceId: "e2e-api" },
    });
    expect(again.status(), "a duplicate is an outcome, not an error").toBe(200);
    expect(unwrap(await again.json(), "result")["outcome"]).toBe("duplicate");
  });

  test("the partner directory is public", async ({ request }) => {
    const response = await request.get("/api/partners");
    expect(response.status()).toBe(200);
    expect(collection(await response.json(), "partners").length).toBeGreaterThan(0);
  });

  test("signing out drops the session", async ({ request }) => {
    await request.post("/api/session", { data: { email: DEMO.member } });
    expect((await request.get("/api/me")).status()).toBe(200);

    const out = await request.delete("/api/session");
    expect(out.status()).toBe(200);
    expect(
      (await request.get("/api/me")).status(),
      "contract §11: a guest sets nothing and is nobody",
    ).toBe(401);
  });

  test("the suite pointed at the expected base URL", () => {
    expect(BASE_URL).toBeTruthy();
  });
});
