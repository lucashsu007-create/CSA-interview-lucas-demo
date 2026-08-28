-- =============================================================================
-- CSA Digital Hub — test 01e: assertions for the pgbench concurrency run
-- =============================================================================
-- Run after 01c + the pgbench pass. Asserts the invariant, prints the evidence,
-- then removes the fixture.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/01e_concurrency_assert.sql
-- =============================================================================

\set ON_ERROR_STOP on

set plpgsql.check_asserts = on;

\echo ''
\echo '--- outcomes recorded by the concurrent clients -------------------------'
select outcome, count(*) as attempts
from public.csa_test_concurrency_results
group by outcome
order by attempts desc;

\echo ''
\echo '--- the winning registration -------------------------------------------'
select r.ticket_code, r.price_paid_cents, r.is_member_price, r.payment_status, u.email
from public.registrations r
join public.users u on u.id = r.user_id
where r.event_id = '0c0ffee0-0000-4000-8000-000000000002';

do $$
declare
  c_event_id constant uuid := '0c0ffee0-0000-4000-8000-000000000002';
  v_attempts   int;
  v_success    int;
  v_full       int;
  v_unexpected int;
  v_rows       int;
  v_capacity   int;
begin
  select count(*),
         count(*) filter (where outcome = 'success'),
         count(*) filter (where outcome = 'event_full'),
         count(*) filter (where outcome like 'unexpected%' or outcome = 'no_such_slot')
    into v_attempts, v_success, v_full, v_unexpected
  from public.csa_test_concurrency_results;

  select count(*) into v_rows     from public.registrations where event_id = c_event_id;
  select capacity into v_capacity from public.events        where id = c_event_id;

  assert v_attempts > 1,
    'no concurrent attempts were recorded — did the pgbench step run?';
  assert v_unexpected = 0,
    format('%s attempts failed for an unexpected reason', v_unexpected);
  assert v_success = 1,
    format('OVERSOLD: expected exactly 1 success across %s concurrent attempts, got %s',
           v_attempts, v_success);
  assert v_full = v_attempts - 1,
    format('expected %s event_full rejections, got %s', v_attempts - 1, v_full);
  assert v_rows = v_capacity,
    format('expected %s registration row(s) for a capacity-%s event, found %s',
           v_capacity, v_capacity, v_rows);

  raise notice 'PASS 01e  % concurrent attempts against capacity 1 -> 1 success, % event_full, 0 oversold',
    v_attempts, v_full;
end
$$;

-- Teardown.
begin;
drop function if exists public.csa_test_try_register(int);
drop table    if exists public.csa_test_concurrency_results;
delete from public.events where id = '0c0ffee0-0000-4000-8000-000000000002';
delete from public.users  where email like 'conc-%@csa-test.local';
commit;

\echo ''
\echo '01e_concurrency_assert.sql: OK — capacity held under true concurrency.'
