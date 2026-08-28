# CSA Digital Hub — frozen Wave 0 contract

Every workstream builds against this file. If something here is wrong, change it
here first and tell the lead; do not diverge locally. The Wave 0 gate is that all
workstreams use the same entity names, ids, routes and tokens.

Status: concept prototype, fictional data only.

## 1. Conventions

- PostgreSQL is snake_case, tables plural. TypeScript is camelCase. The mapping
  is mechanical: `member_number` ↔ `memberNumber`.
- Primary keys are `uuid` (v4), column `id`.
- Money is **integer cents**, EUR, never a float. Columns end `_cents`.
- Timestamps are `timestamptz`, always UTC. Columns end `_at`.
- Every enum below is **closed**. Adding a value is a schema change, not a
  string literal in a component.

## 2. Roles versus membership

`user_role` = `attendee` | `staff` | `admin`

**Role governs permissions only. Member pricing is never derived from role** —
it is derived from an active membership period at registration time. A user with
role `attendee` and an active membership gets the member price; the same user
after expiry gets the public price. Guests are simply unauthenticated and have no
row.

## 3. Enums

| Enum | Values |
|---|---|
| `user_role` | `attendee`, `staff`, `admin` |
| `membership_type` | `general`, `alumni`, `honorary` |
| `membership_status` | `active`, `expired`, `cancelled` |
| `event_category` | `social`, `cultural`, `career`, `educational`, `sports` |
| `event_status` | `draft`, `published`, `sold_out`, `cancelled` |
| `payment_status` | `pending`, `paid`, `failed`, `refunded` |
| `check_in_outcome` | `success`, `duplicate`, `wrong_event`, `invalid` |
| `legacy_system` | `wordpress`, `mongodb`, `google_forms`, `mollie`, `office_ledger` |
| `import_mode` | `dry_run`, `load`, `delta` |
| `import_run_status` | `running`, `succeeded`, `failed`, `rolled_back` |
| `import_disposition` | `accepted`, `warning`, `rejected` |
| `quarantine_reason` | `ambiguous_duplicate`, `unparseable_date`, `missing_required_field`, `unresolvable_country`, `orphaned_reference`, `conflicting_status`, `out_of_scope` |
| `quarantine_state` | `open`, `resolved`, `discarded` |

## 4. Tables

**users** — `id`, `email` (unique, citext), `full_name`, `role user_role`, `created_at`
Provenance for imported rows: `source_system legacy_system NULL`, `source_id text NULL`, `import_run_id uuid NULL → import_runs`. All three are NULL for rows this platform created itself; when `source_system` is set, `(source_system, source_id)` is unique and is the importer's idempotency key (§16).

**membership_periods** — `id`, `user_id → users`, `member_number` (unique),
`membership_type`, `status membership_status`, `starts_at`, `expires_at`,
`created_at`.
A membership is active when `status = 'active' AND now() BETWEEN starts_at AND expires_at`.
A user may have several periods; at most one active at a time.
Provenance for imported rows: `source_system legacy_system NULL`, `source_id text NULL`, `import_run_id uuid NULL → import_runs`. All three are NULL for rows this platform created itself; when `source_system` is set, `(source_system, source_id)` is unique and is the importer's idempotency key (§16).

**events** — `id`, `title`, `description`, `category event_category`, `location`,
`starts_at`, `registration_deadline_at`, `capacity int CHECK (capacity > 0)`,
`price_member_cents int`, `price_public_cents int`, `status event_status`,
`image_url`, `created_at`
Provenance for imported rows: `source_system legacy_system NULL`, `source_id text NULL`, `import_run_id uuid NULL → import_runs`. All three are NULL for rows this platform created itself; when `source_system` is set, `(source_system, source_id)` is unique and is the importer's idempotency key (§16).

