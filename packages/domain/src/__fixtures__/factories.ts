/**
 * Fixtures for the domain unit tests. Fictional data only — the demo identities
 * from contract §7 and nothing that resembles a real member, ticket or payment.
 *
 * Not exported from the package barrel: this is test scaffolding, not vocabulary.
 */

import type {
  Event,
  MembershipPeriod,
  Payment,
  Registration,
  ScanAttempt,
  User,
} from "../entities";

export const DEMO_IDS = {
  memberUser: "00000000-0000-4000-8000-000000000001",
  nonMemberUser: "00000000-0000-4000-8000-000000000002",
  adminUser: "00000000-0000-4000-8000-000000000003",
  staffUser: "00000000-0000-4000-8000-000000000004",
  gala: "00000000-0000-4000-8000-0000000000a1",
  workshop: "00000000-0000-4000-8000-0000000000a2",
  membership: "00000000-0000-4000-8000-0000000000b1",
  registration: "00000000-0000-4000-8000-0000000000c1",
  payment: "00000000-0000-4000-8000-0000000000d1",
  scanAttempt: "00000000-0000-4000-8000-0000000000e1",
} as const;

export const EPOCH = new Date("2026-01-01T00:00:00.000Z");

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: DEMO_IDS.memberUser,
    email: "member@demo.local",
    fullName: "Demo Member",
    role: "attendee",
    createdAt: EPOCH,
    ...overrides,
  };
}

export function makeMembershipPeriod(overrides: Partial<MembershipPeriod> = {}): MembershipPeriod {
  return {
    id: DEMO_IDS.membership,
    userId: DEMO_IDS.memberUser,
    memberNumber: "CSA-0001",
    membershipType: "general",
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-12-31T23:59:59.000Z"),
    createdAt: EPOCH,
    ...overrides,
  };
}

export function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: DEMO_IDS.gala,
    title: "Demo Spring Gala",
    description: "A fictional event for the prototype.",
    category: "social",
    location: "Rotterdam",
    startsAt: new Date("2026-06-01T18:00:00.000Z"),
    registrationDeadlineAt: new Date("2026-05-25T22:00:00.000Z"),
    capacity: 120,
    priceMemberCents: 1500,
    pricePublicCents: 2500,
    status: "published",
    imageUrl: null,
    createdAt: EPOCH,
    ...overrides,
  };
}

export function makeRegistration(overrides: Partial<Registration> = {}): Registration {
  return {
    id: DEMO_IDS.registration,
    eventId: DEMO_IDS.gala,
    userId: DEMO_IDS.memberUser,
    ticketCode: "K3M9QZ7B2T",
    pricePaidCents: 1500,
    isMemberPrice: true,
    paymentStatus: "paid",
    checkedInAt: null,
    createdAt: EPOCH,
    ...overrides,
  };
}

export function makePayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: DEMO_IDS.payment,
    registrationId: DEMO_IDS.registration,
    provider: "mock",
    providerReference: "mock_ref_0001",
    amountCents: 1500,
    status: "paid",
    createdAt: EPOCH,
    ...overrides,
  };
}

export function makeScanAttempt(overrides: Partial<ScanAttempt> = {}): ScanAttempt {
  return {
    id: DEMO_IDS.scanAttempt,
    ticketCode: "K3M9QZ7B2T",
    eventId: DEMO_IDS.gala,
    deviceId: "demo-scanner-01",
    scannedAt: new Date("2026-06-01T18:05:00.000Z"),
    receivedAt: new Date("2026-06-01T18:05:02.000Z"),
    outcome: "success",
    createdAt: EPOCH,
    ...overrides,
  };
}
