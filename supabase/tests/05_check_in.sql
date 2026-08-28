-- =============================================================================
-- CSA Digital Hub — test 05: check-in is idempotent, event-bound and audited
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/05_check_in.sql
--
-- Covers all four members of the closed check_in_outcome enum:
--   success | duplicate | wrong_event | invalid
-- and the rule that every scan lands in scan_attempts whatever the outcome.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'checkin-a@csa-test.local',     'Check-in Tester A', 'attendee'),
  ('eeeeeeee-0000-4000-8000-0000000000b1', 'checkin-b@csa-test.local',     'Check-in Tester B', 'attendee'),
  ('eeeeeeee-0000-4000-8000-0000000000c1', 'checkin-staff@csa-test.local', 'Check-in Staff',    'staff');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values
  ('eeeeeeee-0000-4000-8000-000000000001',
   'Check-in test — event one', 'Fictional.', 'social', 'Rotterdam (fictional venue)',
   now() + interval '1 day', now() + interval '12 hours', 50, 0, 0, 'published'),
  ('eeeeeeee-0000-4000-8000-000000000002',
   'Check-in test — event two', 'Fictional.', 'sports', 'Rotterdam (fictional venue)',
   now() + interval '2 days', now() + interval '36 hours', 50, 0, 0, 'published');

do $$
declare
  c_event_1 constant uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  c_event_2 constant uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  c_t0      constant timestamptz := date_trunc('second', now()) - interval '2 hours';

  v_reg_1 public.registrations;
  v_reg_2 public.registrations;
  v_res   public.check_in_result;
  v_first timestamptz;
  v_scans int;
begin
  select * into v_reg_1 from public.register_for_event(c_event_1, 'eeeeeeee-0000-4000-8000-0000000000a1');
  select * into v_reg_2 from public.register_for_event(c_event_2, 'eeeeeeee-0000-4000-8000-0000000000b1');

  ---------------------------------------------------------------------------
  -- 1. First scan: success.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg_1.ticket_code, c_event_1, c_t0, 'scanner-01');

  assert v_res.outcome = 'success'::public.check_in_outcome,
    format('first scan must succeed, got %s', v_res.outcome);
  assert v_res.registration_id = v_reg_1.id, 'the result must identify the registration';
  assert v_res.checked_in_at = c_t0,
    format('checked_in_at must be the reported scan time %s, got %s', c_t0, v_res.checked_in_at);

  v_first := v_res.checked_in_at;
  raise notice 'PASS 05.1  first scan -> success at %', v_first;

  ---------------------------------------------------------------------------
  -- 2. Second scan: duplicate, returning the ORIGINAL time, not an error.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg_1.ticket_code, c_event_1, c_t0 + interval '10 minutes', 'scanner-02');

  assert v_res.outcome = 'duplicate'::public.check_in_outcome,
    format('second scan must be duplicate, got %s', v_res.outcome);
  assert v_res.checked_in_at = v_first,
    format('duplicate must return the original check-in time %s, got %s', v_first, v_res.checked_in_at);

  assert (select checked_in_at from public.registrations where id = v_reg_1.id) = v_first,
    'a later scan must not move the stored check-in time';

  raise notice 'PASS 05.2  second scan -> duplicate, original time % preserved', v_first;

  ---------------------------------------------------------------------------
  -- 3. A ticket presented at the wrong event.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg_2.ticket_code, c_event_1, c_t0, 'scanner-01');

  assert v_res.outcome = 'wrong_event'::public.check_in_outcome,
    format('a ticket for another event must be wrong_event, got %s', v_res.outcome);
  assert (select checked_in_at from public.registrations where id = v_reg_2.id) is null,
    'a wrong_event scan must never check anybody in';

  raise notice 'PASS 05.3  ticket for event two scanned at event one -> wrong_event, not checked in';

  ---------------------------------------------------------------------------
  -- 4. An unknown code.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket('ZZZZZZZZZZ', c_event_1, c_t0, 'scanner-01');

  assert v_res.outcome = 'invalid'::public.check_in_outcome,
    format('an unknown code must be invalid, got %s', v_res.outcome);
  assert v_res.registration_id is null, 'an invalid scan has no registration';
  assert v_res.ticket_code = 'ZZZZZZZZZZ', 'the scanned code is echoed back for the operator';

  raise notice 'PASS 05.4  unknown code -> invalid';

  ---------------------------------------------------------------------------
  -- 5. Manual entry at the door: Crockford base32 is case-insensitive and
  --    tolerates hyphens, so a hand-typed code still resolves to the ticket
  --    (and is therefore a duplicate, not an invalid).
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(
         lower(substr(v_reg_1.ticket_code, 1, 5)) || '-' || lower(substr(v_reg_1.ticket_code, 6, 5)),
         c_event_1, c_t0 + interval '20 minutes', 'manual-entry');

  assert v_res.outcome = 'duplicate'::public.check_in_outcome,
    format('lower-case hyphenated manual entry must resolve to the same ticket, got %s', v_res.outcome);
  assert v_res.registration_id = v_reg_1.id, 'manual entry must resolve to the same registration';

  raise notice 'PASS 05.5  manual entry normalises case and hyphens';

  ---------------------------------------------------------------------------
  -- 6. Crockford digit confusion: I and L read as 1, O reads as 0.
  ---------------------------------------------------------------------------
  if position('1' in v_reg_1.ticket_code) > 0 then
    select * into v_res
    from public.check_in_ticket(
           overlay(v_reg_1.ticket_code placing 'I' from position('1' in v_reg_1.ticket_code) for 1),
           c_event_1, c_t0 + interval '25 minutes', 'manual-entry');

    assert v_res.registration_id = v_reg_1.id,
      'a hand-typed I must be read as 1';
    raise notice 'PASS 05.6  Crockford I -> 1 handled';
  else
    raise notice 'SKIP 05.6  this run''s ticket code contains no 1 to mistype';
  end if;

  ---------------------------------------------------------------------------
  -- 7. Every single scan was recorded, whatever the outcome.
  ---------------------------------------------------------------------------
  select count(*) into v_scans
  from public.scan_attempts
  where event_id = c_event_1;

  assert v_scans >= 5,
    format('expected at least 5 scan_attempts rows for event one, got %s', v_scans);

  assert (select count(*) from public.scan_attempts
          where event_id = c_event_1 and outcome = 'success')     = 1, 'exactly one success recorded';
  assert (select count(*) from public.scan_attempts
          where event_id = c_event_1 and outcome = 'wrong_event') = 1, 'the wrong_event scan is recorded';
  assert (select count(*) from public.scan_attempts
          where event_id = c_event_1 and outcome = 'invalid')     = 1, 'the invalid scan is recorded';
  assert (select count(*) from public.scan_attempts
          where event_id = c_event_1 and outcome = 'duplicate')  >= 2, 'the duplicate scans are recorded';

  -- the rejected scans are evidence, not registrations
  assert (select count(*) from public.registrations where event_id = c_event_1) = 1,
    'no scan may ever create a registration';

  raise notice 'PASS 05.7  % scan attempts recorded, 1 registration unchanged', v_scans;
end
$$;

rollback;

\echo '05_check_in.sql: OK'
