-- =============================================================================
-- CSA Digital Hub — test 08: row level security
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/08_rls_policies.sql
--
-- Impersonation works exactly as it does through PostgREST: set the request
-- claims, then SET ROLE to the API role. The helper functions read the same
-- GUCs Supabase's auth.uid() reads, so what is asserted here is what the API
-- enforces.
--
-- Requires the session to be able to SET ROLE anon/authenticated, which is the
-- case for `postgres` on a local `supabase start`.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('08000000-0000-4000-8000-000000000001', 'rls-admin@csa-test.local',    'RLS Admin',     'admin'),
  ('08000000-0000-4000-8000-000000000002', 'rls-staff@csa-test.local',    'RLS Staff',     'staff'),
  ('08000000-0000-4000-8000-000000000003', 'rls-attendee1@csa-test.local','RLS Attendee 1','attendee'),
  ('08000000-0000-4000-8000-000000000004', 'rls-attendee2@csa-test.local','RLS Attendee 2','attendee');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values
  ('08000000-0000-4000-8000-00000000e001',
   'RLS test — published', 'Fictional.', 'social', 'Rotterdam (fictional venue)',
   now() + interval '5 days', now() + interval '4 days', 20, 0, 0, 'published'),
  ('08000000-0000-4000-8000-00000000e002',
   'RLS test — draft', 'Fictional.', 'social', 'Rotterdam (fictional venue)',
   now() + interval '6 days', now() + interval '5 days', 20, 0, 0, 'draft');

select public.register_for_event('08000000-0000-4000-8000-00000000e001',
                                 '08000000-0000-4000-8000-000000000003');
select public.register_for_event('08000000-0000-4000-8000-00000000e001',
                                 '08000000-0000-4000-8000-000000000004');

-- ---------------------------------------------------------------------------
-- A. Guest (anon): published events and partners only.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;

do $$
declare
  v_events int;
  v_denied boolean := false;
  v_state  text;
begin
  select count(*) into v_events
  from public.events
  where id in ('08000000-0000-4000-8000-00000000e001', '08000000-0000-4000-8000-00000000e002');
  assert v_events = 1, format('a guest must see only the published event, saw %s', v_events);

  begin
    perform count(*) from public.registrations;
  exception when others then
    v_denied := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_denied and v_state = '42501',
    format('a guest must not read registrations at all, got denied=%s state=%s', v_denied, v_state);

  raise notice 'PASS 08.A  guest sees 1 published event, no registrations';
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- B. Attendee: own data only, no writes anywhere.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"08000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_events int;
  v_regs   int;
  v_state  text;
  v_denied boolean;
