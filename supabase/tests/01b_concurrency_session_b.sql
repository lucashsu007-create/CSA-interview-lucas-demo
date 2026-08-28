-- =============================================================================
-- CSA Digital Hub — test 01b: two-session concurrency proof, SESSION B
-- =============================================================================
-- Concept prototype. Fictional data only.
--
-- Run 01a_concurrency_session_a.sql FIRST, in another terminal, and start this
-- script only once that one prints "SESSION A IS HOLDING THE LOCK".
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -f supabase/tests/01b_concurrency_session_b.sql
--
-- EXPECTED BEHAVIOUR
--   * this script blocks — the elapsed time reported by \timing is the time it
--     spent waiting on the row lock held by session A;
--   * when session A commits, this call unblocks, re-reads the events row, sees
--     the place taken and fails with:
--         ERROR:  event_full
--         DETAIL: 1 of 1 places taken.
--         SQLSTATE CSA03
--
-- If instead this call SUCCEEDS, the row lock has been lost and the event has
-- been oversold. That is the failure the whole design exists to prevent.
-- =============================================================================

-- Keep going after the expected error so the verification below still runs.
\set ON_ERROR_STOP off
\timing on

\echo ''
\echo '--- session B: calling register_for_event(); this will block ------------'
\echo ''

select ticket_code, price_paid_cents, payment_status
from public.register_for_event(
       '0c0ffee0-0000-4000-8000-000000000001',
       '0c0ffee0-0000-4000-8000-0000000000b1'
     );

\timing off
\echo ''
\echo '--- verification --------------------------------------------------------'

select count(*) as registrations_for_event,
       (select capacity from public.events where id = '0c0ffee0-0000-4000-8000-000000000001') as capacity
from public.registrations
where event_id = '0c0ffee0-0000-4000-8000-000000000001';

\echo 'PASS when registrations_for_event = 1 and the call above raised event_full.'
