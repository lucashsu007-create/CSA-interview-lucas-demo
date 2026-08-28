/**
 * The single place snake_case becomes camelCase.
 *
 * Contract §1 calls the mapping mechanical, and it stays mechanical only if it
 * exists once. Nothing else in either client may rename a column: a screen that
 * reads `row.member_number` is a bug even when it works.
 *
 * Each `toX` carries an explicit return type, so a renamed or dropped column is
 * a compile error here rather than an `undefined` in a UI.
 */

import type {
  AnalyticsEvent,
  AuditEvent,
  Event,
  MembershipPeriod,
  Partner,
  Payment,
  Registration,
  ScanAttempt,
  User,
} from "@csa/domain";

import { toDate, toDateOrNull } from "./primitives";
import type {
  AnalyticsEventRow,
  AuditEventRow,
  EventRow,
  MembershipPeriodRow,
  PartnerRow,
  PaymentRow,
  RegistrationRow,
  ScanAttemptRow,
  UserRow,
} from "./rows";
import {
  analyticsEventRowSchema,
  auditEventRowSchema,
  eventRowSchema,
  membershipPeriodRowSchema,
  partnerRowSchema,
  paymentRowSchema,
  registrationRowSchema,
  scanAttemptRowSchema,
  userRowSchema,
} from "./rows";

interface RowSchemaLike<Row> {
  parse(data: unknown): Row;
}

function makeRowParsers<Row, Domain>(
  schema: RowSchemaLike<Row>,
  map: (row: Row) => Domain,
): {
  parseRow: (row: unknown) => Domain;
  parseRows: (rows: unknown) => Domain[];
} {
  const parseRow = (row: unknown): Domain => map(schema.parse(row));
  const parseRows = (rows: unknown): Domain[] => {
    if (!Array.isArray(rows)) {
      throw new TypeError(`expected an array of rows, received ${typeof rows}`);
    }
    return rows.map((row) => parseRow(row));
  };
  return { parseRow, parseRows };
}

/* -------------------------------------------------------------------------- */
/* Row -> domain                                                              */
/* -------------------------------------------------------------------------- */

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: toDate(row.created_at),
  };
}

export function toMembershipPeriod(row: MembershipPeriodRow): MembershipPeriod {
  return {
    id: row.id,
    userId: row.user_id,
    memberNumber: row.member_number,
    membershipType: row.membership_type,
    status: row.status,
    startsAt: toDate(row.starts_at),
    expiresAt: toDate(row.expires_at),
    createdAt: toDate(row.created_at),
  };
}

export function toEvent(row: EventRow): Event {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: row.location,
    startsAt: toDate(row.starts_at),
    registrationDeadlineAt: toDate(row.registration_deadline_at),
    capacity: row.capacity,
    priceMemberCents: row.price_member_cents,
    pricePublicCents: row.price_public_cents,
    status: row.status,
    imageUrl: row.image_url,
    createdAt: toDate(row.created_at),
  };
}

export function toRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    ticketCode: row.ticket_code,
    pricePaidCents: row.price_paid_cents,
    isMemberPrice: row.is_member_price,
    paymentStatus: row.payment_status,
    checkedInAt: toDateOrNull(row.checked_in_at),
    createdAt: toDate(row.created_at),
  };
}

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    registrationId: row.registration_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: toDate(row.created_at),
  };
}

export function toScanAttempt(row: ScanAttemptRow): ScanAttempt {
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    eventId: row.event_id,
    deviceId: row.device_id,
    scannedAt: toDate(row.scanned_at),
    receivedAt: toDate(row.received_at),
    outcome: row.outcome,
    createdAt: toDate(row.created_at),
  };
}

export function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    category: row.category,
    discountText: row.discount_text,
    address: row.address,
  };
}

export function toAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
  };
}

export function toAnalyticsEvent(row: AnalyticsEventRow): AnalyticsEvent {
  return {
    id: row.id,
    name: row.name,
    userId: row.user_id,
    properties: row.properties,
    createdAt: toDate(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Validate + map                                                             */
/* -------------------------------------------------------------------------- */

export const { parseRow: parseUserRow, parseRows: parseUserRows } = makeRowParsers(
  userRowSchema,
  toUser,
);

export const { parseRow: parseMembershipPeriodRow, parseRows: parseMembershipPeriodRows } =
  makeRowParsers(membershipPeriodRowSchema, toMembershipPeriod);

export const { parseRow: parseEventRow, parseRows: parseEventRows } = makeRowParsers(
  eventRowSchema,
  toEvent,
);

export const { parseRow: parseRegistrationRow, parseRows: parseRegistrationRows } = makeRowParsers(
  registrationRowSchema,
  toRegistration,
);

export const { parseRow: parsePaymentRow, parseRows: parsePaymentRows } = makeRowParsers(
  paymentRowSchema,
  toPayment,
);

export const { parseRow: parseScanAttemptRow, parseRows: parseScanAttemptRows } = makeRowParsers(
  scanAttemptRowSchema,
  toScanAttempt,
);

export const { parseRow: parsePartnerRow, parseRows: parsePartnerRows } = makeRowParsers(
  partnerRowSchema,
  toPartner,
);

export const { parseRow: parseAuditEventRow, parseRows: parseAuditEventRows } = makeRowParsers(
  auditEventRowSchema,
  toAuditEvent,
);

export const { parseRow: parseAnalyticsEventRow, parseRows: parseAnalyticsEventRows } =
  makeRowParsers(analyticsEventRowSchema, toAnalyticsEvent);

/* -------------------------------------------------------------------------- */
/* Composable schema form, for RPC results                                    */
/* -------------------------------------------------------------------------- */

export const userFromRowSchema = userRowSchema.transform(toUser);
export const membershipPeriodFromRowSchema =
  membershipPeriodRowSchema.transform(toMembershipPeriod);
export const eventFromRowSchema = eventRowSchema.transform(toEvent);
export const registrationFromRowSchema = registrationRowSchema.transform(toRegistration);
export const paymentFromRowSchema = paymentRowSchema.transform(toPayment);
export const scanAttemptFromRowSchema = scanAttemptRowSchema.transform(toScanAttempt);
export const partnerFromRowSchema = partnerRowSchema.transform(toPartner);
export const auditEventFromRowSchema = auditEventRowSchema.transform(toAuditEvent);
export const analyticsEventFromRowSchema = analyticsEventRowSchema.transform(toAnalyticsEvent);
