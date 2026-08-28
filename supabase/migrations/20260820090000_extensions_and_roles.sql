-- CSA Digital Hub — Wave 0
-- 0000  Extensions and API roles.
--
-- Concept prototype. Fictional data only.
--
-- Everything below is written to be safe both on a Supabase project (where the
-- `extensions` schema and the anon/authenticated/service_role roles already
-- exist) and on a bare PostgreSQL 15+ instance used for local testing.

create schema if not exists extensions;

-- gen_random_bytes()  -> CSPRNG for ticket codes (contract §6)
create extension if not exists pgcrypto  with schema extensions;
-- citext              -> case-insensitive unique email (contract §4)
create extension if not exists citext    with schema extensions;
-- btree_gist          -> `uuid WITH =` inside the membership overlap exclusion
create extension if not exists btree_gist with schema extensions;

-- gen_random_uuid() is core since PostgreSQL 13, so uuid-ossp is not needed.

-- PostgREST-facing roles. No-ops on Supabase.
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    begin
      create role service_role nologin noinherit bypassrls;
    exception when insufficient_privilege then
      create role service_role nologin noinherit;
      raise notice 'service_role created without BYPASSRLS (needs superuser); service calls will be subject to RLS.';
    end;
  end if;
exception when insufficient_privilege then
  raise notice 'Skipping API role bootstrap, insufficient privilege: %', sqlerrm;
end
$$;

grant usage on schema public     to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
