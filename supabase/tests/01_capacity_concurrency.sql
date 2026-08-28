-- =============================================================================
-- CSA Digital Hub — test 01: capacity cannot be oversold
-- =============================================================================
-- Concept prototype. Fictional data only.
--
-- HOW TO RUN
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/01_capacity_concurrency.sql
--
--   (54322 is the local `supabase start` database port. These are plain psql
--    scripts, not pgTAP, so `supabase test db` will NOT run them.)
--
-- WHAT THIS FILE PROVES
--   1. N attempts against a capacity-1 event produce exactly ONE registration
--      and N-1 `event_full` failures, each carrying SQLSTATE CSA03.
--   2. register_for_event() really does take a row lock: after calling it this
--      session holds a RowShareLock on public.events, which is the lock mode
--      SELECT ... FOR UPDATE takes and which a plain SELECT does not.
--
-- WHAT THIS FILE CANNOT PROVE
--   That two callers arriving at the same instant serialise. One session cannot
--   block on itself. Two further harnesses cover that, and both are the real
--   proof point:
--
--     * Deterministic, two sessions, by hand:
--         psql ... -f supabase/tests/01a_concurrency_session_a.sql   (session A)
--         psql ... -f supabase/tests/01b_concurrency_session_b.sql   (session B)
--       Session A pauses while holding the lock; session B visibly blocks on it.
--
--     * N-way, automated, with pgbench:
--         supabase/tests/run_concurrency_test.sh
--       Defaults to 40 clients x 5 transactions and asserts exactly one success.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

set local plpgsql.check_asserts = on;

-- ---------------------------------------------------------------------------
-- Fixture: 10 fictional users and one event with a single place.
-- ---------------------------------------------------------------------------
insert into public.users (id, email, full_name, role)
select ('a0000000-0000-4000-8000-' || lpad(g.i::text, 12, '0'))::uuid,
       format('cap-%s@csa-test.local', lpad(g.i::text, 2, '0')),
       format('Capacity Tester %s', g.i),
       'attendee'
from generate_series(1, 10) as g(i);

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values (
  'aaaaaaaa-0000-4000-8000-000000000001',
  'Capacity test — one place only',
  'Fictional event used by the automated test suite.',
  'social',
  'Rotterdam (fictional venue)',
  now() + interval '7 days',
  now() + interval '6 days',
  1, 500, 1000, 'published'
);

-- ---------------------------------------------------------------------------
-- 1. Ten attempts, one place.
-- ---------------------------------------------------------------------------
do $$
declare
  c_event_id constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  r          record;
  v_success  int := 0;
  v_full     int := 0;
  v_other    int := 0;
begin
  for r in
    select id, email
    from public.users
    where email like 'cap-%@csa-test.local'
    order by email
  loop
    begin
      perform public.register_for_event(c_event_id, r.id);
      v_success := v_success + 1;
    exception
      when sqlstate 'CSA03' then
        -- event_full
        v_full := v_full + 1;
      when others then
        v_other := v_other + 1;
        raise notice 'unexpected failure for %: % / %', r.email, sqlstate, sqlerrm;
    end;
  end loop;

  assert v_success = 1,
    format('expected exactly 1 successful registration, got %s', v_success);
  assert v_full = 9,
    format('expected 9 event_full rejections, got %s', v_full);
  assert v_other = 0,
    format('expected no unexpected failures, got %s', v_other);

  assert (select count(*) from public.registrations where event_id = c_event_id) = 1,
    'the event must hold exactly one registration row';

  raise notice 'PASS 01.1  capacity 1, 10 attempts -> 1 success, 9 event_full';
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The row lock is real, and is still held by this transaction.
-- ---------------------------------------------------------------------------
do $$
declare
  v_src       text;
  v_row_share int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'register_for_event';

  -- Regression guard: a refactor that silently drops the locking clause turns
  -- this whole feature back into a race.
  assert v_src ~* 'for\s+update',
    'register_for_event() must SELECT ... FOR UPDATE the events row';

  -- SELECT ... FOR UPDATE takes RowShareLock on the table; a plain SELECT takes
  -- only AccessShareLock. Seeing RowShareLock here proves the clause executed.
  select count(*) into v_row_share
  from pg_locks
  where locktype = 'relation'
    and relation = 'public.events'::regclass
    and mode     = 'RowShareLock'
    and pid      = pg_backend_pid();

  assert v_row_share >= 1,
    'expected this transaction to hold a RowShareLock on public.events';

  raise notice 'PASS 01.2  register_for_event() holds the events row lock (RowShareLock present)';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The rejection is a named, mappable error rather than a null return.
-- ---------------------------------------------------------------------------
do $$
declare
  c_event_id constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_user     uuid;
  v_state    text;
  v_message  text;
  v_raised   boolean := false;
begin
  select id into v_user from public.users where email = 'cap-10@csa-test.local';

  begin
    perform public.register_for_event(c_event_id, v_user);
  exception when others then
    v_raised := true;
    get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  end;

  assert v_raised, 'registration should have been refused, not silently ignored';
  assert v_state = 'CSA03',   format('expected SQLSTATE CSA03, got %s', v_state);
  assert v_message = 'event_full', format('expected message event_full, got %s', v_message);

  raise notice 'PASS 01.3  refusal is SQLSTATE CSA03 / message event_full';
end
$$;

rollback;

\echo '01_capacity_concurrency.sql: OK (single-session invariants + lock proof)'
\echo 'Run 01a/01b or run_concurrency_test.sh for the true-concurrency proof.'
