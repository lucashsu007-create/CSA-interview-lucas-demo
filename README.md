# CSA

Work for the **Chinese Student Association Rotterdam** IT Committee application:
an independent concept prototype of a unified CSA digital platform, plus the
staged migration proposal behind it.

> **Status: independent concept prototype.** Not an official CSA product. Not
> connected to real member data, real payment systems, or any CSA-owned
> infrastructure. Everything here is built from public evidence only.

## What this is

The demo is one vertical slice — event registration and QR check-in — built
standalone so it can be demonstrated without any CSA access. The **migration
harness** below is the second slice: the path from a legacy estate into that
schema, and the reconciliation that proves the move lost and invented nothing.

This repository is the code only. The build plans and internal working
documents it was written against are not published here.

## The loop the demo proves

```mermaid
flowchart LR
    A["Admin publishes event"] --> B["Member discovers event"]
    B --> C["Member registers"]
    C --> D["QR ticket issued"]
    D --> E["Staff checks in member"]
    E --> F["Dashboard updates"]
```

The engineering centrepiece is the ticket, not the screens: a backend-signed
opaque payload, idempotent check-in, duplicate and wrong-event rejection, and
capacity that cannot oversell under concurrency.

## Getting started

### Prerequisites

|                                       | Why                                     |
| ------------------------------------- | --------------------------------------- |
| Node 24+ and pnpm 11+                 | the workspace (`.nvmrc` pins the major) |
| PostgreSQL 15+, client **and** server | the business rules live in the database |
| `psql`, `createdb`, `dropdb`          | used by `scripts/dev-setup.sh`          |
| `pgbench`                             | the concurrency proof only              |
| Python 3                              | `scripts/check-contract.py` only        |

On Debian/Ubuntu that is `postgresql postgresql-contrib`; on Homebrew,
`postgresql@16`. **Docker and the Supabase CLI are not required and are not
used here** — they are the production path (contract §10), not the local one.
Everything below talks to a plain local PostgreSQL.

### One command

```bash
./scripts/dev-setup.sh
```

It checks the prerequisites, creates the `csa_dev` database if it is absent,
applies every migration in order, loads the fictional seed, and prints the
connection string and what to run next. It is safe to run twice: an existing
database is migrated but never dropped, and the seed is not reloaded over data
you have been demoing against. Destroying anything takes an explicit flag.

```bash
./scripts/dev-setup.sh --help       # options
./scripts/dev-setup.sh --db csa_x   # a different database
PGHOST=/var/run/postgresql ./scripts/dev-setup.sh   # a different server
```

Connection comes from the standard libpq environment (`PGHOST`, `PGPORT`,
`PGUSER`, `PGPASSWORD`); with none of it set the script finds the local socket.

Then install the workspace:

```bash
pnpm install
```

### Running the apps

The Next.js admin app serves **both** surfaces: the committee portal, and the
JSON API the Expo app consumes (contract §10 and §13).

```bash
# committee portal + JSON API -> http://localhost:3000
CSA_DATABASE_URL="postgresql:///csa_dev?host=/tmp" pnpm --filter @csa/admin dev

# Expo member app, pointed at the portal above
EXPO_PUBLIC_API_BASE_URL="http://localhost:3000" pnpm --filter @csa/mobile start
```

The public website modernisation is a separate, static Next.js surface. It uses
only public CSA copy and imagery, does not connect to the prototype database,
and leaves the committee portal routes unchanged.

```bash
pnpm dev:web   # modern public website concept -> http://localhost:3000
```

`CSA_DATABASE_URL` defaults to `postgresql:///csa_dev?host=/tmp`, so on a
machine with the socket in `/tmp` you can leave it out. Set
`CSA_SESSION_SECRET` (32+ characters) to stop the api-client falling back to its
public development signing secret; unset, it says so on startup.

No client ever holds a database credential — the driver is server-side only.

### Before a demo

```bash
./scripts/reset-db.sh
```

Drops, recreates, migrates and reseeds, so the demo starts from exactly the
state the seed defines: no registrations left over from a rehearsal, and the
capacity-1 event untouched. It confirms before destroying anything, refuses to
run non-interactively without `--yes`, and refuses outright to drop a database
that does not look like this project's.

## The migration harness

The event slice proves the target platform works. This proves you can get to it
and defend the result afterwards.

```bash
pnpm migrate:demo        # generate the synthetic estate, transform it, reconcile. No database.
```

`dry_run` is the default and needs no database, because the first thing anyone
runs should be the one that writes nothing. It performs the entire transform —
every rule, every quarantine decision — and reports.

### The synthetic estate

`packages/legacy-fixtures` generates a stand-in for CSA's current systems, in
each source's own format: a WordPress WXR export, MongoDB JSONL, Google Forms
CSVs, a Mollie payment export, and the office register as the CSV a paper ledger
becomes. It is deterministic — the same seed produces byte-identical files and
identical hashes — because a reconciliation whose corpus moved between the two
counts proves nothing.

