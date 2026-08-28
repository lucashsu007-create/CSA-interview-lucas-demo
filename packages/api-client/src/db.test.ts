/**
 * Contract §11 — the session mechanism itself.
 *
 * This is the file that matters most in the package. If `set local` were a plain
 * `set`, or if the transaction never switched role, every other test here would
 * still pass and the whole authorisation story would be theatre. So these tests
 * assert the mechanism directly: the GUC is set, it dies with the transaction,
 * and the policies actually bite.
 */

import { afterAll, describe, expect, it } from "vitest";

import { closeDb, getDb, parseConnectionString, withPrivilegedRead, withSession } from "./db";
import {
  EVENT_TITLES,
  databaseAvailable,
  loadDemoIdentities,
  loadSeededEvent,
} from "./__fixtures__/integration";

describe("parseConnectionString", () => {
  it("lifts a unix socket directory out of the query string", () => {
    // libpq spells a socket connection `?host=/tmp`; `postgres` forwards unknown
    // query parameters as server settings and the backend rejects `host`.
    expect(parseConnectionString("postgresql:///csa_dev?host=/tmp")).toEqual({
      url: "postgresql:///csa_dev",
      host: "/tmp",
    });
  });

  it("leaves a tcp url alone", () => {
    const url = "postgres://user:secret@db.example:5432/csa?sslmode=require";
    expect(parseConnectionString(url)).toEqual({ url });
  });

  it("leaves a non-url keyword string alone", () => {
    expect(parseConnectionString("host=/tmp dbname=csa_dev")).toEqual({
      url: "host=/tmp dbname=csa_dev",
    });
  });
});

const available = await databaseAvailable();

