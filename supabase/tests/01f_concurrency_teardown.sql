-- =============================================================================
-- CSA Digital Hub — removes every committed fixture left by 01a/01b and by
-- run_concurrency_test.sh. Safe to run at any time; touches only ids and email
-- addresses owned by the test suite.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

drop function if exists public.csa_test_try_register(int);
drop table    if exists public.csa_test_concurrency_results;

delete from public.scan_attempts where ticket_code in (
  select ticket_code from public.registrations r
  join public.users u on u.id = r.user_id
  where u.email like '%@csa-test.local'
);

delete from public.events where id in (
  '0c0ffee0-0000-4000-8000-000000000001',
  '0c0ffee0-0000-4000-8000-000000000002'
);

delete from public.users where email like '%@csa-test.local';

commit;

\echo 'Test fixtures removed.'
