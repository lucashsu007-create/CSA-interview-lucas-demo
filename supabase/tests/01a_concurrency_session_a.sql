-- =============================================================================
-- CSA Digital Hub — test 01a: two-session concurrency proof, SESSION A
-- =============================================================================
-- Concept prototype. Fictional data only.
--
-- HOW TO RUN  (two terminals, in this order)
--
--   Terminal 1:
--     psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--          -f supabase/tests/01a_concurrency_session_a.sql
--
--   Terminal 2, as soon as terminal 1 says "session A is holding the lock":
--     psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--          -f supabase/tests/01b_concurrency_session_b.sql
--
--   Terminal 2 will HANG. That hang is the demonstration: session B is blocked
--   inside `SELECT ... FROM events ... FOR UPDATE`. Press ENTER in terminal 1 to
--   commit session A; terminal 2 then unblocks and is refused with `event_full`.
--
-- Do not use -v ON_ERROR_STOP=1 here; the script is interactive by design.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

-- ---------------------------------------------------------------------------
-- Committed fixture, shared by both sessions. Re-runnable.
-- ---------------------------------------------------------------------------
begin;

delete from public.events where id = '0c0ffee0-0000-4000-8000-000000000001';
delete from public.users  where email in ('conc-a@csa-test.local', 'conc-b@csa-test.local');

insert into public.users (id, email, full_name, role) values
  ('0c0ffee0-0000-4000-8000-0000000000a1', 'conc-a@csa-test.local', 'Concurrency Tester A', 'attendee'),
  ('0c0ffee0-0000-4000-8000-0000000000b1', 'conc-b@csa-test.local', 'Concurrency Tester B', 'attendee');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values (
  '0c0ffee0-0000-4000-8000-000000000001',
  'Two-session concurrency test — one place only',
  'Fictional event used by the manual concurrency demonstration.',
  'social',
  'Rotterdam (fictional venue)',
  now() + interval '7 days',
  now() + interval '6 days',
  1, 500, 1000, 'published'
);

commit;

\echo ''
\echo '--- fixture committed: one published event, capacity 1, two users --------'
\echo ''

-- ---------------------------------------------------------------------------
-- The interleaving.
-- ---------------------------------------------------------------------------
begin;

select ticket_code, price_paid_cents, is_member_price, payment_status
from public.register_for_event(
       '0c0ffee0-0000-4000-8000-000000000001',
       '0c0ffee0-0000-4000-8000-0000000000a1'
     );

\echo ''
\echo '>>> SESSION A IS HOLDING THE LOCK.'
\echo '>>> It has taken the only place, but has NOT committed.'
\echo '>>> Start session B now, in a second terminal:'
\echo '>>>   psql "$DB_URL" -f supabase/tests/01b_concurrency_session_b.sql'
\echo '>>> Session B will hang on the events row lock.'
\echo ''
\prompt 'Press ENTER once session B is visibly blocked, to COMMIT session A... ' _ack

commit;

\echo ''
\echo '>>> SESSION A COMMITTED. Session B should now unblock and be refused with'
\echo '>>> ERROR: event_full (SQLSTATE CSA03).'
\echo ''

select count(*) as registrations_for_event
from public.registrations
where event_id = '0c0ffee0-0000-4000-8000-000000000001';

\echo 'Expected: exactly 1. Clean up afterwards with 01f_concurrency_teardown.sql.'
