-- CSA Digital Hub — Wave 0
-- 0100  Enums — contract §3, exactly as listed.
--
-- Every enum is CLOSED. Adding a value is a schema change, never a string
-- literal in a component.

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('attendee', 'staff', 'admin');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'membership_type'
  ) then
    create type public.membership_type as enum ('general', 'alumni', 'honorary');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'membership_status'
  ) then
    create type public.membership_status as enum ('active', 'expired', 'cancelled');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'event_category'
  ) then
    create type public.event_category as enum ('social', 'cultural', 'career', 'educational', 'sports');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'event_status'
  ) then
    create type public.event_status as enum ('draft', 'published', 'sold_out', 'cancelled');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'payment_status'
  ) then
    create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
  end if;

  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'check_in_outcome'
  ) then
    create type public.check_in_outcome as enum ('success', 'duplicate', 'wrong_event', 'invalid');
  end if;
end
$$;

comment on type public.user_role is
  'Permissions only. Member pricing is NEVER derived from role — contract §2.';
comment on type public.check_in_outcome is
  'Closed set of check-in results. There is deliberately no "unpaid" outcome; see the note on check_in_ticket.';