The mess in it is modelled on what CSA publishes about itself. Event pages carry
a sign-up form and no capacity or deadline, so the fixture's events have none to
import. The membership page tells anyone who cannot pay by iDEAL to register at
the office, so a second intake exists beside the online one and the same person
appears in both under two spellings. **42 defects are planted deliberately** and
written to `planted-defects.json` beside the extract, never inside it — that
file is the answer key the importer is graded against, so it can be judged on
quarantining exactly those rows rather than merely some.

Fictional data only. Every address is at `demo.local` or `fixture.invalid`, both
reserved and unroutable, and a test enforces it.

### What the importer will not do

Written down in `packages/migrate/src/rules.ts`, so each absence is a decision:

- Merge two records because their names match. The ledger contains exactly that
  case on purpose — same human, different email — and it is quarantined as
  `ambiguous_duplicate` for a person to resolve.
- Correct an email domain that looks like a typo.
- Infer a country from a bare national number.
- Import a field nobody named a use for. GDPR applies to the target, not only
  to the source.

`pnpm migrate --refused` prints the list.

### Reconciliation

```text
delta = target + quarantined + merged - source
```

Per source system, entity **and** year — never as one aggregate, because a total
that matches while 2019 is short by 40 and 2023 is long by 40 is the failure an
aggregate hides. Plus a comparison per payment status on both rows and cents,
which is the half that catches money moving between statuses while the row count
holds still.

Three verdicts and only three: `RECONCILES`, `DOES_NOT_RECONCILE`, and
`NOT_YET_MEASURABLE` — the last being the honest answer when an input is missing
or when no human has read any records. Exit codes are 0, 1 and 2 in that order.

### Loading into staging

```bash
createdb csa_staging
for f in supabase/migrations/*.sql; do psql -d csa_staging -v ON_ERROR_STOP=1 -f "$f"; done
psql -d csa_staging -f supabase/seed.sql          # seed FIRST — it truncates users

pnpm migrate --mode load --db "postgresql:///csa_staging?host=/tmp" --samples 12
pnpm migrate --mode load --db "postgresql:///csa_staging?host=/tmp" --samples 12   # writes nothing
```

Run it twice. The second run changes no row, and that is the database's
guarantee rather than the importer's promise: `(source_system, source_id)` is a
partial unique index, so a re-import is refused rather than deduplicated after
the fact. Every entity is then read back and parsed with the row schemas from
`@csa/validation`, because an importer that writes rows the application cannot
read has loaded nothing usable.

### The cutover rehearsal

```bash
./scripts/cutover.sh          # builds its own database and drops it again
```

Rehearses steps 1–5 of the migration runbook and the reversal: dry run, load, re-run, freeze, delta, go/no-go, then a **timed**
rollback that removes every imported row and leaves the seeded data standing. It
is not a cutover — steps 6 onward are DNS, the rollback window and retiring
legacy, and those need authorization and named human owners.

It earns its keep. It is where a member-number collision surfaced that would
otherwise have appeared during the freeze, with the legacy system already
read-only.

### The console

The committee portal serves `/migration`: the latest run and its extract hash,
rows carrying provenance, open quarantine broken down by reason, the queue
itself with a resolve action, and the plan's §17 gate as an unticked list.
Resolving a record needs an admin identity and a note, refused independently by
the button, the handler, the data layer and a table `CHECK`, and it writes its
audit row in the same transaction as the update.

## Tests

Four layers, each proving something the others cannot.

```bash
pnpm typecheck && pnpm test          # 1. types and unit tests (Vitest, packages/*)
python3 scripts/check-contract.py    # 2. the contract conformance gate
```

The contract gate compares the code against
[`docs/architecture.md`](docs/architecture.md) on two axes: the **names** each
workstream used, and the **shapes** — that the fields of the SQL `check_in_result`
composite are the fields the Zod schema parses, that the RPC argument names match
the SQL signatures, and that no row schema parses a column the table does not
have. Names alone once read green across a live flat-versus-nested divergence.

```bash
# 3. the SQL suite — needs the database, so it is not part of `pnpm test`
for f in supabase/tests/0[1-9]_*.sql; do psql -d csa_dev -v ON_ERROR_STOP=1 -f "$f"; done

# 4. the concurrency proof — 40 clients, one seat, exactly one winner
DB_URL="postgresql:///csa_dev?host=/tmp" ./supabase/tests/run_concurrency_test.sh
```

The last one is the one worth running: it fires 40 pgbench clients at an event
with a single place and asserts that exactly one of them got it. `CLIENTS=64
TX=10` turns it up.

```bash
pnpm test:e2e                        # 5. the critical flow, end to end (Playwright)
```

`tests/critical-flow` builds its own throwaway `csa_e2e` database (via
`scripts/reset-db.sh`) and drops it again, so it never touches `csa_dev`. It is
split by layer, and each layer skips itself with a reason rather than passing
vacuously when the thing it drives is not running:

| Project      | Drives                                                                | Needs                 |
| ------------ | --------------------------------------------------------------------- | --------------------- |
| `data`       | the loop as the database enforces it — publish, register, scan, count | PostgreSQL only       |
| `member-api` | the contract §13 JSON API the Expo app consumes                       | the admin app running |
| `admin-ui`   | the same loop through the committee portal in a browser               | the admin app running |

