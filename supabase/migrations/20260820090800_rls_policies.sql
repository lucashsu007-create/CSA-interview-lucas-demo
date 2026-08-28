-- CSA Digital Hub — Wave 0
-- 0800  Privileges and Row Level Security.
--
-- Two layers, both required:
--   * GRANT decides whether a statement is allowed at all;
--   * POLICY decides which rows it may see or write.
-- Removing either one is a security bug, so this file starts by revoking
-- everything from the API roles and then hands back exactly what is needed.
--
-- service_role holds BYPASSRLS on Supabase; policies below do not constrain it.
-- All writes to registrations and scan_attempts go through the SECURITY DEFINER
-- functions — no client role has INSERT on either table.

set search_path = public, extensions, pg_temp;


-- ---------------------------------------------------------------------------
-- Reset
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to service_role;
grant execute on all functions in schema public to service_role;


-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.users              enable row level security;
alter table public.membership_periods enable row level security;
alter table public.events             enable row level security;
alter table public.registrations      enable row level security;
alter table public.payments           enable row level security;
alter table public.scan_attempts      enable row level security;
alter table public.partners           enable row level security;
alter table public.audit_events       enable row level security;
alter table public.analytics_events   enable row level security;
-- NB: FORCE ROW LEVEL SECURITY is deliberately not set. The owner must stay
-- exempt, otherwise the SECURITY DEFINER helpers recurse through the policies
-- that call them.


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
grant select                         on public.users to authenticated;
grant insert, update, delete         on public.users to authenticated;  -- gated to admin below

drop policy if exists users_read_self   on public.users;
create policy users_read_self on public.users
  for select to authenticated
  using (id = public.current_app_user_id());

drop policy if exists users_read_staff  on public.users;
create policy users_read_staff on public.users
  for select to authenticated
  using (public.is_staff_or_admin());

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- membership_periods
-- ---------------------------------------------------------------------------
grant select                 on public.membership_periods to authenticated;
grant insert, update, delete on public.membership_periods to authenticated;

drop policy if exists membership_periods_read_self  on public.membership_periods;
create policy membership_periods_read_self on public.membership_periods
  for select to authenticated
  using (user_id = public.current_app_user_id());

drop policy if exists membership_periods_read_staff on public.membership_periods;
create policy membership_periods_read_staff on public.membership_periods
  for select to authenticated
  using (public.is_staff_or_admin());

drop policy if exists membership_periods_admin_write on public.membership_periods;
create policy membership_periods_admin_write on public.membership_periods
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- events — guests and attendees read published events; only admin writes.
-- ---------------------------------------------------------------------------
grant select                 on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;

drop policy if exists events_read_published on public.events;
create policy events_read_published on public.events
  for select to anon, authenticated
  using (status = 'published'::public.event_status);

drop policy if exists events_read_staff on public.events;
create policy events_read_staff on public.events
  for select to authenticated
  using (public.is_staff_or_admin());

drop policy if exists events_admin_insert on public.events;
create policy events_admin_insert on public.events
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists events_admin_update on public.events;
create policy events_admin_update on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists events_admin_delete on public.events;
create policy events_admin_delete on public.events
  for delete to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- registrations — read own; staff read all; NO client INSERT, ever.
-- ---------------------------------------------------------------------------
grant select on public.registrations to authenticated;
grant update on public.registrations to authenticated;  -- admin manual override only

drop policy if exists registrations_read_own on public.registrations;
create policy registrations_read_own on public.registrations
  for select to authenticated
  using (user_id = public.current_app_user_id());

drop policy if exists registrations_read_staff on public.registrations;
create policy registrations_read_staff on public.registrations
  for select to authenticated
  using (public.is_staff_or_admin());

-- Manual override (contract/CLAUDE.md: "requires an admin identity and an audit
-- reason"). RLS can enforce the identity half; the audit reason has to be
-- written by whatever performs the override.
drop policy if exists registrations_admin_update on public.registrations;
create policy registrations_admin_update on public.registrations
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- payments — a user sees the payments for their own registrations.
-- ---------------------------------------------------------------------------
grant select on public.payments to authenticated;

drop policy if exists payments_read_own on public.payments;
create policy payments_read_own on public.payments
  for select to authenticated
  using (
    exists (
      select 1
      from public.registrations r
      where r.id = payments.registration_id
        and r.user_id = public.current_app_user_id()
    )
  );

drop policy if exists payments_read_staff on public.payments;
create policy payments_read_staff on public.payments
  for select to authenticated
  using (public.is_staff_or_admin());


-- ---------------------------------------------------------------------------
-- scan_attempts — staff evidence log. Written only by check_in_ticket().
-- ---------------------------------------------------------------------------
grant select on public.scan_attempts to authenticated;

drop policy if exists scan_attempts_read_staff on public.scan_attempts;
create policy scan_attempts_read_staff on public.scan_attempts
  for select to authenticated
  using (public.is_staff_or_admin());


-- ---------------------------------------------------------------------------
-- partners — public directory.
-- ---------------------------------------------------------------------------
grant select                 on public.partners to anon, authenticated;
grant insert, update, delete on public.partners to authenticated;

drop policy if exists partners_read_all on public.partners;
create policy partners_read_all on public.partners
  for select to anon, authenticated
  using (true);

drop policy if exists partners_admin_write on public.partners;
create policy partners_admin_write on public.partners
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- audit_events — admin reads, nobody writes from a client.
-- ---------------------------------------------------------------------------
grant select on public.audit_events to authenticated;

drop policy if exists audit_events_read_admin on public.audit_events;
create policy audit_events_read_admin on public.audit_events
  for select to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- analytics_events — clients append their own; admin reads.
-- ---------------------------------------------------------------------------
grant select on public.analytics_events to authenticated;
grant insert on public.analytics_events to anon, authenticated;

drop policy if exists analytics_events_insert_self on public.analytics_events;
create policy analytics_events_insert_self on public.analytics_events
  for insert to authenticated
  with check (user_id is null or user_id = public.current_app_user_id());

drop policy if exists analytics_events_insert_guest on public.analytics_events;
create policy analytics_events_insert_guest on public.analytics_events
  for insert to anon
  with check (user_id is null);

drop policy if exists analytics_events_read_admin on public.analytics_events;
create policy analytics_events_read_admin on public.analytics_events
  for select to authenticated
  using (public.is_admin());


-- ---------------------------------------------------------------------------
-- Function privileges (the blanket revoke above stripped them all)
-- ---------------------------------------------------------------------------
grant execute on function public.current_app_user_id()   to anon, authenticated, service_role;
grant execute on function public.is_privileged_session() to anon, authenticated, service_role;
grant execute on function public.current_app_role()      to anon, authenticated, service_role;
grant execute on function public.is_admin()              to anon, authenticated, service_role;
grant execute on function public.is_staff_or_admin()     to anon, authenticated, service_role;
grant execute on function public.normalise_ticket_code(text) to authenticated, service_role;

grant execute on function public.register_for_event(uuid, uuid) to authenticated, service_role;
grant execute on function public.check_in_ticket(text, uuid, timestamptz, text) to authenticated, service_role;

-- Never exposed: ticket codes are minted only inside register_for_event().
revoke all on function public.generate_ticket_code(int) from public, anon, authenticated;
