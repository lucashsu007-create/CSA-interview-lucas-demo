-- =============================================================================
-- CSA Digital Hub — test 04: price comes from the MEMBERSHIP PERIOD, never
--                            from the user's role
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/04_member_pricing.sql
--
-- Contract §2: "Role governs permissions only. Member pricing is never derived
-- from role — it is derived from an active membership period at registration
-- time." A membership is active when
--     status = 'active' AND now() BETWEEN starts_at AND expires_at
-- and every other combination must fall back to the public price.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('dddddddd-0000-4000-8000-000000000001', 'price-active@csa-test.local',    'Active Member',           'attendee'),
  ('dddddddd-0000-4000-8000-000000000002', 'price-expired@csa-test.local',   'Expired Member',          'attendee'),
  ('dddddddd-0000-4000-8000-000000000003', 'price-lapsed@csa-test.local',    'Lapsed Dates Member',     'attendee'),
  ('dddddddd-0000-4000-8000-000000000004', 'price-future@csa-test.local',    'Not Yet Started Member',  'attendee'),
  ('dddddddd-0000-4000-8000-000000000005', 'price-cancelled@csa-test.local', 'Cancelled Member',        'attendee'),
  ('dddddddd-0000-4000-8000-000000000006', 'price-none@csa-test.local',      'Never A Member',          'attendee'),
  -- the two rows that make the point: role is not a pricing input, in either direction
  ('dddddddd-0000-4000-8000-000000000007', 'price-admin@csa-test.local',     'Admin Without Membership','admin'),
  ('dddddddd-0000-4000-8000-000000000008', 'price-staff@csa-test.local',     'Staff With Membership',   'staff');

insert into public.membership_periods
  (user_id, member_number, membership_type, status, starts_at, expires_at)
values
  -- 1: genuinely active right now
  ('dddddddd-0000-4000-8000-000000000001', 'CSA-TEST-0401', 'general', 'active',
   now() - interval '30 days',  now() + interval '300 days'),
  -- 2: status expired, dates in the past
  ('dddddddd-0000-4000-8000-000000000002', 'CSA-TEST-0402', 'general', 'expired',
   now() - interval '400 days', now() - interval '35 days'),
  -- 3: status still says active but the window has closed
  ('dddddddd-0000-4000-8000-000000000003', 'CSA-TEST-0403', 'general', 'active',
   now() - interval '400 days', now() - interval '1 day'),
  -- 4: status active, window has not opened yet
  ('dddddddd-0000-4000-8000-000000000004', 'CSA-TEST-0404', 'alumni', 'active',
   now() + interval '10 days',  now() + interval '375 days'),
  -- 5: cancelled mid-window
  ('dddddddd-0000-4000-8000-000000000005', 'CSA-TEST-0405', 'general', 'cancelled',
   now() - interval '30 days',  now() + interval '300 days'),
  -- 8: staff who is also a paying member
  ('dddddddd-0000-4000-8000-000000000008', 'CSA-TEST-0408', 'honorary', 'active',
   now() - interval '10 days',  now() + interval '355 days');
-- 6 and 7 deliberately have no membership row at all.

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values
  ('dddddddd-0000-4000-8000-00000000e001',
   'Pricing test — career night', 'Fictional.', 'career', 'Rotterdam (fictional venue)',
   now() + interval '20 days', now() + interval '19 days',
   50, 800, 1500, 'published'),
  ('dddddddd-0000-4000-8000-00000000e002',
   'Pricing test — career night, second edition', 'Fictional.', 'career', 'Rotterdam (fictional venue)',
   now() + interval '40 days', now() + interval '39 days',
   50, 800, 1500, 'published');

-- ---------------------------------------------------------------------------
-- 1. Every case at once.
-- ---------------------------------------------------------------------------
do $$
declare
  c_event constant uuid := 'dddddddd-0000-4000-8000-00000000e001';
  -- member price 800, public price 1500 on this event
  v_case record;
  v_reg  public.registrations;