describe.skipIf(!available)("withSession", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("leaves a guest with no claims, as the anon role", async () => {
    const [row] = await withSession(null, async (sql) => {
      const result = await sql`
        select
          coalesce(nullif(current_setting('request.jwt.claims', true), ''), '<unset>') as claims,
          current_user::text as effective_role,
          public.current_app_user_id() as app_user_id
      `;
      return [...result];
    });

    expect(row?.["claims"]).toBe("<unset>");
    expect(row?.["effective_role"]).toBe("anon");
    expect(row?.["app_user_id"]).toBeNull();
  });

  it("publishes the caller as request.jwt.claims, which is the GUC Supabase sets", async () => {
    const { member } = await loadDemoIdentities();

    const [row] = await withSession(member, async (sql) => {
      const result = await sql`
        select
          current_setting('request.jwt.claims', true) as claims,
          current_user::text as effective_role,
          public.current_app_user_id() as app_user_id,
          public.is_privileged_session() as privileged
      `;
      return [...result];
    });

    expect(JSON.parse(row?.["claims"] as string)).toEqual({
      sub: member,
      role: "authenticated",
    });
    expect(row?.["effective_role"]).toBe("authenticated");
    expect(row?.["app_user_id"]).toBe(member);
    // A session is never privileged: service_role is not issued to a client.
    expect(row?.["privileged"]).toBe(false);
  });

  it("does not leak the claim into the next borrower of the connection", async () => {
    const { member, admin } = await loadDemoIdentities();

    const read = (sql: Parameters<Parameters<typeof withSession>[1]>[0]) =>
      sql`select public.current_app_user_id() as app_user_id`.then((rows) => [...rows]);

    // Alternating on a warm pool: postgres reuses an idle connection, so if
    // `set local` were `set` the guest round would inherit the previous subject.
    for (let round = 0; round < 5; round += 1) {
      const [asMember] = await withSession(member, read);
      const [asGuest] = await withSession(null, read);
      const [asAdmin] = await withSession(admin, read);

      expect(asMember?.["app_user_id"]).toBe(member);
      expect(asGuest?.["app_user_id"]).toBeNull();
      expect(asAdmin?.["app_user_id"]).toBe(admin);
    }

    // And nothing is left behind outside a transaction either.
    const [outside] = await getDb()`
      select
        coalesce(nullif(current_setting('request.jwt.claims', true), ''), '<unset>') as claims,
        current_user::text as effective_role
    `;
    expect(outside?.["claims"]).toBe("<unset>");
    expect(outside?.["effective_role"]).not.toBe("anon");
  });

  it("rolls the transaction back when the callback throws", async () => {
    const { admin } = await loadDemoIdentities();
    const marker = `[DEMO ONLY] rollback probe ${Date.now()}`;

    await expect(
      withSession(admin, async (sql) => {
        await sql`
          insert into events (title, category, starts_at, registration_deadline_at, capacity, status)
          values (${marker}, 'social', now() + interval '30 days', now() + interval '29 days', 10, 'draft')
        `;
        throw new Error("deliberate");
      }),
    ).rejects.toThrow("deliberate");

    const [row] = await getDb()`select count(*)::int as n from events where title = ${marker}`;
    expect(row?.["n"]).toBe(0);
  });

  it("refuses a user id that is not a uuid, so nothing can be concatenated into SQL", async () => {
    await expect(
      withSession("' , role => 'service_role" as never, async (sql) => {
        const rows = await sql`select 1 as one`;
        return [...rows];
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe.skipIf(!available)("row level security is actually in force", () => {
  it("hides a draft event from a guest and shows it to an admin", async () => {
    const { admin, member } = await loadDemoIdentities();
    const draft = await loadSeededEvent(EVENT_TITLES.draft);
    expect(draft.status).toBe("draft");

    const visible = async (as: string | null): Promise<number> => {
      const [row] = await withSession(as, async (sql) => {
        const result =
          await sql`select count(*)::int as n from events e where e.id = ${draft.id}::uuid`;
        return [...result];
      });
      return row?.["n"] as number;
    };

    expect(await visible(null)).toBe(0);
    expect(await visible(member)).toBe(0);
    expect(await visible(admin)).toBe(1);
  });

  it("shows a member only their own registrations", async () => {
    const { member, admin } = await loadDemoIdentities();

    const survey = async (
      as: string,
    ): Promise<{ visible: number; belongingToSomebodyElse: number }> => {
      const [row] = await withSession(as, async (sql) => {
        const result = await sql`
          select
            count(*)::int as visible,
            (count(*) filter (where r.user_id <> ${as}::uuid))::int as belonging_to_somebody_else
          from registrations r
        `;
        return [...result];
      });
      return {
        visible: row?.["visible"] as number,
        belongingToSomebodyElse: row?.["belonging_to_somebody_else"] as number,
      };
    };

    const asMember = await survey(member);
    expect(asMember.belongingToSomebodyElse).toBe(0);
    expect(asMember.visible).toBeGreaterThan(0);

    // Staff and admin see the whole table, which is what the dashboard needs.
    const asAdmin = await survey(admin);
    expect(asAdmin.visible).toBeGreaterThan(asMember.visible);
  });

  it("denies a guest the members-only RPCs at the GRANT layer", async () => {
    const singleSeat = await loadSeededEvent(EVENT_TITLES.singleSeat);
    const { member } = await loadDemoIdentities();

    await expect(
      withSession(null, async (sql) => {
        const rows = await sql`
          select * from register_for_event(${singleSeat.id}::uuid, ${member}::uuid)
        `;
        return [...rows];
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe.skipIf(!available)("withPrivilegedRead", () => {
  it("cannot write, whatever the callback tries", async () => {
    await expect(
      withPrivilegedRead("public-event-capacity", async (sql) => {
        const rows = await sql`delete from scan_attempts where ticket_code = 'ZZZZZZZZZZ'`;
        return [...rows];
      }),
      // 25006 read_only_sql_transaction
    ).rejects.toMatchObject({ code: "25006" });
  });

  it("stamps its reason into application_name so an elevated read is visible", async () => {
    const [row] = await withPrivilegedRead("own-ticket-events", async (sql) => {
      const result = await sql`select current_setting('application_name') as application_name`;
      return [...result];
    });
    expect(row?.["application_name"]).toBe("csa/api-client:own-ticket-events");
  });
});
