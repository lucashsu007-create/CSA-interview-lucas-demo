-- CSA Digital Hub — Wave 0
-- 0300  Indexes on the columns the application actually queries.
--
-- Every index below corresponds to a real access path in the demo:
--   * the mobile event list                       -> events (status, starts_at)
--   * "who is registered for this event"          -> registrations (event_id)
--   * "my tickets"                                -> registrations (user_id)
--   * check_in_ticket() ticket lookup             -> registrations (ticket_code) [unique]
--   * the offline-sync evidence view              -> scan_attempts (ticket_code)
--   * price resolution inside register_for_event  -> membership_periods (user_id, status)

set search_path = public, extensions, pg_temp;

-- events -------------------------------------------------------------------
-- Composite covers both `where status = ? order by starts_at` and `where status = ?`.
create index if not exists events_status_starts_at_idx
  on public.events (status, starts_at);

-- The hot path is the published feed; a partial index keeps it small.
create index if not exists events_published_starts_at_idx
  on public.events (starts_at)
  where status = 'published';

create index if not exists events_category_starts_at_idx
  on public.events (category, starts_at);

-- registrations ------------------------------------------------------------
-- Capacity counting in register_for_event() is `count(*) where event_id = ?`.
create index if not exists registrations_event_id_idx
  on public.registrations (event_id);

create index if not exists registrations_user_id_created_at_idx
  on public.registrations (user_id, created_at desc);

-- Attendance counters for the admin dashboard.
create index if not exists registrations_event_checked_in_idx
  on public.registrations (event_id)
  where checked_in_at is not null;

-- ticket_code already has a unique index from registrations_ticket_code_key,
-- which is the index check_in_ticket() uses for its SELECT ... FOR UPDATE.

-- membership_periods -------------------------------------------------------
-- Exactly the predicate used by price resolution.
create index if not exists membership_periods_user_active_idx
  on public.membership_periods (user_id, starts_at, expires_at)
  where status = 'active';

create index if not exists membership_periods_user_id_idx
  on public.membership_periods (user_id);

-- payments -----------------------------------------------------------------
create index if not exists payments_registration_id_idx
  on public.payments (registration_id);

-- Provider references are idempotency keys when they exist.
create unique index if not exists payments_provider_reference_key
  on public.payments (provider, provider_reference)
  where provider_reference is not null;

-- scan_attempts ------------------------------------------------------------
-- "show me every scan of this ticket" — the offline-sync evidence query.
create index if not exists scan_attempts_ticket_code_idx
  on public.scan_attempts (ticket_code, received_at desc);

create index if not exists scan_attempts_event_received_idx
  on public.scan_attempts (event_id, received_at desc);

create index if not exists scan_attempts_device_idx
  on public.scan_attempts (device_id, received_at desc)
  where device_id is not null;

-- audit / analytics --------------------------------------------------------
create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, created_at desc);

create index if not exists audit_events_actor_idx
  on public.audit_events (actor_user_id, created_at desc);

create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at desc);

-- partners -----------------------------------------------------------------
create index if not exists partners_city_category_idx
  on public.partners (city, category);
