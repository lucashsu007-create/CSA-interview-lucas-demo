/**
 * Contract §12 — the reads, against the seeded database.
 *
 * These tests are about what each identity is allowed to see and what the SQL
 * computes for them. They create nothing and delete nothing, so they can run
 * beside anything else.
 */

import { afterAll, describe, expect, it } from "vitest";

import { closeDb } from "./db";
import { dashboardSummary } from "./dashboard";
import { getEvent, listPublishedEvents } from "./events";
import { activeMembership } from "./membership";
import { listPartners } from "./partners";
import { myRegistrations } from "./registrations";
import {
  EVENT_TITLES,
  databaseAvailable,
  loadDemoIdentities,
  loadSeededEvent,
} from "./__fixtures__/integration";

const available = await databaseAvailable();

describe.skipIf(!available)("listPublishedEvents", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("gives a guest published events and nothing else", async () => {
    const events = await listPublishedEvents(null);

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.status === "published")).toBe(true);

    const titles = events.map((event) => event.title);
    expect(titles).not.toContain(EVENT_TITLES.draft);
    expect(titles).not.toContain(EVENT_TITLES.soldOut);
    expect(titles).not.toContain(EVENT_TITLES.cancelled);
  });

  it("does not widen for staff, who can see drafts through RLS", async () => {
    const { admin } = await loadDemoIdentities();
    const asAdmin = await listPublishedEvents(admin);

    // The policies let an admin read a draft; `listPublishedEvents` still must not.
    expect(asAdmin.every((event) => event.status === "published")).toBe(true);
    expect(asAdmin.map((event) => event.title)).not.toContain(EVENT_TITLES.draft);
  });

  it("is ordered by start time", async () => {
    const events = await listPublishedEvents(null);
    const times = events.map((event) => event.startsAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("carries capacity so no screen has to compute it", async () => {
    const events = await listPublishedEvents(null);

    for (const event of events) {
      expect(Number.isInteger(event.registeredCount)).toBe(true);
      expect(event.registeredCount).toBeGreaterThanOrEqual(0);
      expect(event.spotsRemaining).toBe(Math.max(event.capacity - event.registeredCount, 0));
    }
  });

  // Retried: `rpc.test.ts` runs in a parallel worker and registers people, so a
  // registration landing between two of these reads is a timing artefact, not a
  // visibility bug. Retrying distinguishes the two.
  it("counts the same places taken for a guest, a member and an admin", { retry: 2 }, async () => {
    // The point of the elevated capacity read. `anon` has no SELECT on
    // `registrations` at all and an attendee sees only their own rows, so a
    // naive join would error for the guest and report 0 or 1 for the member.
    const { member, admin } = await loadDemoIdentities();
    const gala = await loadSeededEvent("Mid-Autumn Festival Gala");

    const countFor = async (as: string | null): Promise<number> => {
      const events = await listPublishedEvents(as);
      const found = events.find((event) => event.id === gala.id);
      if (found === undefined) throw new Error("the gala should be visible to everyone");
      return found.registeredCount;
    };

    // Read together: another test file registering somebody mid-assertion would
    // otherwise look like a difference of visibility rather than of timing.
    const [asGuest, asMember, asAdmin] = await Promise.all([
      countFor(null),
      countFor(member),
      countFor(admin),
    ]);

    expect(asAdmin).toBeGreaterThan(1);
    expect(asGuest).toBe(asAdmin);
    expect(asMember).toBe(asAdmin);
  });

  it("filters by category", async () => {
    const cultural = await listPublishedEvents(null, { category: "cultural" });
    expect(cultural.length).toBeGreaterThan(0);
    expect(cultural.every((event) => event.category === "cultural")).toBe(true);

    const all = await listPublishedEvents(null);
    expect(cultural.length).toBeLessThan(all.length);
  });

  it("refuses a category that is not in the closed enum", async () => {
    await expect(listPublishedEvents(null, { category: "karaoke" as never })).rejects.toThrow(
      TypeError,
    );
  });
});

describe.skipIf(!available)("getEvent", () => {
  it("lets RLS decide who may see a draft", async () => {
    const { admin, member } = await loadDemoIdentities();
    const draft = await loadSeededEvent(EVENT_TITLES.draft);

    await expect(getEvent(null, draft.id)).resolves.toBeNull();
    await expect(getEvent(member, draft.id)).resolves.toBeNull();

    const asAdmin = await getEvent(admin, draft.id);
    expect(asAdmin?.status).toBe("draft");
    expect(asAdmin?.title).toBe(EVENT_TITLES.draft);
  });

  it("returns null for an event that does not exist", async () => {
    await expect(getEvent(null, "00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });

  it("refuses an id that is not a uuid", async () => {
    await expect(getEvent(null, "not-a-uuid")).rejects.toThrow();
  });

  it("carries the caller's own registration and nobody else's", { retry: 2 }, async () => {
    const { member, nonMember } = await loadDemoIdentities();
    const gala = await loadSeededEvent("Mid-Autumn Festival Gala");

    const [asMember, asNonMember, asGuest] = await Promise.all([
      getEvent(member, gala.id),
      getEvent(nonMember, gala.id),
      getEvent(null, gala.id),
    ]);

    expect(asMember?.viewerRegistration?.userId).toBe(member);
    expect(asMember?.viewerRegistration?.isMemberPrice).toBe(true);
    expect(asMember?.viewerRegistration?.pricePaidCents).toBe(gala.priceMemberCents);

    expect(asNonMember?.viewerRegistration?.userId).toBe(nonMember);
    expect(asNonMember?.viewerRegistration?.isMemberPrice).toBe(false);
    expect(asNonMember?.viewerRegistration?.pricePaidCents).toBe(gala.pricePublicCents);

    expect(asGuest?.viewerRegistration).toBeNull();
    // Capacity is still there for a guest.
    expect(asGuest?.registeredCount).toBe(asMember?.registeredCount);
  });
});

describe.skipIf(!available)("listPartners", () => {
  it("is the same public directory for a guest and a member", async () => {
    const { member } = await loadDemoIdentities();
    const asGuest = await listPartners(null);
    const asMember = await listPartners(member);

    expect(asGuest.length).toBeGreaterThan(0);
    expect(asGuest).toEqual(asMember);
    expect([...asGuest].sort((a, b) => a.name.localeCompare(b.name))[0]?.name).toBe(
      asGuest[0]?.name,
    );
  });
});

describe.skipIf(!available)("activeMembership", () => {
  it("finds the live period for a member", async () => {
    const { member } = await loadDemoIdentities();
    const period = await activeMembership(member);

    expect(period).not.toBeNull();
    expect(period?.userId).toBe(member);
    expect(period?.status).toBe("active");
    expect(period?.startsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(period?.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now());
    expect(period?.memberNumber).toMatch(/^CSA-/);
  });

  it("is null for a user who has never held one", async () => {
    const { nonMember } = await loadDemoIdentities();
    await expect(activeMembership(nonMember)).resolves.toBeNull();
  });

  it("ignores an expired period even though the user has one", async () => {
    // `member@demo.local` holds both an expired and an active period; the
    // expired one must never be the answer.
    const { member } = await loadDemoIdentities();
    const period = await activeMembership(member);
    expect(period?.status).toBe("active");
  });

  it("is not derived from role: an admin without a live period would get null", async () => {
    // Contract §2. The seeded admin does hold a membership, so the assertion
    // here is that the answer is about the period, not the role.
    const { admin } = await loadDemoIdentities();
    const period = await activeMembership(admin);
    expect(period === null || period.userId === admin).toBe(true);
  });
});

describe.skipIf(!available)("myRegistrations", () => {
  it("returns every ticket the caller holds, including for events RLS hides", async () => {
    const { member } = await loadDemoIdentities();
    const held = await myRegistrations(member);

    expect(held.length).toBeGreaterThan(0);
    expect(held.every((registration) => registration.userId === member)).toBe(true);
    expect(held.every((registration) => registration.event.id === registration.eventId)).toBe(true);

    // The two that an inner join under the member's own session would drop:
    // `events_read_published` hides both from an attendee.
    const titles = held.map((registration) => registration.event.title);
    expect(titles).toContain(EVENT_TITLES.soldOut);
    expect(titles).toContain(EVENT_TITLES.cancelled);

    const statuses = new Set(held.map((registration) => registration.event.status));
    expect(statuses.has("sold_out")).toBe(true);
    expect(statuses.has("cancelled")).toBe(true);
  });

  it("is newest first", async () => {
    const { nonMember } = await loadDemoIdentities();
    const held = await myRegistrations(nonMember);
    const times = held.map((registration) => registration.createdAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe.skipIf(!available)("dashboardSummary", () => {
  it("gives the committee the five fields the contract names", async () => {
    const { admin } = await loadDemoIdentities();
    const summary = await dashboardSummary(admin);

    expect(summary.upcomingEvents.length).toBeGreaterThan(0);
    for (const event of summary.upcomingEvents) {
      expect(event.status).toBe("published");
      expect(event.startsAt.getTime()).toBeGreaterThanOrEqual(Date.now() - 60_000);
      expect(event.spotsRemaining).toBe(Math.max(event.capacity - event.registeredCount, 0));
    }

    expect(summary.capacityUsed.capacity).toBe(
      summary.upcomingEvents.reduce((total, event) => total + event.capacity, 0),
    );
    expect(summary.capacityUsed.registered).toBe(
      summary.upcomingEvents.reduce((total, event) => total + event.registeredCount, 0),
    );
    expect(summary.capacityUsed.usedRatio).toBeGreaterThanOrEqual(0);
    expect(summary.capacityUsed.usedRatio).toBeLessThanOrEqual(1);

    expect(summary.registrationsToday).toBeGreaterThanOrEqual(0);

    const split = summary.membershipSplit;
    expect(split.memberPrice + split.publicPrice).toBe(split.total);
    expect(split.total).toBeGreaterThan(0);

    expect(summary.recentCheckIns.length).toBeGreaterThan(0);
    expect(summary.recentCheckIns.length).toBeLessThanOrEqual(10);
    const checkInTimes = summary.recentCheckIns.map((entry) => entry.checkedInAt.getTime());
    expect([...checkInTimes].sort((a, b) => b - a)).toEqual(checkInTimes);
    for (const entry of summary.recentCheckIns) {
      expect(entry.eventTitle.length).toBeGreaterThan(0);
      expect(entry.userFullName.length).toBeGreaterThan(0);
      expect(entry.ticketCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    }
  });

  it("is scoped by RLS rather than refused, when an attendee asks", { retry: 2 }, async () => {
    const { admin, member } = await loadDemoIdentities();
    const [asMember, asAdmin] = await Promise.all([
      dashboardSummary(member),
      dashboardSummary(admin),
    ]);

    // Capacity is public and identical; the private counts are not.
    expect(asMember.capacityUsed).toEqual(asAdmin.capacityUsed);
    expect(asMember.membershipSplit.total).toBeLessThan(asAdmin.membershipSplit.total);
  });
});