begin
  for v_case in
    select * from (values
      ('dddddddd-0000-4000-8000-000000000001'::uuid, 'active membership',            800, true ),
      ('dddddddd-0000-4000-8000-000000000002'::uuid, 'status expired',              1500, false),
      ('dddddddd-0000-4000-8000-000000000003'::uuid, 'active status, window closed',1500, false),
      ('dddddddd-0000-4000-8000-000000000004'::uuid, 'active status, not started',  1500, false),
      ('dddddddd-0000-4000-8000-000000000005'::uuid, 'cancelled mid-window',        1500, false),
      ('dddddddd-0000-4000-8000-000000000006'::uuid, 'no membership row',           1500, false),
      ('dddddddd-0000-4000-8000-000000000007'::uuid, 'ADMIN, no membership',        1500, false),
      ('dddddddd-0000-4000-8000-000000000008'::uuid, 'STAFF, active membership',     800, true )
    ) as t(user_id, label, expected_cents, expected_member)
  loop
    select * into v_reg
    from public.register_for_event(c_event, v_case.user_id);

    assert v_reg.price_paid_cents = v_case.expected_cents,
      format('%s: expected %s cents, got %s',
             v_case.label, v_case.expected_cents, v_reg.price_paid_cents);

    assert v_reg.is_member_price = v_case.expected_member,
      format('%s: expected is_member_price %s, got %s',
             v_case.label, v_case.expected_member, v_reg.is_member_price);

    raise notice '  case % -> % cents, is_member_price %',
      rpad(v_case.label, 30), v_reg.price_paid_cents, v_reg.is_member_price;
  end loop;

  raise notice 'PASS 04.1  price resolved from the membership period in all 8 cases';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The role really is irrelevant: an admin pays the public price while an
--    attendee with a membership pays the member price, in the same event.
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin_price    int;
  v_attendee_price int;
  v_staff_price    int;
begin
  select price_paid_cents into v_admin_price
  from public.registrations
  where event_id = 'dddddddd-0000-4000-8000-00000000e001'
    and user_id  = 'dddddddd-0000-4000-8000-000000000007';

  select price_paid_cents into v_attendee_price
  from public.registrations
  where event_id = 'dddddddd-0000-4000-8000-00000000e001'
    and user_id  = 'dddddddd-0000-4000-8000-000000000001';

  select price_paid_cents into v_staff_price
  from public.registrations
  where event_id = 'dddddddd-0000-4000-8000-00000000e001'
    and user_id  = 'dddddddd-0000-4000-8000-000000000008';

  assert v_admin_price > v_attendee_price,
    'an admin without a membership must pay MORE than an attendee with one';
  assert v_staff_price = v_attendee_price,
    'staff with a membership pays the same member price as an attendee with one';

  raise notice 'PASS 04.2  admin % cents > member attendee % cents; staff member = % cents',
    v_admin_price, v_attendee_price, v_staff_price;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Contract §2 verbatim: the SAME user, before and after expiry.
-- ---------------------------------------------------------------------------
do $$
declare
  c_user constant uuid := 'dddddddd-0000-4000-8000-000000000001';
  v_before public.registrations;
  v_after  public.registrations;
begin
  select * into v_before
  from public.registrations
  where event_id = 'dddddddd-0000-4000-8000-00000000e001' and user_id = c_user;

  assert v_before.is_member_price, 'precondition: the first registration was at the member price';

  -- The membership lapses.
  update public.membership_periods
     set status = 'expired', expires_at = now() - interval '1 second'
   where user_id = c_user;

  select * into v_after
  from public.register_for_event('dddddddd-0000-4000-8000-00000000e002', c_user);

  assert v_after.is_member_price = false,
    'after expiry the same user must fall back to the public price';
  assert v_after.price_paid_cents = 1500,
    format('expected 1500 after expiry, got %s', v_after.price_paid_cents);
  assert v_before.price_paid_cents = 800,
    format('expected 800 before expiry, got %s', v_before.price_paid_cents);

  raise notice 'PASS 04.3  same user: % cents while active -> % cents after expiry',
    v_before.price_paid_cents, v_after.price_paid_cents;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. The price is written at registration time and does not drift afterwards.
-- ---------------------------------------------------------------------------
do $$
declare
  v_price int;
begin
  update public.events set price_public_cents = 9999, price_member_cents = 1
   where id = 'dddddddd-0000-4000-8000-00000000e001';

  select price_paid_cents into v_price
  from public.registrations
  where event_id = 'dddddddd-0000-4000-8000-00000000e001'
    and user_id  = 'dddddddd-0000-4000-8000-000000000007';

  assert v_price = 1500,
    format('a stored price must not follow later edits to the event, got %s', v_price);

  raise notice 'PASS 04.4  price_paid_cents is a snapshot, not a live lookup';
end
$$;

rollback;

\echo '04_member_pricing.sql: OK'