begin
  assert public.current_app_user_id() = '08000000-0000-4000-8000-000000000003',
    'impersonation did not take effect';

  select count(*) into v_events
  from public.events
  where id in ('08000000-0000-4000-8000-00000000e001', '08000000-0000-4000-8000-00000000e002');
  assert v_events = 1, format('an attendee must not see draft events, saw %s', v_events);

  select count(*) into v_regs
  from public.registrations
  where event_id = '08000000-0000-4000-8000-00000000e001';
  assert v_regs = 1, format('an attendee must see only their own registration, saw %s', v_regs);

  assert (select user_id from public.registrations
          where event_id = '08000000-0000-4000-8000-00000000e001')
         = '08000000-0000-4000-8000-000000000003',
    'the visible registration must be the attendee''s own';

  -- cannot publish events
  v_denied := false;
  begin
    insert into public.events (title, category, starts_at, registration_deadline_at, capacity, status)
    values ('RLS test — attendee should not be able to write this', 'social',
            now() + interval '9 days', now() + interval '8 days', 10, 'published');
  exception when others then
    v_denied := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_denied and v_state = '42501',
    format('an attendee must not create events, got denied=%s state=%s', v_denied, v_state);

  -- cannot write their own registration row directly (RPC only)
  v_denied := false;
  begin
    insert into public.registrations (event_id, user_id, ticket_code, price_paid_cents, payment_status)
    values ('08000000-0000-4000-8000-00000000e001',
            '08000000-0000-4000-8000-000000000003', 'ABCDEFGHJK', 0, 'paid');
  exception when others then
    v_denied := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_denied and v_state = '42501',
    format('registrations must be RPC-only, got denied=%s state=%s', v_denied, v_state);

  -- cannot check themselves in. An UPDATE whose USING clause matches nothing is
  -- filtered to zero rows rather than raising, so FOUND is what to assert on.
  update public.registrations set checked_in_at = now()
   where event_id = '08000000-0000-4000-8000-00000000e001';
  assert not found, 'an attendee must not be able to self check-in';
  assert (select checked_in_at from public.registrations
          where event_id = '08000000-0000-4000-8000-00000000e001') is null,
    'the attendee''s check-in time must be untouched';

  -- cannot scan
  v_denied := false;
  begin
    perform public.check_in_ticket('ABCDEFGHJK', '08000000-0000-4000-8000-00000000e001', now(), 'rogue');
  exception when others then
    v_denied := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_denied and v_state = 'CSA42',
    format('check_in_ticket must be staff-only, got denied=%s state=%s', v_denied, v_state);

  -- cannot register somebody else
  v_denied := false;
  begin
    perform public.register_for_event('08000000-0000-4000-8000-00000000e001',
                                      '08000000-0000-4000-8000-000000000001');
  exception when others then
    v_denied := true; get stacked diagnostics v_state = returned_sqlstate;
  end;
  assert v_denied and v_state = 'CSA42',
    format('an attendee must not register another user, got denied=%s state=%s', v_denied, v_state);

  -- cannot read the audit trail
  select count(*) into v_regs from public.audit_events;
  assert v_regs = 0, 'an attendee must not read audit_events';

  -- and cannot read the scan evidence log
  select count(*) into v_regs from public.scan_attempts;
  assert v_regs = 0, 'an attendee must not read scan_attempts';

  raise notice 'PASS 08.B  attendee: own row only, no event writes, no self check-in, no scanning';
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- C. Staff: reads everything operational, and may scan.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"08000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_events int;
  v_regs   int;
  v_code   text;
  v_res    public.check_in_result;
begin
  select count(*) into v_events
  from public.events
  where id in ('08000000-0000-4000-8000-00000000e001', '08000000-0000-4000-8000-00000000e002');
  assert v_events = 2, format('staff must see drafts too, saw %s', v_events);

  select count(*) into v_regs
  from public.registrations
  where event_id = '08000000-0000-4000-8000-00000000e001';
  assert v_regs = 2, format('staff must see every registration for the door, saw %s', v_regs);

  select ticket_code into v_code
  from public.registrations
  where user_id = '08000000-0000-4000-8000-000000000003';

  select * into v_res
  from public.check_in_ticket(v_code, '08000000-0000-4000-8000-00000000e001', now(), 'door-scanner');

  assert v_res.outcome = 'success'::public.check_in_outcome,
    format('staff must be able to check a ticket in, got %s', v_res.outcome);

  -- but staff still cannot publish or edit events: the UPDATE policy is
  -- admin-only, so the statement matches zero rows instead of raising.
  update public.events set status = 'cancelled'
   where id = '08000000-0000-4000-8000-00000000e001';
  assert not found, 'staff must not be able to change an event';
  assert (select status from public.events where id = '08000000-0000-4000-8000-00000000e001')
         = 'published'::public.event_status,
    'the event status must be untouched by staff';

  raise notice 'PASS 08.C  staff: sees drafts and all registrations, may scan, may not edit events';
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- D. Admin: writes events, reads the audit trail.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"08000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_audit int;
  v_new   int;
begin
  insert into public.events (title, category, starts_at, registration_deadline_at, capacity, status)
  values ('RLS test — created by admin', 'career',
          now() + interval '9 days', now() + interval '8 days', 10, 'published');

  select count(*) into v_new from public.events where title = 'RLS test — created by admin';
  assert v_new = 1, 'an admin must be able to publish an event';

  select count(*) into v_audit from public.audit_events;
  assert v_audit >= 2, format('an admin must read the audit trail, saw %s rows', v_audit);

  raise notice 'PASS 08.D  admin: publishes events and reads the audit trail';
end
$$;

reset role;

rollback;

\echo '08_rls_policies.sql: OK'
