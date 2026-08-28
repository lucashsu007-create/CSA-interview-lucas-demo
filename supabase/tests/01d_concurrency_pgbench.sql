-- pgbench transaction body for the capacity concurrency test.
--
-- Not a psql script. Run it through pgbench, e.g.
--   pgbench "$DB_URL" -n -c 40 -j 8 -t 5 -f supabase/tests/01d_concurrency_pgbench.sql
-- or simply use supabase/tests/run_concurrency_test.sh.
--
-- :client_id is a pgbench built-in and is 0-based, so each client drives a
-- distinct fictional user and the attempts stay attributable.
\set slot :client_id
select public.csa_test_try_register(:slot);
