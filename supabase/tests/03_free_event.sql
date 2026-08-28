-- =============================================================================
-- CSA Digital Hub — test 03: a zero-price event issues a valid ticket, paid,
--                            with no payment step
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/03_free_event.sql
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('cccccccc-0000-4000-8000-0000000000a1', 'free-nonmember@csa-test.local', 'Free Event Non-member', 'attendee'),
  ('cccccccc-0000-4000-8000-0000000000b1', 'free-member@csa-test.local',    'Free Event Member',     'attendee'),
  ('cccccccc-0000-4000-8000-0000000000c1', 'paid-nonmember@csa-test.local', 'Paid Event Non-member', 'attendee');

insert into public.membership_periods (user_id, member_number, membership_type, status, starts_at, expires_at) values
  ('cccccccc-0000-4000-8000-0000000000b1', 'CSA-TEST-0301', 'general', 'active',
   now() - interval '30 days', now() + interval '300 days');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values
  ('cccccccc-0000-4000-8000-000000000001',
   'Free event — open study session', 'Fictional.', 'educational', 'Rotterdam (fictional venue)',
   now() + interval '10 days', now() + interval '9 days',
   100, 0, 0, 'published'),
  ('cccccccc-0000-4000-8000-000000000002',
   'Paid event — gala dinner', 'Fictional.', 'social', 'Rotterdam (fictional venue)',
   now() + interval '10 days', now() + interval '9 days',
   100, 2500, 4000, 'published');

-- ---------------------------------------------------------------------------
-- 1. Free event, non-member: price 0, payment_status paid, valid ticket.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg public.registrations;
begin
  select * into v_reg
  from public.register_for_event(
         'cccccccc-0000-4000-8000-000000000001',
         'cccccccc-0000-4000-8000-0000000000a1'
       );

  assert v_reg.id is not null, 'a free event must issue a registration';
  assert v_reg.price_paid_cents = 0,
    format('expected price 0, got %s', v_reg.price_paid_cents);
  assert v_reg.payment_status = 'paid'::public.payment_status,
    format('a zero-price registration must be paid on issue, got %s', v_reg.payment_status);

  -- a valid ticket: 10 characters of Crockford base32
  assert v_reg.ticket_code is not null, 'a ticket code must be issued';
  assert length(v_reg.ticket_code) = 10,
    format('expected a 10 character ticket code, got %s', length(v_reg.ticket_code));
  assert v_reg.ticket_code ~ '^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$',
    format('ticket code %s is not Crockford base32', v_reg.ticket_code);

  -- and no payment step at all
  assert (select count(*) from public.payments p where p.registration_id = v_reg.id) = 0,
    'a free registration must not require a payments row';

  raise notice 'PASS 03.1  free event -> price 0, payment_status paid, ticket % issued', v_reg.ticket_code;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Free event, member: still 0, still paid. Membership does not create a
--    payment obligation out of nothing.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg public.registrations;
begin
  select * into v_reg
  from public.register_for_event(
         'cccccccc-0000-4000-8000-000000000001',
         'cccccccc-0000-4000-8000-0000000000b1'
       );

  assert v_reg.price_paid_cents = 0, format('expected price 0, got %s', v_reg.price_paid_cents);
  assert v_reg.payment_status = 'paid'::public.payment_status, 'must be paid on issue';
  assert v_reg.is_member_price = true, 'the member flag still reflects the membership state';

  raise notice 'PASS 03.2  free event, active member -> price 0, paid, is_member_price = true';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Contrast: a priced event is issued pending, not paid.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg public.registrations;
begin
  select * into v_reg
  from public.register_for_event(
         'cccccccc-0000-4000-8000-000000000002',
         'cccccccc-0000-4000-8000-0000000000c1'
       );

  assert v_reg.price_paid_cents = 4000,
    format('expected the public price 4000, got %s', v_reg.price_paid_cents);
  assert v_reg.payment_status = 'pending'::public.payment_status,
    format('a priced registration must start pending, got %s', v_reg.payment_status);

  raise notice 'PASS 03.3  priced event -> payment_status pending';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Ticket codes issued in this test are unique and not derived from the ids.
-- ---------------------------------------------------------------------------
do $$
declare
  v_total    int;
  v_distinct int;
  v_leaks    int;
begin
  select count(*), count(distinct ticket_code) into v_total, v_distinct
  from public.registrations
  where event_id in (
    'cccccccc-0000-4000-8000-000000000001',
    'cccccccc-0000-4000-8000-000000000002'
  );

  assert v_total = v_distinct, 'ticket codes must be unique';

  -- Nothing recognisable from the ids may appear in the code.
  select count(*) into v_leaks
  from public.registrations r
  where r.event_id in (
      'cccccccc-0000-4000-8000-000000000001',
      'cccccccc-0000-4000-8000-000000000002'
    )
    and (
      upper(replace(r.id::text, '-', ''))       like '%' || r.ticket_code || '%'
      or upper(replace(r.user_id::text, '-', ''))  like '%' || r.ticket_code || '%'
      or upper(replace(r.event_id::text, '-', '')) like '%' || r.ticket_code || '%'
    );

  assert v_leaks = 0, 'a ticket code must not be derived from any id';

  raise notice 'PASS 03.4  ticket codes unique and independent of every id';
end
$$;

rollback;

\echo '03_free_event.sql: OK'