```bash
pnpm test:e2e --project=data                  # no browser, no server needed
CSA_E2E_START_SERVER=1 pnpm test:e2e          # start the admin app for the rest
CSA_E2E_BASE_URL=http://localhost:3000 pnpm test:e2e   # use one already running
```

Starting the app is opt-in on purpose: a `webServer` block pointing at an app
that cannot boot turns an honest skip into an opaque timeout.

## Demo identities

Fictional, seeded, and undeliverable by design — `.local` addresses cannot
receive a magic link, so auth is seeded sessions (contract §7).

| Identity               | Role       | What it demonstrates                      |
| ---------------------- | ---------- | ----------------------------------------- |
| `member@demo.local`    | `attendee` | active membership → **member** pricing    |
| `nonmember@demo.local` | `attendee` | no active membership → **public** pricing |
| `admin@demo.local`     | `admin`    | committee portal, publishing, dashboard   |
| `staff@demo.local`     | `staff`    | door scanning and check-in                |

Both attendees have the same role. Member pricing is never derived from a role —
it is resolved server-side from an active membership period at registration
time, which is why those two identities exist.

## Stack

pnpm workspace on TypeScript 5.9, Vitest 4, Node 24+. Expo/React Native for the
member app and Next.js for the public website and committee portal, PostgreSQL
(Supabase-shaped) for data, shared Zod schemas across runtimes, and a shared
`@csa/motion` implementation layer with web/native adapters.

## Deployment

The concept is built to deploy on **Railway** behind **Cloudflare DNS**, on a
domain owned by the author. Nothing here runs on CSA infrastructure, and
deploying it implies no CSA authorization — the ground rules below still govern
anything that would. Live hostnames are deliberately not published here.

| Surface | Railway service |
| --- | --- |
| Public website concept | `csa-web` (`apps/web`) |
| Committee portal + JSON API | `csa-portal` (`apps/admin`) |
| Database | `Postgres` — private network only, no public proxy |

Both apps build from **one** `railway.json`. This is a monorepo and Railway
builds it whole, so each service selects its own app through a `CSA_APP`
variable (`@csa/web` or `@csa/admin`) that the shared build and start commands
interpolate. A third surface means a third service and a third value, not a
third config file.

```bash
railway up --service csa-web       # or --service csa-portal
```

`.railwayignore` keeps build output, `node_modules` and the Expo app out of the
upload; Railway rebuilds what it needs.

### Migrations on Railway

`scripts/railway-migrate.mjs` is the Railway counterpart to
`scripts/dev-setup.sh`, which cannot run there — that script needs `psql`,
`createdb` and a local socket. It runs as the portal's pre-deploy step, inside
Railway's private network, so the database never needs a public TCP proxy.

Its semantics deliberately match `dev-setup.sh`: the migrations are re-runnable
by construction and applied in filename order, and `supabase/seed.sql` is loaded
only when the database is not already seeded — so a redeploy never truncates
data someone is mid-demo on. Reseeding stays an explicit, human act.

The portal runs with a generated `CSA_SESSION_SECRET`. Left unset, the
api-client falls back to its published development secret and sessions are
forgeable, so it is set on the service rather than left to the fallback.

## Repository layout

```text
CSA/
├── apps/
│   ├── admin/         # Next.js committee portal + the JSON API (contract §13)
│   ├── mobile/        # Expo member app
│   └── web/           # Static public-website modernisation concept
├── packages/
│   ├── api-client/    # the only code the apps use to reach the database
│   ├── domain/        # entities, enums, pure predicates, money
│   ├── validation/    # Zod schemas and row -> domain parsers
│   ├── design-tokens/ # approved runtime-neutral visual values (implementation)
│   ├── motion/        # accessible web/native motion mechanics (implementation)
│   ├── legacy-fixtures/ # the synthetic WordPress + Mongo + Forms + Mollie estate
│   └── migrate/       # transform, dedup, quarantine, load, reconcile, redirects
├── supabase/
│   ├── migrations/    # schema, RLS, and the two SECURITY DEFINER functions
│   ├── tests/         # SQL suite incl. the N-way concurrency proof
│   └── seed.sql       # fictional demo dataset
├── scripts/           # dev-setup, reset-db, cutover rehearsal, the contract gate
│                     #   plus railway-migrate.mjs, the Railway pre-deploy step
├── tests/critical-flow/   # Playwright end-to-end suite
├── fixtures/legacy/       # generated extract — rebuilt from a seed, not committed
├── railway.json           # one build/start config, shared by both Railway services
└── docs/architecture.md   # the frozen contract every workstream builds against
```

## Ground rules

These are non-negotiable:

- Fictional data only. No real CSA member, ticket, or payment data, ever. The
  migration harness runs against a generated corpus, and a green import over
  fictional rows is never described as a migration of anything.
- Nothing ships to production, the App Store, or Google Play without CSA
  authorization.
- No claims of production impact from a prototype. Measured prototype results
  are reported as prototype results, from seeded fictional data.
