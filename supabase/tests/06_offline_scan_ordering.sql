-- =============================================================================
-- CSA Digital Hub — test 06: queued offline scans resolve to the EARLIEST
--                            reported time, and a late scan never overwrites
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/06_offline_scan_ordering.sql
--
-- The scenario: two scanners at one door. Scanner ONLINE is connected, scanner
-- OFFLINE has no signal and queues its scans locally, syncing later. Scans
-- therefore ARRIVE in an order that has nothing to do with the order in which
-- people actually walked through the door.
--
-- Contract §5: "the canonical checked_in_at is the earliest reported scan for
-- that ticket. A late-arriving scan never overwrites an earlier check-in; it
-- lands in scan_attempts as a duplicate."
--
-- Both halves of that rule are asserted below, in both orderings:
--   * a late scan reporting a LATER time changes nothing;
--   * a late scan reporting an EARLIER time lowers the canonical time to the
--     earliest, because that is when the person actually arrived — and is still
--     reported as a duplicate, never as a second check-in.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

insert into public.users (id, email, full_name, role) values
  ('ffffffff-0000-4000-8000-0000000000a1', 'offline-a@csa-test.local', 'Offline Tester A', 'attendee'),
  ('ffffffff-0000-4000-8000-0000000000b1', 'offline-b@csa-test.local', 'Offline Tester B', 'attendee');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values (
  'ffffffff-0000-4000-8000-000000000001',
  'Offline sync test — door with two scanners', 'Fictional.', 'cultural',
  'Rotterdam (fictional venue)',
  now() + interval '1 day', now() + interval '12 hours',
  50, 0, 0, 'published'
);

do $$
declare
  c_event constant uuid        := 'ffffffff-0000-4000-8000-000000000001';
  -- t0 is when the attendee actually walked in; the offline scanner recorded it
  -- but could not report it until much later.
  c_t0    constant timestamptz := date_trunc('second', now()) - interval '3 hours';

  v_reg public.registrations;
  v_res public.check_in_result;
  v_ci  timestamptz;
  v_a   record;
begin
  select * into v_reg
  from public.register_for_event(c_event, 'ffffffff-0000-4000-8000-0000000000a1');

  ---------------------------------------------------------------------------
  -- Arrival 1: the ONLINE scanner reports t0 + 5 min. It lands first.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg.ticket_code, c_event, c_t0 + interval '5 minutes', 'scanner-online');

  assert v_res.outcome = 'success'::public.check_in_outcome,
    format('the first scan to arrive must succeed, got %s', v_res.outcome);
  assert v_res.checked_in_at = c_t0 + interval '5 minutes',
    format('expected %s, got %s', c_t0 + interval '5 minutes', v_res.checked_in_at);

  raise notice 'PASS 06.1  online scanner arrives first -> success at %', v_res.checked_in_at;

  ---------------------------------------------------------------------------
  -- Arrival 2: the OFFLINE scanner finally syncs. Its queued scan reports an
  -- EARLIER time, t0. It is a duplicate — and it fixes the canonical time.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg.ticket_code, c_event, c_t0, 'scanner-offline');

  assert v_res.outcome = 'duplicate'::public.check_in_outcome,
    format('a late-arriving scan must never be a second check-in, got %s', v_res.outcome);
  assert v_res.checked_in_at = c_t0,
    format('the canonical time must be the earliest reported scan %s, got %s', c_t0, v_res.checked_in_at);

  select checked_in_at into v_ci from public.registrations where id = v_reg.id;
  assert v_ci = c_t0, format('stored checked_in_at must be %s, got %s', c_t0, v_ci);

  raise notice 'PASS 06.2  late offline scan reporting an EARLIER time -> duplicate, canonical time now %', v_ci;

  ---------------------------------------------------------------------------
  -- Arrival 3: another queued scan, reporting a LATER time. It must not move
  -- the canonical time at all. This is the "never overwrites" half.
  ---------------------------------------------------------------------------
  select * into v_res
  from public.check_in_ticket(v_reg.ticket_code, c_event, c_t0 + interval '10 minutes', 'scanner-offline-2');

  assert v_res.outcome = 'duplicate'::public.check_in_outcome,
    format('expected duplicate, got %s', v_res.outcome);
  assert v_res.checked_in_at = c_t0,
    format('a later scan must not overwrite the earlier check-in, got %s', v_res.checked_in_at);

  select checked_in_at into v_ci from public.registrations where id = v_reg.id;
  assert v_ci = c_t0, 'the stored canonical time must still be the earliest reported scan';

  raise notice 'PASS 06.3  late scan reporting a LATER time -> duplicate, canonical time unchanged';

  ---------------------------------------------------------------------------
  -- The evidence trail: three scans, three devices, one check-in.
  ---------------------------------------------------------------------------
  assert (select count(*) from public.scan_attempts
          where ticket_code = v_reg.ticket_code) = 3,
    'all three scans must be recorded';
  assert (select count(*) from public.scan_attempts
          where ticket_code = v_reg.ticket_code and outcome = 'success') = 1,
    'exactly one scan may be recorded as the successful check-in';
  assert (select count(*) from public.scan_attempts
          where ticket_code = v_reg.ticket_code and outcome = 'duplicate') = 2,
    'the two late scans must be recorded as duplicates';

  -- scanned_at keeps the scanner's raw claim; received_at keeps arrival order.
  -- The two orderings must genuinely differ, otherwise this test proves nothing.
  select min(scanned_at)  as min_scanned,
         max(scanned_at)  as max_scanned,
         min(received_at) as first_arrival
    into v_a
  from public.scan_attempts
  where ticket_code = v_reg.ticket_code;

  assert v_a.min_scanned = c_t0,
    'the earliest reported scan time must be preserved in the evidence log';
  assert v_a.max_scanned = c_t0 + interval '10 minutes',
    'the latest reported scan time must be preserved unclamped';

  -- The scan that ARRIVED first is not the scan that happened first.
  assert (select scanned_at from public.scan_attempts
          where ticket_code = v_reg.ticket_code and device_id = 'scanner-online') > c_t0,
    'this test is only meaningful if the first scan to arrive reported a LATER time';
  assert (select received_at from public.scan_attempts
          where ticket_code = v_reg.ticket_code and device_id = 'scanner-online')
       = v_a.first_arrival,
    'received_at must reflect arrival order, not reported order';

  raise notice 'PASS 06.4  scan_attempts holds all 3 scans; reported order <> arrival order';

  ---------------------------------------------------------------------------
  -- A scanner with a fast clock cannot place a check-in in the future.
  ---------------------------------------------------------------------------
  select * into v_reg
  from public.register_for_event(c_event, 'ffffffff-0000-4000-8000-0000000000b1');

  select * into v_res
  from public.check_in_ticket(v_reg.ticket_code, c_event, now() + interval '1 day', 'scanner-skewed-clock');

  assert v_res.outcome = 'success'::public.check_in_outcome, 'the scan itself is still valid';
  assert v_res.checked_in_at <= now(),
    format('a future-dated scan must be clamped to server time, got %s', v_res.checked_in_at);

  -- but the raw claim is still preserved as evidence
  assert (select scanned_at from public.scan_attempts
          where ticket_code = v_reg.ticket_code) > now(),
    'the scanner''s raw reported time is kept in the evidence log, unclamped';

  raise notice 'PASS 06.5  future-dated scan clamped to %, raw claim preserved as evidence', v_res.checked_in_at;
end
$$;

rollback;

\echo '06_offline_scan_ordering.sql: OK'
