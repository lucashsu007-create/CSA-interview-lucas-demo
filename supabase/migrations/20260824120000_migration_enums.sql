-- CSA Digital Hub — Wave M
-- 1200  Migration enums — contract §3, the six added for the harness.
--
-- Same rule as Wave 0: every enum is CLOSED. `quarantine_reason` in particular
-- is an enum and not free text because the migration plan's §17 gate requires a
-- rejection breakdown, and free text cannot be counted.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'legacy_system'
  ) then
    create type public.legacy_system as enum
      ('wordpress', 'mongodb', 'google_forms', 'mollie', 'office_ledger');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'import_mode'
  ) then
    create type public.import_mode as enum ('dry_run', 'load', 'delta');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'import_run_status'
  ) then
    create type public.import_run_status as enum
      ('running', 'succeeded', 'failed', 'rolled_back');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'import_disposition'
  ) then
    create type public.import_disposition as enum ('accepted', 'warning', 'rejected');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'quarantine_reason'
  ) then
    create type public.quarantine_reason as enum (
      'ambiguous_duplicate',
      'unparseable_date',
      'missing_required_field',
      'unresolvable_country',
      'orphaned_reference',
      'conflicting_status',
      'out_of_scope'
    );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'quarantine_state'
  ) then
    create type public.quarantine_state as enum ('open', 'resolved', 'discarded');
  end if;
end
$$;

comment on type public.legacy_system is
  'The five sources the harness models, each visible on a public CSA surface — contract §15. '
  'office_ledger is the in-person registration path, and is where duplicates come from.';
comment on type public.quarantine_reason is
  'Closed set. A record the rules cannot resolve is quarantined with one of these, never guessed '
  'and never dropped. Free text here would defeat the §17 rejection breakdown.';
comment on type public.import_mode is
  'dry_run transforms and reports but writes no target rows; delta imports only source rows '
  'unseen by a prior run, and is what the post-freeze cutover step uses.';
