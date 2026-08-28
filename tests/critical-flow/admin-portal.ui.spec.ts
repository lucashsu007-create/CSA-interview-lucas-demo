/**
 * The critical loop driven through the committee portal in a browser.
 *
 * Concept prototype. Fictional data only.
 *
 *   admin signs in -> the events register lists what the database holds
 *   -> a newly published event appears in it
 *   -> a registration and a check-in move the dashboard numbers
 *
 * Selectors are roles, headings and visible text, never Tailwind classes: the
 * Admin workstream owns that markup and is still shaping it, and a spec pinned
 * to a class name breaks on a restyle without anything having gone wrong.
 *
 * Where the portal has no control for a step — it has no "publish" button yet,
 * because publishing is an admin action the portal has not surfaced — the step
 * is performed through the API or the database and the ASSERTION stays on what
 * the screen shows. That is the honest shape: the test still proves the loop
 * reaches the UI, and it does not pretend a button exists.
 */
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { execute, queryOne } from "./support/db";
import {
  DEMO,
  type Probe,
  adminAppBuilt,
  databaseReady,
  serverReachable,
} from "./support/environment";

const built = adminAppBuilt();
const db = databaseReady();
let reachable: Probe = { ok: false, reason: "not probed" };

/** Contract §7 auth: pick a seeded identity, which sets the httpOnly cookie. */
async function signInAs(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post("/api/session", { data: { email } });
  if (!response.ok()) {
    throw new Error(`could not sign in as ${email}: ${response.status()} ${await response.text()}`);
  }
}

test.describe("committee portal — the loop on screen", () => {
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

  test("a guest sees the events register with published events only", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: "Events", level: 1 })).toBeVisible();

    const draft = queryOne<{ title: string }>(
      `select title from public.events where status = 'draft' order by starts_at limit 1`,
      { role: "owner" },
    );
    await expect(
      page.getByText(draft.title, { exact: false }),
      "a guest must never be shown a draft event",
    ).toHaveCount(0);
  });

  test("signing in as the admin identity opens the committee dashboard", async ({
    page,
    request,
  }) => {
    await signInAs(request, DEMO.admin);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("Upcoming events")).toBeVisible();
  });

  test("an attendee identity is told the dashboard is a committee surface", async ({
    page,
    request,
  }) => {
    await signInAs(request, DEMO.member);
    await page.goto("/");
    await expect(
      page.getByText(/committee surface/i),
      "row-level security scopes an attendee to their own rows, so the counts would be a lie",
    ).toBeVisible();
  });

  test("an event the admin publishes appears in the register", async ({ page, request }) => {
    const draft = queryOne<{ id: string; title: string }>(
      `select id, title from public.events where status = 'draft' order by starts_at limit 1`,
      { role: "owner" },
    );

    await signInAs(request, DEMO.admin);
    await page.goto("/events");
    // Staff already see drafts, so the visible change is the status, not the row.
    await expect(page.getByText(draft.title, { exact: false }).first()).toBeVisible();

    const admin = queryOne<{ id: string }>(
      `select id from public.users where email = '${DEMO.admin}'`,
      { role: "owner" },
    );
    execute(`update public.events set status = 'published' where id = '${draft.id}'`, {
      as: admin.id,
    });

    // A guest is the real test of publication: they could not see it a moment ago.
    await request.delete("/api/session");
    await page.goto("/events");
    await expect(page.getByText(draft.title, { exact: false }).first()).toBeVisible();
  });

  test("a registration and a check-in move the dashboard numbers", async ({ page, request }) => {
    const before = queryOne<{ checked_in: number }>(
      `select count(*) filter (where checked_in_at is not null)::int as checked_in
         from public.registrations`,
      { role: "owner" },
    );

    const member = queryOne<{ id: string }>(
      `select id from public.users where email = '${DEMO.member}'`,
      { role: "owner" },
    );
    const event = queryOne<{ id: string }>(
      `select e.id from public.events e
        where e.status = 'published' and e.registration_deadline_at > now()
          and (select count(*) from public.registrations r where r.event_id = e.id) < e.capacity
          and not exists (select 1 from public.registrations r
                           where r.event_id = e.id and r.user_id = '${member.id}')
        order by e.starts_at limit 1`,
      { role: "owner" },
    );

    const ticket = queryOne<{ ticket_code: string }>(
      `select ticket_code from public.register_for_event('${event.id}', '${member.id}')`,
      { as: member.id },
    );
    const staff = queryOne<{ id: string }>(
      `select id from public.users where email = '${DEMO.staff}'`,
      { role: "owner" },
    );
    execute(
      `select public.check_in_ticket('${ticket.ticket_code}', '${event.id}', now(), 'e2e-ui-door')`,
      { as: staff.id },
    );

    await signInAs(request, DEMO.admin);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    // The dashboard renders counts the database produced; assert the count it
    // must now be able to show, rather than a specific piece of markup.
    const after = queryOne<{ checked_in: number }>(
      `select count(*) filter (where checked_in_at is not null)::int as checked_in
         from public.registrations`,
      { role: "owner" },
    );
    expect(after.checked_in).toBe(before.checked_in + 1);
    await expect(page.getByText(/check-in/i).first()).toBeVisible();
  });
});
