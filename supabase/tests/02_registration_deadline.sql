-- =============================================================================
-- CSA Digital Hub — test 02: the registration deadline is enforced server-side
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/02_registration_deadline.sql
--
-- Runs inside a transaction and rolls back, so it leaves nothing behind and is
-- safe against a seeded database.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'deadline-a@csa-test.local', 'Deadline Tester A', 'attendee'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'deadline-b@csa-test.local', 'Deadline Tester B', 'attendee'),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'deadline-c@csa-test.local', 'Deadline Tester C', 'attendee');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values
  -- deadline has passed, but the event itself has not started yet
  ('bbbbbbbb-0000-4000-8000-000000000001',
   'Deadline test — registration closed', 'Fictional.', 'cultural', 'Rotterdam (fictional venue)',
   now() + interval '2 days', now() - interval '1 hour',
   50, 500, 1000, 'published'),
  -- deadline still open
  ('bbbbbbbb-0000-4000-8000-000000000002',
   'Deadline test — registration open', 'Fictional.', 'cultural', 'Rotterdam (fictional venue)',
   now() + interval '9 days', now() + interval '8 days',
   50, 500, 1000, 'published'),
  -- not published yet
  ('bbbbbbbb-0000-4000-8000-000000000003',
   'Deadline test — still a draft', 'Fictional.', 'cultural', 'Rotterdam (fictional venue)',
   now() + interval '9 days', now() + interval '8 days',
   50, 500, 1000, 'draft');

-- ---------------------------------------------------------------------------
-- 1. After the deadline: refused with registration_closed / CSA02.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state   text;
  v_message text;
  v_raised  boolean := false;
begin
  begin
    perform public.register_for_event(
      'bbbbbbbb-0000-4000-8000-000000000001',
      'bbbbbbbb-0000-4000-8000-0000000000a1'
    );
  exception when others then
    v_raised := true;
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  end;

  assert v_raised, 'registration after the deadline must be refused';
  assert v_state   = 'CSA02',              format('expected SQLSTATE CSA02, got %s', v_state);
  assert v_message = 'registration_closed', format('expected registration_closed, got %s', v_message);

  assert (select count(*) from public.registrations
          where event_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 0,
    'no registration row may exist for a closed event';

  raise notice 'PASS 02.1  past deadline -> registration_closed (CSA02), no row written';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Before the deadline: accepted.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg public.registrations;
begin
  -- `select * into rowvar from f()` rather than `rowvar := f()`: the set form
  -- expands the composite into columns, which is unambiguous for a row variable.
  select * into v_reg
  from public.register_for_event(
         'bbbbbbbb-0000-4000-8000-000000000002',
         'bbbbbbbb-0000-4000-8000-0000000000b1'
       );

  assert v_reg.id is not null, 'an open event must accept the registration';
  assert length(v_reg.ticket_code) = 10, 'ticket code must be 10 characters';

  raise notice 'PASS 02.2  open deadline -> registration accepted (%)', v_reg.ticket_code;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. A draft event is not registrable at all, even before its deadline.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state   text;
  v_message text;
  v_raised  boolean := false;
begin
  begin
    perform public.register_for_event(
      'bbbbbbbb-0000-4000-8000-000000000003',
      'bbbbbbbb-0000-4000-8000-0000000000c1'
    );
  exception when others then
    v_raised := true;
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  end;

  assert v_raised, 'a draft event must not accept registrations';
  assert v_state   = 'CSA01',                format('expected SQLSTATE CSA01, got %s', v_state);
  assert v_message = 'event_not_published',  format('expected event_not_published, got %s', v_message);

  raise notice 'PASS 02.3  draft event -> event_not_published (CSA01)';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. The deadline is evaluated at call time, not cached from the event row.
--    Moving the deadline into the past closes an event that was open a moment
--    ago, for a user who has not registered yet.
-- ---------------------------------------------------------------------------
do $$
declare
  v_state  text;
  v_raised boolean := false;
begin
  update public.events
     set registration_deadline_at = now() - interval '1 second'
   where id = 'bbbbbbbb-0000-4000-8000-000000000002';

  begin
    perform public.register_for_event(
      'bbbbbbbb-0000-4000-8000-000000000002',
      'bbbbbbbb-0000-4000-8000-0000000000c1'
    );
  exception when others then
    v_raised := true;
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  assert v_raised and v_state = 'CSA02',
    format('expected CSA02 once the deadline moved into the past, got raised=%s state=%s', v_raised, v_state);

  raise notice 'PASS 02.4  deadline is re-evaluated on every call';
end
$$;

rollback;

\echo '02_registration_deadline.sql: OK'