**registrations** — `id`, `event_id → events`, `user_id → users`,
`ticket_code` (unique), `price_paid_cents`, `is_member_price bool`,
`payment_status`, `checked_in_at timestamptz NULL`, `created_at`.
Unique constraint on `(event_id, user_id)` — one registration per user per event.
Provenance for imported rows: `source_system legacy_system NULL`, `source_id text NULL`, `import_run_id uuid NULL → import_runs`. All three are NULL for rows this platform created itself; when `source_system` is set, `(source_system, source_id)` is unique and is the importer's idempotency key (§16).

**payments** — `id`, `registration_id → registrations`, `provider` (`mock`),
`provider_reference`, `amount_cents`, `status payment_status`, `created_at`
Provenance for imported rows: `source_system legacy_system NULL`, `source_id text NULL`, `import_run_id uuid NULL → import_runs`. All three are NULL for rows this platform created itself; when `source_system` is set, `(source_system, source_id)` is unique and is the importer's idempotency key (§16).

**scan_attempts** — `id`, `ticket_code`, `event_id`, `device_id`,
`scanned_at` (the scanner's reported time), `received_at` (server time),
`outcome check_in_outcome`, `created_at`.
Every scan is recorded here, including duplicates and rejections. This table is
the evidence for the offline-sync story.

**partners** — `id`, `name`, `city`, `category`, `discount_text`, `address`

**audit_events** — `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`,
`metadata jsonb`, `created_at`

**analytics_events** — `id`, `name`, `user_id NULL`, `properties jsonb`, `created_at`.
Closed enum of names: `event_viewed`, `registration_started`,
`registration_completed`, `payment_failed`, `ticket_opened`,
`check_in_attempted`, `check_in_succeeded`, `check_in_rejected`.

## 5. The two functions that carry the demo

Business rules are enforced **inside the database**, not in application code.
Both are `SECURITY DEFINER` and callable by RPC from either client.

### `register_for_event(p_event_id uuid, p_user_id uuid) → registrations`

In one transaction, in this order:

1. `SELECT ... FROM events WHERE id = p_event_id FOR UPDATE` — the row lock is
   what makes the capacity check safe. Without it two callers both read
   capacity-1 and both insert.
2. Reject unless `status = 'published'` → `event_not_published`
3. Reject if `now() > registration_deadline_at` → `registration_closed`
4. Count existing registrations for the event; reject if `>= capacity` → `event_full`
5. Resolve price: active membership period for `p_user_id` at `now()` decides
   `price_member_cents` vs `price_public_cents`, and sets `is_member_price`
6. Generate a non-sequential `ticket_code` (see §6)
7. Insert the registration. `payment_status` is `paid` when the resolved price is
   0, otherwise `pending`
8. Write an `audit_events` row

Raise the named errors above as `SQLSTATE` conditions the clients map to
messages. Do not return null on failure.

### `check_in_ticket(p_ticket_code text, p_event_id uuid, p_scanned_at timestamptz, p_device_id text) → check_in_outcome + registration`

1. Always insert a `scan_attempts` row, whatever the outcome
2. Unknown code → `invalid`
3. Code belongs to a different event → `wrong_event`
4. Already checked in → `duplicate`, returning the **canonical** `checked_in_at`,
   not an error and not a second record
5. Otherwise set `checked_in_at = least(p_scanned_at, now())` and return `success`

**Conflict rule for queued offline scans:** `checked_in_at := least(stored, new)`.
The canonical time is the earliest *reported* scan, which is not necessarily the
first scan the server saw — a queued offline scan that syncs late but reports an
earlier time corrects the value downward. A scan reporting a *later* time never
changes it. After the first, every scan returns `duplicate` and none creates a
second check-in.

An earlier draft of this rule said both "earliest reported wins" and "a late scan
never overwrites", which disagree precisely when a late scan reports an earlier
time. `least()` is the resolution and the tests assert both orderings.

**Return shape.** `check_in_ticket` returns a flat `check_in_result` composite,
not a nested registration: `(outcome, registration_id, event_id, user_id,
ticket_code, checked_in_at, scan_attempt_id)`. It carries what a scanner needs at
the door and nothing else. `scan_attempt_id` is present on every outcome
including rejections, because the scan is recorded before anything is decided.

**Errors.** Raised with the token as the exception MESSAGE and a human sentence in
DETAIL, under SQLSTATE class `CSA` (unused by PostgreSQL): `CSA00`
`invalid_arguments`, `CSA01` `event_not_published`, `CSA02` `registration_closed`,
`CSA03` `event_full`, `CSA04` `event_not_found`, `CSA05` `already_registered`,
`CSA06` `ticket_code_exhausted`, `CSA07` `user_not_found`, `CSA42` `forbidden`.
`event_full` is not a valid five-character SQLSTATE, so the token lives in the
message and clients match on it.

## 6. Tickets and signing

`ticket_code` is 10 characters of Crockford base32 from a CSPRNG — unique,
non-sequential, and not derived from any id.

The QR payload is **not** the ticket code alone. It is:

```
base64url(JSON{ tid, eid, exp }) + "." + base64url(ed25519_signature)
```

- Signing is **Ed25519**, done by a server-side signer. `pgcrypto` cannot do
  Ed25519 — it has HMAC and PGP functions only — so the signer is a Supabase
  Edge Function (Deno Web Crypto) or a Node route using `node:crypto`. Postgres
  owns the transaction; the signer owns the key.
- The private key lives in server secrets. It is never in a client bundle.
- The scanner ships **only the public key** and verifies offline, then calls
  `check_in_ticket` for the authoritative record.
- `tid` is the **ticket code**, not the registration id, so a scanner can call
  `check_in_ticket` from the payload alone without a prior lookup. `exp` is Unix
  **seconds**, per JWT convention — nothing in the payload distinguishes seconds
  from milliseconds at parse time, so it is pinned here.
- Tokens are short-lived (`exp` minutes, not days). The member app refreshes the
  token while the ticket or membership card is on screen — which is also how the
  rotating-credential requirement for the membership card is satisfied.

Endpoint: `POST /functions/v1/sign-ticket` with `{ registrationId }`, returning
`{ token, expiresAt }`, authorised to the owning user or to `staff`/`admin`.

## 7. Demo identities

Fictional only, seeded, no real addresses:

- `member@demo.local` — active general membership
- `nonmember@demo.local` — registered user, no active membership
- `admin@demo.local` — role `admin`
- `staff@demo.local` — role `staff`

Auth is seeded sessions. Magic link is not available: `.local` is undeliverable.

## 8. Directory ownership for this wave

| Workstream | Owns | Must not touch |
|---|---|---|
| Scaffold | root manifests, tsconfig, vitest config, `.editorconfig` | anything under `packages/`, `supabase/` |
| Database | `supabase/migrations/**`, `supabase/tests/**` | `supabase/seed.sql` |
| Seed | `supabase/seed.sql` | `supabase/migrations/**` |
| Domain | `packages/domain/**`, `packages/validation/**` | `packages/design-tokens/**` |
| Tokens | `packages/design-tokens/**` | everything else |

Nobody installs dependencies, runs a build, or commits. The lead integrates.

## 9. Open decisions carried out of Wave 0

Recorded rather than silently fixed, because contract and schema currently agree
and a one-sided change would be worse than a known gap. Wave 1 opens by
resolving them.

1. **`member_number` belongs to the person, not the period.** It is currently
   `UNIQUE` on `membership_periods`, so a renewing member cannot keep their
   number across periods — and the membership card displays that number. The
   full migration plan already models this correctly by separating
   `MemberProfile` from `MembershipPeriod`; this contract collapsed the two.
   Fixing it touches the schema, seed, domain types and validation together.
2. **No link between `public.users.id` and Supabase `auth.users.id`.** RLS needs
   `auth.uid()`, and seeded sessions must mint tokens whose `sub` equals
   `public.users.id`. Nothing currently owns creating those auth rows, so no one
   can actually sign in yet.
3. **A failed payment permanently consumes a place.** Capacity counts every
   registration including `failed` and `refunded`, and there is no cancellation
   path, so a card decline silently costs the event a seat.
4. **Capacity is public information stored in a private table.** `anon` has no
   `SELECT` on `registrations` and an attendee sees only their own rows, so
   `registeredCount` cannot be computed under the caller's session — a member
   would read a count of 1 where the true figure is 9. Needs a `security
   definer` capacity function or view. Until then `withPrivilegedRead
   ('public-event-capacity')` covers it.
5. **A member's own tickets are hidden by `events_read_published`.** It filters
   out `sold_out` and `cancelled` events, so joining a member's registrations to
   `events` under their session drops precisely the tickets whose status they
   would check. Needs an `events_read_own_registration` policy.
6. **`check_in_ticket` emits a row `@csa/validation` refuses.** On `invalid` it
   returns the scanned code with null ids, which the "partially populated
   ticket" guard rejects. Either the function returns a null `ticket_code` when
   there is no registration, or the schema loosens. The data layer currently
   normalises it before parsing.
7. **No `check_in_outcome` for a valid but unpaid ticket.** The enum is closed at
   success/duplicate/wrong_event/invalid, so check-in cannot express "this ticket
   exists but was never paid for". Check-in deliberately does not consult
   `payment_status` today.

---

# Wave 1 contract

## 10. Runtime topology

Neither Docker nor the Supabase CLI is available on this machine, so there is no
local PostgREST and no GoTrue. That constraint turns out to push the design
toward the full migration plan's own shape rather than away from it:

- **PostgreSQL is reached server-side only**, through `packages/api-client`
  using the `postgres` driver. No client ever holds a database credential.
- **The Next.js admin app serves both surfaces**: the committee UI, and the JSON
  API the Expo app consumes. That is the migration plan's "Application API" box,
  and it means the mobile app talks HTTP rather than SQL.
- Moving to a real Supabase project later replaces the driver and the base URL.
  It changes no SQL, because of the session mechanism below.

## 11. Sessions without GoTrue

`current_app_user_id()` resolves identity from three sources in order:
`request.jwt.claims`, then `request.jwt.claim.sub`, then `csa.current_user_id`.
The first is exactly the GUC Supabase sets, so:

- Picking a demo identity mints an **HS256 JWT** (`jose`) carrying
  `sub = public.users.id` and `role = authenticated`. It is stored in an
  httpOnly cookie on web and in `expo-secure-store` on mobile.
- **Every** database call opens a transaction and issues
  `set local request.jwt.claims = '{"sub":"…","role":"authenticated"}'` before
  any statement. `set local` means it dies with the transaction and cannot leak
  into the next borrower of a pooled connection. In practice this is spelled
  `select set_config('request.jwt.claims', $1, true)`, because `SET` takes no
  placeholders and a uuid must never be concatenated into SQL.
- **It must also `set local role`.** Claims alone change nothing here: this
  prototype connects as the schema owner, who is exempt from every policy, so
  without a role switch RLS is inert. Setting `anon` or `authenticated` per
  transaction mirrors how PostgREST connects as `authenticator` and switches per
  request. A consequence worth knowing locally: `is_privileged_session()` falls
  back to `pg_has_role(session_user, …)` and `SET ROLE` does not change
  `session_user`, so a *guest* transaction reads as privileged on bare
  PostgreSQL and only the GRANT layer stops it. On Supabase `session_user` is
  `authenticator`, so this is a local artefact — but guest-path RLS is thinner
  here than it looks.
- A guest sets nothing, so `current_app_user_id()` returns NULL and RLS shows
  only published events.
- `service_role` is never issued to a client. It exists for migrations only.

This is why open decision 2 needed no schema change: `public.users.id` **is** the
subject. There is no `auth.users` to link to.

## 12. `packages/api-client` — frozen surface

Both apps import this and nothing else reaches the database.

```ts
// session
signSession(userId: Uuid): Promise<string>
verifySession(token: string | null): Promise<Uuid | null>

// access — every call runs inside `set local request.jwt.claims`
withSession<T>(userId: Uuid | null, fn: (sql: Sql) => Promise<T>): Promise<T>

// reads
listPublishedEvents(as: Uuid | null, filter?: { category?: EventCategory }): Promise<EventListItem[]>
getEvent(as: Uuid | null, eventId: Uuid): Promise<EventDetail | null>
listPartners(as: Uuid | null): Promise<Partner[]>
activeMembership(as: Uuid): Promise<MembershipPeriod | null>
myRegistrations(as: Uuid): Promise<RegistrationWithEvent[]>
dashboardSummary(as: Uuid): Promise<DashboardSummary>

// writes — thin wrappers over the two SECURITY DEFINER functions
registerForEvent(as: Uuid, eventId: Uuid): Promise<Registration>   // maps CSA* -> RegistrationErrorCode
checkInTicket(as: Uuid, input: CheckInTicketInput): Promise<CheckInResult>
```

`withPrivilegedRead(reason, fn)` is also exported. It is a `begin read only`
transaction that assumes no caller identity, stamps its reason into
`application_name`, and exists only because two facts this contract treats as
public are stored in tables RLS hides. Its three reasons are closed and
enumerated: `public-event-capacity`, `own-ticket-events`, `demo-identity`. The
first two delete themselves when the schema grows the objects in §9; the third
dies with the seeded-session model. It is exported rather than hidden because
the alternative is surfaces reaching around this package to the raw pool.

`EventListItem` carries `registeredCount` and `spotsRemaining` so no screen
computes capacity itself.

Missing from this surface and needed by the committee portal:
`listEventsForCommittee(as)`, which leaves the status filter to RLS instead of
hard-coding `status = 'published'` in SQL. Without it the register cannot show
draft, sold-out or cancelled events, and the admin app composes several calls to
work around it. `DashboardSummary` carries upcoming events,
registrations today, capacity used, member/non-member split, and recent
check-ins — the fields the demo plan's dashboard names, and nothing else.

## 13. HTTP API served by `apps/admin`

The Expo app consumes exactly these. Session cookie or `Authorization: Bearer`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/session` | Pick a seeded demo identity, returns the token |
| `DELETE` | `/api/session` | Sign out |
| `GET` | `/api/events` | Published events, optional `?category=` |
| `GET` | `/api/events/:id` | One event with capacity and pricing |
| `POST` | `/api/events/:id/register` | Calls `register_for_event` |
| `GET` | `/api/me` | Identity, role, active membership |
| `GET` | `/api/me/registrations` | Tickets held |
| `GET` | `/api/partners` | Partner directory |
| `POST` | `/api/check-in` | Calls `check_in_ticket`, staff/admin only |

Response envelopes are objects, never bare arrays, so a response can grow a
field without breaking a client: `{ events: [...] }`, `{ event: {...} }`,
`{ registration: {...} }`, `{ user: {...}, activeMembership: {...} | null }`,
`{ partners: [...] }`, `{ token: "..." }`. `POST /api/session` takes
`{ "email": "member@demo.local" }`. Bodies are camelCase — the snake_case
boundary is the database, and it is crossed once inside `@csa/validation`.

Registration errors map to HTTP by token: `event_full` → 409,
`registration_closed` → 409, `event_not_published` → 404, `already_registered` →
409, `forbidden` → 403. The token travels in the body as `{ error: "event_full" }`
so clients switch on it rather than parsing prose.

## 14. Wave 1 directory ownership

| Workstream | Owns |
|---|---|
| Data layer | `packages/api-client/**` |
| Admin | `apps/admin/**` |
| Mobile | `apps/mobile/**` |
| Dev tooling | `scripts/**`, `tests/critical-flow/**` |

Wave 1's gate: the member app and the committee portal both read the same seeded
events, through the same API, with a real session.

---

# Wave M contract — the migration harness

Wave M builds the other half of the proposal: the path from CSA's current
WordPress + MongoDB + Google Forms estate into the schema above, and the
reconciliation that proves the move lost and invented nothing.

Status is unchanged and non-negotiable: **synthetic fixtures only**. No CSA
system is read, written, probed or credentialed by any of this. A green import
over fictional rows is never described as a migration of anything.

## 15. What the harness is modelled on

Five legacy sources, each corresponding to something publicly visible on CSA's
own surfaces as of 2026-08-24. The `legacy_system` enum names exactly these:

| `legacy_system` | Stands for | Public evidence |
|---|---|---|
| `wordpress` | pages, events and the 2013–2026 archive | `/wp-content/uploads/` paths throughout `csa-rotterdam.nl` |
| `mongodb` | the membership database | IT Committee description 2026/27 |
| `google_forms` | actives recruitment and event sign-ups | `docs.google.com/forms/…` on `/actives-recruitment/` |
| `mollie` | iDEAL payment records | the published privacy policy; iDEAL offered at membership sign-up |
| `office_ledger` | members registered in person | "If you cannot pay using iDEAL, please come to our office to register" |

`office_ledger` is the one that makes the harness interesting rather than
decorative. A second, manual intake path beside the online one is where the same
human ends up in two systems under two spellings, and it is the reason
deduplication and quarantine exist here at all.

## 16. Migration tables

**import_runs** — `id`, `source_system legacy_system NULL`, `mode import_mode`,
`status import_run_status`, `extract_id text`, `extract_sha256 text`,
`extract_schema_version text`, `extract_counts jsonb`, `started_at`,
`finished_at timestamptz NULL`, `accepted_count int`, `warning_count int`,
`rejected_count int`, `notes text NULL`, `created_at`

`source_system` is NULL for a run that covers the whole estate, which is the
normal case rather than the exception: deduplication is cross-source by nature —
the office ledger only matters because its rows may be the same people as the
MongoDB ones — so a transform that saw one system at a time could not resolve
the duplicates that motivate the harness. A per-system value is for a run that
genuinely imported one source alone.

`extract_counts` is the count recorded at extract time, before anything touched
the data, and it is the number every reconciliation compares against. It is
stored on the run rather than recomputed, because recomputing it from the
transformed set is exactly the mistake the comparison exists to catch.

**import_records** — `id`, `import_run_id → import_runs`,
`source_system legacy_system`, `source_id text`, `entity_type text`,
`disposition import_disposition`, `target_id uuid NULL`, `applied_rules text[]`,
`detail text NULL`, `created_at`

One row per source row per run, so `accepted + warning + rejected` equals the
source count by construction. A `warning` row imported with a derived or
defaulted field and is what manual sampling reads first. A `rejected` row did
not import, always has a matching quarantine record, and must not claim a
`target_id`.

That constraint is deliberately one-directional. The converse does not hold: a
`dry_run` writes the full report and no target rows at all, and a row merged
into an existing person by an approved dedup rule points at the winner rather
than at a row of its own. Requiring a target for every non-rejected record would
make both unrepresentable.

**quarantine_records** — `id`, `import_run_id → import_runs`,
`source_system legacy_system`, `source_id text`, `entity_type text`,
`reason quarantine_reason`, `state quarantine_state`, `payload jsonb`,
`occurred_year int NULL`, `payment_status payment_status NULL`,
`amount_cents int NULL`, `resolved_by_user_id uuid NULL → users`,
`resolved_at timestamptz NULL`, `resolution_note text NULL`, `created_at`

The reason is a closed enum, never free text, because § 17 of the migration plan
requires the breakdown and free text cannot be counted.

One value is currently unreachable and that is recorded rather than hidden:
`unresolvable_country` describes a phone number whose country cannot be
established, and no target table has a phone column, so the field is dropped by
minimisation before the question arises. The fixture still plants the case, and
the vocabulary stays agreed up front — a reason invented on the day of an import
is an unreviewable decision, which is the reason the set is closed at all. `occurred_year` buckets
the row for the per-year comparison; `payment_status` and `amount_cents` carry
the financial half, so a quarantine set can explain a revenue difference and not
only a row-count one. Resolving a record requires an admin identity and a
`resolution_note`, and writes an `audit_events` row.

**dedup_decisions** — `id`, `import_run_id → import_runs`, `entity_type text`,
`rule text`, `winner_source_system legacy_system`, `winner_source_id text`,
`merged_source_system legacy_system`, `merged_source_id text`, `created_at`

Both sides of every merge are recorded. A dedup that keeps only the winner is
irreversible in practice and unreviewable in principle.

**legacy_urls** — `id`, `legacy_url text` (unique), `target_path text NULL`,
`redirect_status int`, `source_system legacy_system`, `note text NULL`,
`created_at`

The redirect map for § 14 of the migration plan. `redirect_status` is 301 for a
mapped URL and 410 for content deliberately retired; `target_path` is NULL only
when the status is 410. CSA currently publishes at least five brand domains —
`csa-rotterdam.nl`, `csa-eur.nl`, `membership.csa-rotterdam.nl`,
`csa-careerdays.nl`, `csa-utrecht.nl` — and the main site's own logo still
points at the legacy `csa-eur.nl`, so an unmapped legacy URL is a live failure
mode rather than a hypothetical one.

## 17. Reconciliation is not a database function

There is no third `SECURITY DEFINER` function. Reconciliation compares three
numbers that do not all live in PostgreSQL: the extract count from
`import_runs.extract_counts`, the target count from the imported rows, and the
quarantined count. It is therefore computed in `packages/migrate`, in
TypeScript, and tested under Vitest with no database.

    delta = target + quarantined + merged - source

Per source system, entity **and** year, never as one aggregate, plus a separate
comparison per `payment_status` on both row counts and cents.

The `merged` term is this contract's addition to the method in the
csa-data-migration skill, which states the formula without it. Deduplication is
part of that same method, and a merge legitimately removes a target row: two
source records become one. Without the term, every correctly resolved duplicate
reads as an unexplained shortfall, and the reconciliation would fail precisely
the imports that did the right thing. Merges qualify because
`dedup_decisions` records both sides of every one, which makes them exactly as
accountable as a quarantine — the point of the formula is that a difference has
a written account, not that quarantine is the only possible account.

With that term, a non-zero delta remains unexplained by construction: quarantine
and dedup are the only two mechanisms available for accounting for a difference,
and both leave a row behind.

Buckets must be **disjoint**. A source row counted under two entities can only
ever be counted once on the target side, so an overlapping bucket makes the
arithmetic meaningless rather than merely imprecise. The three permitted verdicts are `RECONCILES`,
`DOES_NOT_RECONCILE` and `NOT_YET_MEASURABLE`, and the last is the correct
answer whenever an input is missing rather than a confident one from an
incomplete run.

## 18. Importer invariants

1. Idempotent on `(source_system, source_id)`. Running an import twice changes
   nothing the second time, and that is asserted by running it twice, not by
   reading the code.
2. Writes through `@csa/validation`, the same boundary the application uses. An
   importer with a private idea of the domain imports rows the app cannot read.
3. Loads into a staging database first. `mode = 'dry_run'` performs the full
   transform and writes the reports and the quarantine set, and no target rows.
4. Every rejection carries a machine-readable reason from the closed set.
5. Personal data absent from a named use is not carried across.
6. `delta` mode imports only source rows unseen by a prior run of the same
   source, and is what the cutover's post-freeze step runs.

## 19. Wave M directory ownership

| Workstream | Owns |
|---|---|
| Contract and schema | `docs/architecture.md`, `supabase/migrations/2026082*_migration_*.sql` |
| Fixtures | `packages/legacy-fixtures/**` |
| Importer and reconciler | `packages/migrate/**` |
| Console | `apps/admin/app/migration/**`, `apps/admin/app/api/migration/**` |
| Cutover | `scripts/cutover.sh`, `tests/critical-flow/cutover.*.spec.ts` |

Wave M's gate: `pnpm migrate:demo` imports the synthetic estate end to end, the
reconciler prints a per-entity-per-year table with every delta at zero and a
non-empty quarantine set with reasons, and a second run of the same import
changes no row.

## 20. The migration console's HTTP surface

Separate from §13 on purpose. §13 is the exact surface the Expo app is allowed
to depend on; nothing below is for the member app, and adding it there would
widen what a phone can ask for. Every route here is admin-only, and RLS enforces
that a second time at the row level rather than trusting the handler.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/migration/runs` | Import runs, newest first, with their counts |
| `GET` | `/api/migration/quarantine` | Quarantined rows, filterable by state |
| `POST` | `/api/migration/quarantine/resolve` | Close one record; needs an identity and a note |

`POST .../resolve` takes `{ "id": "…", "note": "…", "state": "resolved" | "discarded" }`.
An empty note is a 422 and not a warning: the migration plan's §17 gate requires
every rejection to carry a documented reason, and "resolved" with no account of
how is the failure that gate exists to prevent. The write is refused by a table
CHECK as well, so a handler bug cannot produce an unexplained resolution.

## 21. `packages/api-client` — the migration additions

§12 stays frozen for the app surfaces. These four are additive, admin-only, and
exist so the console reaches the database the same way every other page does —
through one package, under a session, with RLS applied. The alternative is a
second connection inside the Next.js app, which is how a portal ends up with a
privileged path nobody audits.

```ts
listImportRuns(sql: Sql, limit?: number): Promise<ImportRunSummary[]>
listQuarantine(sql: Sql, opts?: { state?: QuarantineState; limit?: number }): Promise<QuarantineItem[]>
resolveQuarantineRecord(sql: Sql, input: ResolveQuarantineInput): Promise<QuarantineItem>
migrationOverview(sql: Sql): Promise<MigrationOverview>
```

`resolveQuarantineRecord` writes the `audit_events` row in the same transaction
as the update. An override recorded in one and not the other is worse than no
audit trail, because it looks like one.


## 22. The portal's demo auto-login route

Separate from §13 for the same reason §20 is: §13 is the exact surface the Expo
app may depend on, and this route is for a browser and nothing else. A phone
never calls it — the Expo app holds its token in `expo-secure-store` and sends
`Authorization: Bearer`, so a redirect that sets a cookie would mean nothing to
it.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/session/auto` | Mint the `CSA_DEMO_AUTOLOGIN` identity's session and redirect back |

It exists so a demo can open straight into the committee view instead of opening
as a guest and picking from the switcher. `apps/admin/proxy.ts` sends a request
here when it carries neither `csa_session` nor `csa_autologin_attempted`, and
this route is the only thing that sends anyone back.

Three properties are load-bearing, and each is there because its absence is a
real failure rather than an untidy one:

- **Off unless configured.** No `CSA_DEMO_AUTOLOGIN`, no redirect at all. The
  portal's normal state is a guest and the identity switcher.
- **The §7 allowlist still applies.** The variable is checked against the same
  four fictional identities as `POST /api/session`, so pointing it at an
  arbitrary address does not impersonate one. Auto-login widens *when* a seeded
  session is minted, never *which* sessions can exist.
- **`next` must be a same-origin absolute path.** `//host` and `https://host`
  are rejected. A sign-in route that redirects anywhere a query parameter says
  is an open redirect, which is the standard way this kind of convenience turns
  into a phishing primitive.

`csa_autologin_attempted` is set on every path through the handler, including
the failing ones, and is what stops the proxy bouncing a request here forever
when the variable is wrong or the seed has not run. It is session-scoped, so
signing out stays signed out for the rest of the browser session.

Anyone who can reach the portal gets the configured identity. That is a property
of the deployment, not of the code: pointing it at `admin@demo.local` on a
public host hands every visitor a committee session over fictional data.
