-- CSA Digital Hub — Wave M
-- 1202  Provenance — contract §4 and §18.1.
--
-- Every importable table gains the same three columns. They are NULL for rows
-- this platform created itself (the seed, a member registering through the
-- app), and set for every row that came from somewhere else.
--
-- The partial unique index on (source_system, source_id) IS the importer's
-- idempotency key. Re-running an import cannot duplicate, because the database
-- will not let it — not because the importer promised not to.
--
-- Spelled out per table rather than looped over `format()`. A dynamic version
-- is shorter and the contract gate cannot read it, and a schema the gate cannot
-- read is a schema that drifts from §4 unnoticed.

set search_path = public, extensions, pg_temp;


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists source_system  public.legacy_system,
  add column if not exists source_id      text,
  add column if not exists import_run_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'users_import_run_fk') then
    alter table public.users
      add constraint users_import_run_fk foreign key (import_run_id)
      references public.import_runs (id) on delete set null;
  end if;

  -- Provenance is all-or-nothing. A source id without a system cannot be traced
  -- back, and a system without an id cannot be re-imported as a delta.
  if not exists (select 1 from pg_constraint where conname = 'users_provenance_paired') then
    alter table public.users
      add constraint users_provenance_paired
      check ((source_system is null) = (source_id is null));
  end if;
end
$$;

create unique index if not exists users_source_key
  on public.users (source_system, source_id)
  where source_system is not null;

comment on column public.users.source_system is
  'Legacy system this row was imported from; NULL if this platform created it — contract §4.';
comment on index public.users_source_key is
  'The importer''s idempotency key — contract §18.1. Re-running an import cannot duplicate '
  'because the database refuses, not because the importer promised not to.';


-- ---------------------------------------------------------------------------
-- membership_periods
-- ---------------------------------------------------------------------------
alter table public.membership_periods
  add column if not exists source_system  public.legacy_system,
  add column if not exists source_id      text,
  add column if not exists import_run_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'membership_periods_import_run_fk') then
    alter table public.membership_periods
      add constraint membership_periods_import_run_fk foreign key (import_run_id)
      references public.import_runs (id) on delete set null;
  end if;

  -- Provenance is all-or-nothing. A source id without a system cannot be traced
  -- back, and a system without an id cannot be re-imported as a delta.
  if not exists (select 1 from pg_constraint where conname = 'membership_periods_provenance_paired') then
    alter table public.membership_periods
      add constraint membership_periods_provenance_paired
      check ((source_system is null) = (source_id is null));
  end if;
end
$$;

create unique index if not exists membership_periods_source_key
  on public.membership_periods (source_system, source_id)
  where source_system is not null;

comment on column public.membership_periods.source_system is
  'Legacy system this row was imported from; NULL if this platform created it — contract §4.';
comment on index public.membership_periods_source_key is
  'The importer''s idempotency key — contract §18.1. Re-running an import cannot duplicate '
  'because the database refuses, not because the importer promised not to.';


-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
alter table public.events
  add column if not exists source_system  public.legacy_system,
  add column if not exists source_id      text,
  add column if not exists import_run_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_import_run_fk') then
    alter table public.events
      add constraint events_import_run_fk foreign key (import_run_id)
      references public.import_runs (id) on delete set null;
  end if;

  -- Provenance is all-or-nothing. A source id without a system cannot be traced
  -- back, and a system without an id cannot be re-imported as a delta.
  if not exists (select 1 from pg_constraint where conname = 'events_provenance_paired') then
    alter table public.events
      add constraint events_provenance_paired
      check ((source_system is null) = (source_id is null));
  end if;
end
$$;

create unique index if not exists events_source_key
  on public.events (source_system, source_id)
  where source_system is not null;

comment on column public.events.source_system is
  'Legacy system this row was imported from; NULL if this platform created it — contract §4.';
comment on index public.events_source_key is
  'The importer''s idempotency key — contract §18.1. Re-running an import cannot duplicate '
  'because the database refuses, not because the importer promised not to.';


-- ---------------------------------------------------------------------------
-- registrations
-- ---------------------------------------------------------------------------
alter table public.registrations
  add column if not exists source_system  public.legacy_system,
  add column if not exists source_id      text,
  add column if not exists import_run_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_import_run_fk') then
    alter table public.registrations
      add constraint registrations_import_run_fk foreign key (import_run_id)
      references public.import_runs (id) on delete set null;
  end if;

  -- Provenance is all-or-nothing. A source id without a system cannot be traced
  -- back, and a system without an id cannot be re-imported as a delta.
  if not exists (select 1 from pg_constraint where conname = 'registrations_provenance_paired') then
    alter table public.registrations
      add constraint registrations_provenance_paired
      check ((source_system is null) = (source_id is null));
  end if;
end
$$;

create unique index if not exists registrations_source_key
  on public.registrations (source_system, source_id)
  where source_system is not null;

comment on column public.registrations.source_system is
  'Legacy system this row was imported from; NULL if this platform created it — contract §4.';
comment on index public.registrations_source_key is
  'The importer''s idempotency key — contract §18.1. Re-running an import cannot duplicate '
  'because the database refuses, not because the importer promised not to.';


-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
alter table public.payments
  add column if not exists source_system  public.legacy_system,
  add column if not exists source_id      text,
  add column if not exists import_run_id  uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_import_run_fk') then
    alter table public.payments
      add constraint payments_import_run_fk foreign key (import_run_id)
      references public.import_runs (id) on delete set null;
  end if;

  -- Provenance is all-or-nothing. A source id without a system cannot be traced
  -- back, and a system without an id cannot be re-imported as a delta.
  if not exists (select 1 from pg_constraint where conname = 'payments_provenance_paired') then
    alter table public.payments
      add constraint payments_provenance_paired
      check ((source_system is null) = (source_id is null));
  end if;
end
$$;

create unique index if not exists payments_source_key
  on public.payments (source_system, source_id)
  where source_system is not null;

comment on column public.payments.source_system is
  'Legacy system this row was imported from; NULL if this platform created it — contract §4.';
comment on index public.payments_source_key is
  'The importer''s idempotency key — contract §18.1. Re-running an import cannot duplicate '
  'because the database refuses, not because the importer promised not to.';
