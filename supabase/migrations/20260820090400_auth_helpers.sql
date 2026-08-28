-- CSA Digital Hub — Wave 0
-- 0400  Identity helpers used by RLS policies and by the two RPC functions.
--
-- Why these exist rather than calling auth.uid() directly:
--   * they resolve the caller identity from the same GUCs auth.uid() reads, so
--     behaviour on Supabase is identical, but they also work on a bare
--     PostgreSQL where the `auth` schema does not exist (tests, CI, pgbench);
--   * current_app_role() is SECURITY DEFINER, which is what stops the classic
--     "policy on users queries users" infinite recursion — inside a definer
--     function the current user is the table owner, and the owner is exempt
--     from RLS (no table here uses FORCE ROW LEVEL SECURITY).


-- ---------------------------------------------------------------------------
-- current_app_user_id() — the caller's public.users.id, or NULL for a guest.
-- ---------------------------------------------------------------------------
create or replace function public.current_app_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_claims text;
  v_sub    text;
begin
  -- 1. PostgREST >= v10 publishes the whole claim set as one json GUC.
  v_claims := nullif(current_setting('request.jwt.claims', true), '');
  if v_claims is not null then
    begin
      v_sub := v_claims::jsonb ->> 'sub';
    exception when others then
      v_sub := null;
    end;
  end if;

  -- 2. Older PostgREST / GoTrue publish individual claims.
  if v_sub is null then
    v_sub := nullif(current_setting('request.jwt.claim.sub', true), '');
  end if;

  -- 3. Local psql, SQL tests and pgbench: explicit impersonation, e.g.
  --      set local csa.current_user_id = '...uuid...';
  if v_sub is null then
    v_sub := nullif(current_setting('csa.current_user_id', true), '');
  end if;

  if v_sub is null then
    return null;
  end if;

  return v_sub::uuid;
exception when invalid_text_representation then
  return null;
end
$fn$;

comment on function public.current_app_user_id() is
  'Caller identity, read from the same request GUCs as Supabase auth.uid(). NULL for guests.';


-- ---------------------------------------------------------------------------
-- is_privileged_session() — true for the schema owner and for service_role.
-- ---------------------------------------------------------------------------
-- Needed because inside a SECURITY DEFINER function `current_user` is always
-- the owner, so the invoker's DB role has to be recovered from session_user and
-- from the JWT role claim instead.
create or replace function public.is_privileged_session()
returns boolean
language plpgsql
stable
set search_path = ''
as $fn$
declare
  v_owner  oid;
  v_claims text;
  v_role   text;
begin
  -- 1. Server-to-server calls made with the service key.
  v_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if v_role is null then
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null then
      begin
        v_role := v_claims::jsonb ->> 'role';
      exception when others then
        v_role := null;
      end;
    end if;
  end if;

  if v_role = 'service_role' then
    return true;
  end if;

  -- 2. A direct database session: migrations, psql, pg_cron, the SQL test
  --    suite, pgbench. This only counts when NO request identity is present.
  --    Without that condition a test that impersonates an attendee by setting
  --    request.jwt.claims would silently inherit owner privilege through
  --    session_user and prove nothing.
  if nullif(current_setting('request.jwt.claims',    true), '') is not null
     or nullif(current_setting('request.jwt.claim.sub',  true), '') is not null
     or nullif(current_setting('request.jwt.claim.role', true), '') is not null
     or nullif(current_setting('csa.current_user_id',    true), '') is not null then
    return false;
  end if;

  -- Note: session_user, not current_user. Inside a SECURITY DEFINER function
  -- current_user is always the owner, so it can never identify the caller.
  -- On Supabase the API connects as `authenticator`, which is not a member of
  -- the schema owner, so this branch is unreachable from the PostgREST path.
  select c.relowner into v_owner
  from pg_catalog.pg_class c
  where c.oid = 'public.registrations'::pg_catalog.regclass;

  return v_owner is not null
     and pg_catalog.pg_has_role(session_user, v_owner, 'MEMBER');
end
$fn$;

comment on function public.is_privileged_session() is
  'True for service_role calls and for direct owner sessions with no request identity set.';


-- ---------------------------------------------------------------------------
-- current_app_role() / is_admin() / is_staff_or_admin()
-- ---------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.role
  from public.users u
  where u.id = public.current_app_user_id();
$fn$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select coalesce(public.current_app_role() = 'admin'::public.user_role, false);
$fn$;

create or replace function public.is_staff_or_admin()
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select coalesce(
    public.current_app_role() in ('staff'::public.user_role, 'admin'::public.user_role),
    false
  );
$fn$;

comment on function public.current_app_role() is
  'SECURITY DEFINER so that policies on public.users may call it without recursing.';


-- These are evaluated by RLS policies as the invoking role, so the API roles
-- need EXECUTE on them.
grant execute on function public.current_app_user_id()   to anon, authenticated, service_role;
grant execute on function public.is_privileged_session() to anon, authenticated, service_role;
grant execute on function public.current_app_role()      to anon, authenticated, service_role;
grant execute on function public.is_admin()              to anon, authenticated, service_role;
grant execute on function public.is_staff_or_admin()     to anon, authenticated, service_role;
