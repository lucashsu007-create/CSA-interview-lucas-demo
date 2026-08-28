-- CSA Digital Hub — Wave 0
-- 0200  Tables — contract §4.
--
-- Conventions (contract §1):
--   * snake_case, plural table names
--   * primary keys are uuid v4, column `id`
--   * money is integer cents, EUR, columns end `_cents`
--   * timestamps are timestamptz (UTC), columns end `_at`
--
-- Foreign keys follow the contract literally: an arrow in §4 means a real FK.
-- The evidence/log tables (scan_attempts, audit_events, analytics_events) carry
-- bare ids on purpose — see the comments on those tables.

set search_path = public, extensions, pg_temp;


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null unique,
  full_name   text   not null,
  role        public.user_role not null default 'attendee',
  created_at  timestamptz not null default now(),

  constraint users_email_shape    check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint users_full_name_set  check (length(btrim(full_name)) > 0)
);

comment on table public.users is
  'Application user. `id` is intended to equal auth.users.id on Supabase, but no FK '
  'is declared so that migrations, tests and seeds run against a bare PostgreSQL too.';
comment on column public.users.role is
  'Permissions only. Never a pricing input — contract §2.';


-- ---------------------------------------------------------------------------
-- membership_periods
-- ---------------------------------------------------------------------------
create table if not exists public.membership_periods (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users (id) on delete cascade,
  member_number    text not null unique,
  membership_type  public.membership_type   not null,
  status           public.membership_status not null default 'active',
  starts_at        timestamptz not null,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  constraint membership_periods_member_number_set check (length(btrim(member_number)) > 0),
  constraint membership_periods_period_ordered    check (expires_at > starts_at)
);

-- "A user may have several periods; at most one active at a time." (contract §4)
-- Encoded as a range-overlap exclusion rather than a plain unique index so that a
-- renewal starting the day the previous period ends is still legal.
do $$
begin
  alter table public.membership_periods
    add constraint membership_periods_no_overlapping_active
    exclude using gist (
      user_id                              with =,
      tstzrange(starts_at, expires_at)     with &&
    ) where (status = 'active');
exception
  when duplicate_object then null;
  when duplicate_table  then null;
end
$$;

comment on table public.membership_periods is
  'A membership is ACTIVE when status = ''active'' AND now() BETWEEN starts_at AND expires_at. '
  'This, not users.role, is the sole input to member pricing.';


-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id                        uuid primary key default gen_random_uuid(),
  title                     text not null,
  description               text,
  category                  public.event_category not null,
  location                  text,
  starts_at                 timestamptz not null,
  registration_deadline_at  timestamptz not null,
  capacity                  int  not null,
  price_member_cents        int  not null default 0,
  price_public_cents        int  not null default 0,
  status                    public.event_status not null default 'draft',
  image_url                 text,
  created_at                timestamptz not null default now(),

  constraint events_title_set          check (length(btrim(title)) > 0),
  constraint events_capacity_positive  check (capacity > 0),
  constraint events_member_price_non_negative check (price_member_cents >= 0),
  constraint events_public_price_non_negative check (price_public_cents >= 0),
  constraint events_deadline_not_after_start   check (registration_deadline_at <= starts_at)
);

comment on column public.events.capacity is
  'Hard cap. Enforced by register_for_event() under a row lock, never by the client.';
comment on column public.events.status is
  'The database never sets ''sold_out'' by itself; capacity is authoritative and '
  '''sold_out'' is an editorial state an admin may set.';


-- ---------------------------------------------------------------------------
-- registrations
-- ---------------------------------------------------------------------------
create table if not exists public.registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  user_id           uuid not null references public.users  (id) on delete cascade,
  ticket_code       text not null,
  price_paid_cents  int  not null,
  is_member_price   boolean not null default false,
  payment_status    public.payment_status not null default 'pending',
  checked_in_at     timestamptz,
  created_at        timestamptz not null default now(),

  -- one registration per user per event (contract §4)
  constraint registrations_event_user_key unique (event_id, user_id),
  constraint registrations_ticket_code_key unique (ticket_code),
  -- 10 characters of Crockford base32, uppercase, I/L/O/U excluded (contract §6).
  -- The alphabet is spelled out rather than using ranges so the check is
  -- collation-independent.
  constraint registrations_ticket_code_shape
    check (ticket_code ~ '^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$'),
  constraint registrations_price_non_negative check (price_paid_cents >= 0)
);

comment on table public.registrations is
  'Written only by register_for_event(). Clients have no INSERT privilege.';
comment on column public.registrations.checked_in_at is
  'Canonical check-in time = the EARLIEST reported scan for this ticket (contract §5).';


-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  registration_id     uuid not null references public.registrations (id) on delete cascade,
  provider            text not null default 'mock',
  provider_reference  text,
  amount_cents        int  not null,
  status              public.payment_status not null default 'pending',
  created_at          timestamptz not null default now(),

  constraint payments_provider_closed        check (provider in ('mock')),
  constraint payments_amount_non_negative    check (amount_cents >= 0)
);

comment on table public.payments is
  'Mock adapter only — no real payment processing in this prototype (CLAUDE.md standing rule 2).';


-- ---------------------------------------------------------------------------
-- scan_attempts  — the evidence table for the offline-sync story
-- ---------------------------------------------------------------------------
create table if not exists public.scan_attempts (
  id           uuid primary key default gen_random_uuid(),
  ticket_code  text not null,
  event_id     uuid not null,
  device_id    text,
  scanned_at   timestamptz not null,
  received_at  timestamptz not null default now(),
  outcome      public.check_in_outcome not null,
  created_at   timestamptz not null default now()
);

comment on table public.scan_attempts is
  'Append-only evidence log. Deliberately has NO foreign keys: it must be able to '
  'record a scan of a ticket code that does not exist and of an event id that does '
  'not exist, otherwise the "every scan is recorded, whatever the outcome" guarantee '
  'would be broken by the very cases it exists to record.';
comment on column public.scan_attempts.scanned_at is 'The scanner''s reported (possibly offline, possibly skewed) time.';
comment on column public.scan_attempts.received_at is 'Server time at which the scan reached the database.';


-- ---------------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------------
create table if not exists public.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  city           text,
  category       text,
  discount_text  text,
  address        text,
  created_at     timestamptz not null default now(),

  constraint partners_name_set check (length(btrim(name)) > 0)
);


-- ---------------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),

  constraint audit_events_action_set      check (length(btrim(action)) > 0),
  constraint audit_events_entity_type_set check (length(btrim(entity_type)) > 0)
);

comment on table public.audit_events is
  'Append-only. No FK on actor_user_id on purpose: an audit row must outlive the row it refers to.';


-- ---------------------------------------------------------------------------
-- analytics_events
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  user_id     uuid,
  properties  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  -- contract §4: closed set of names. Kept as a CHECK rather than a new enum
  -- because contract §3 is the exhaustive list of enums.
  constraint analytics_events_name_closed check (
    name in (
      'event_viewed',
      'registration_started',
      'registration_completed',
      'payment_failed',
      'ticket_opened',
      'check_in_attempted',
      'check_in_succeeded',
      'check_in_rejected'
    )
  )
);

comment on constraint analytics_events_name_closed on public.analytics_events is
  'Closed name set per contract §4. Adding a name is a schema change.';
