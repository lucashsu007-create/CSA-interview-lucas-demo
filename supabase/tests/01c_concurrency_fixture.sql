-- =============================================================================
-- CSA Digital Hub — test 01c: fixture for the pgbench concurrency run
-- =============================================================================
-- Concept prototype. Fictional data only.
--
-- Creates, and COMMITS (pgbench needs several connections to see it):
--   * 200 fictional users, conc-000@csa-test.local .. conc-199@csa-test.local
--   * one published event with capacity 1
--   * a results table and a helper that swallows the expected `event_full`
--     rejection so that pgbench clients do not abort
--
-- Driven by supabase/tests/run_concurrency_test.sh. Everything created here is
-- removed by 01e_concurrency_assert.sql (or 01f_concurrency_teardown.sql).
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- Re-runnable.
drop function if exists public.csa_test_try_register(int);
drop table    if exists public.csa_test_concurrency_results;
delete from public.events where id = '0c0ffee0-0000-4000-8000-000000000002';
delete from public.users  where email like 'conc-%@csa-test.local';

insert into public.users (id, email, full_name, role)
select ('0c0ffee0-0000-4000-8000-' || lpad(g.i::text, 12, '0'))::uuid,
       format('conc-%s@csa-test.local', lpad(g.i::text, 3, '0')),
       format('Concurrency Tester %s', g.i),
       'attendee'
from generate_series(0, 199) as g(i);

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values (
  '0c0ffee0-0000-4000-8000-000000000002',
  'pgbench concurrency test — one place only',
  'Fictional event used by the automated concurrency run.',
  'social',
  'Rotterdam (fictional venue)',
  now() + interval '7 days',
  now() + interval '6 days',
  1, 500, 1000, 'published'
);

create table public.csa_test_concurrency_results (
  id          bigserial primary key,
  slot        int  not null,
  outcome     text not null,
  recorded_at timestamptz not null default clock_timestamp()
);

-- One pgbench client == one slot == one fictional user. The EXCEPTION block
-- turns the expected rejection into a recorded row instead of a client abort;
-- the INSERT that follows runs in the function's own (still live) transaction.
create function public.csa_test_try_register(p_slot int)
returns text
language plpgsql
as $fn$
declare
  c_event_id constant uuid := '0c0ffee0-0000-4000-8000-000000000002';
  v_user     uuid;
  v_outcome  text;
begin
  select u.id into v_user
  from public.users u
  where u.email = format('conc-%s@csa-test.local', lpad(p_slot::text, 3, '0'));

  if v_user is null then
    v_outcome := 'no_such_slot';
  else
    begin
      perform public.register_for_event(c_event_id, v_user);
      v_outcome := 'success';
    exception
      when sqlstate 'CSA03' then v_outcome := 'event_full';
      when sqlstate 'CSA05' then v_outcome := 'already_registered';
      when others           then v_outcome := format('unexpected:%s:%s', sqlstate, sqlerrm);
    end;
  end if;

  insert into public.csa_test_concurrency_results (slot, outcome) values (p_slot, v_outcome);
  return v_outcome;
end
$fn$;

commit;

\echo 'Fixture ready: 200 users, 1 published event with capacity 1, results table empty.'
