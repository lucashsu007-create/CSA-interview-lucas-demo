-- =============================================================================
-- CSA Digital Hub — test 09: provenance, idempotency and the audit trail
-- =============================================================================
-- Concept prototype. Fictional data only. No CSA system is read by any of this.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/09_migration_provenance.sql
--
-- Contract §16 and §18. The claim under test is that the DATABASE enforces the
-- importer's invariants, so that an importer bug is a constraint violation
-- rather than a silently duplicated member. Everything here runs in a
-- transaction and rolls back.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

-- A run to hang the fixtures off. Fictional extract, fictional hash.
insert into public.import_runs
  (id, source_system, mode, status, extract_id, extract_sha256,
   extract_schema_version, extract_counts)
values
  ('c9000000-0000-4000-8000-000000000001', 'mongodb', 'load', 'running',
   '2026-08-24T09:00:00Z/members',
   repeat('a', 64), 'legacy-v3',
   '{"members": {"2024": 3}}'::jsonb);


-- ---------------------------------------------------------------------------
-- 1. (source_system, source_id) is unique — the idempotency key (§18.1)
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean := false;
begin
  insert into public.users (email, full_name, source_system, source_id, import_run_id)
  values ('mig.one@demo.local', 'Fixture One', 'mongodb', 'mongo-oid-001',
          'c9000000-0000-4000-8000-000000000001');

  begin
    -- The same source row seen a second time. A re-run must not duplicate the
    -- person, and the guarantee is the database's, not the importer's promise.
    insert into public.users (email, full_name, source_system, source_id)
    values ('mig.one.again@demo.local', 'Fixture One Again', 'mongodb', 'mongo-oid-001');
  exception when unique_violation then
    v_ok := true;
  end;

  assert v_ok, 'a second import of the same (source_system, source_id) must be refused';

  -- The same source id in a DIFFERENT system is a different row, and must be
  -- allowed: an office-ledger member and a MongoDB member can share a number.
  insert into public.users (email, full_name, source_system, source_id)
  values ('mig.two@demo.local', 'Fixture Two', 'office_ledger', 'mongo-oid-001');

  raise notice 'PASS 09.1  (source_system, source_id) is unique per system';
end
$$;


-- ---------------------------------------------------------------------------
-- 2. Rows this platform created itself carry no provenance, and many may exist
-- ---------------------------------------------------------------------------
do $$
declare
  v_native int;
begin
  -- The partial index is WHERE source_system IS NOT NULL, so natively created
  -- rows are not competing for one NULL slot.
  insert into public.users (email, full_name) values ('mig.native.a@demo.local', 'Native A');
  insert into public.users (email, full_name) values ('mig.native.b@demo.local', 'Native B');

  select count(*) into v_native from public.users where source_system is null;
  assert v_native >= 2, 'natively created rows must not collide on the provenance index';

  raise notice 'PASS 09.2  native rows carry NULL provenance and do not collide';
end
$$;


-- ---------------------------------------------------------------------------
-- 3. Provenance is all-or-nothing
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean := false;
begin
  begin
    -- A source id with no system cannot be traced back to anything.
    insert into public.users (email, full_name, source_id)
    values ('mig.half@demo.local', 'Half Provenance', 'orphan-id-1');
  exception when check_violation then
    v_ok := true;
  end;

  assert v_ok, 'source_id without source_system must be refused';
  raise notice 'PASS 09.3  provenance is all-or-nothing';
end
$$;


-- ---------------------------------------------------------------------------
-- 4. A rejection must be explained, and cannot claim a target row
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean := false;
begin
  begin
    -- "N rows failed" is not a reason — migration plan §17.
    insert into public.import_records
      (import_run_id, source_system, source_id, entity_type, disposition, detail)
    values ('c9000000-0000-4000-8000-000000000001', 'mongodb', 'mongo-oid-900',
            'member', 'rejected', null);
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'a rejected import record with no detail must be refused';

  v_ok := false;
  begin
    insert into public.import_records
      (import_run_id, source_system, source_id, entity_type, disposition, detail, target_id)
    values ('c9000000-0000-4000-8000-000000000001', 'mongodb', 'mongo-oid-901',
            'member', 'rejected', 'no email on the source record',
            'c9000000-0000-4000-8000-0000000000ff');
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'a rejected record must not point at a target row';

  -- ...but an accepted record with NO target is legal, and must stay legal: a
  -- dry run writes the whole report and no target rows, and a row merged into
  -- an existing person points at the winner rather than at a row of its own.
  insert into public.import_records
    (import_run_id, source_system, source_id, entity_type, disposition, detail)
  values ('c9000000-0000-4000-8000-000000000001', 'mongodb', 'mongo-oid-902',
          'member', 'accepted', 'dry run: transformed, not written');

  raise notice 'PASS 09.4  rejections are explained and claim no target row';
end
$$;


-- ---------------------------------------------------------------------------
-- 5. Resolving a quarantined record needs an identity AND a note
-- ---------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_ok    boolean := false;
begin
  insert into public.users (email, full_name, role)
  values ('mig.admin@demo.local', 'Fixture Admin', 'admin')
  returning id into v_admin;

  insert into public.quarantine_records
    (id, import_run_id, source_system, source_id, entity_type, reason,
     payload, occurred_year, payment_status, amount_cents)
  values
    ('c9000000-0000-4000-8000-00000000000a',
     'c9000000-0000-4000-8000-000000000001', 'office_ledger', 'ledger-2024-017',
     'membership', 'ambiguous_duplicate',
     '{"name": "L. Fixture", "paid_at_office": true}'::jsonb,
     2024, 'paid', 1500);

  begin
    -- Resolved, with no account of why. CLAUDE.md: manual overrides require an
    -- admin identity and an audit reason.
    update public.quarantine_records
       set state = 'resolved', resolved_by_user_id = v_admin, resolved_at = now()
     where id = 'c9000000-0000-4000-8000-00000000000a';
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'resolving without a note must be refused';

  v_ok := false;
  begin
    update public.quarantine_records
       set state = 'resolved', resolved_at = now(),
           resolution_note = 'same person as mongo-oid-001, confirmed by hand'
     where id = 'c9000000-0000-4000-8000-00000000000a';
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'resolving with no admin identity must be refused';

  update public.quarantine_records
     set state = 'resolved', resolved_by_user_id = v_admin, resolved_at = now(),
         resolution_note = 'same person as mongo-oid-001, confirmed by hand'
   where id = 'c9000000-0000-4000-8000-00000000000a';

  raise notice 'PASS 09.5  quarantine resolution requires an identity and a reason';
end
$$;


-- ---------------------------------------------------------------------------
-- 6. A quarantined row carries its financial half
-- ---------------------------------------------------------------------------
do $$
declare
  v_cents int;
  v_status public.payment_status;
begin
  select amount_cents, payment_status into v_cents, v_status
    from public.quarantine_records
   where id = 'c9000000-0000-4000-8000-00000000000a';

  -- Without these two columns a quarantine set can explain a row-count
  -- difference and never a revenue one — csa-data-migration, § Transform.
  assert v_cents = 1500, format('expected 1500 cents, got %s', v_cents);
  assert v_status = 'paid', format('expected paid, got %s', v_status);

  raise notice 'PASS 09.6  quarantine carries payment status and amount';
end
$$;


-- ---------------------------------------------------------------------------
-- 7. A dedup decision records both sides, and cannot merge a row into itself
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean := false;
begin
  insert into public.dedup_decisions
    (import_run_id, entity_type, rule,
     winner_source_system, winner_source_id, merged_source_system, merged_source_id)
  values
    ('c9000000-0000-4000-8000-000000000001', 'member',
     'email_exact_lowercased_then_earliest_created',
     'mongodb', 'mongo-oid-001', 'office_ledger', 'ledger-2024-017');

  begin
    insert into public.dedup_decisions
      (import_run_id, entity_type, rule,
       winner_source_system, winner_source_id, merged_source_system, merged_source_id)
    values
      ('c9000000-0000-4000-8000-000000000001', 'member', 'self_merge',
       'mongodb', 'mongo-oid-002', 'mongodb', 'mongo-oid-002');
  exception when check_violation then
    v_ok := true;
  end;

  assert v_ok, 'a record merged into itself must be refused';
  raise notice 'PASS 09.7  dedup decisions record both sides';
end
$$;


-- ---------------------------------------------------------------------------
-- 8. The redirect map: 301 needs a target, 410 must not have one
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok boolean := false;
begin
  insert into public.legacy_urls (legacy_url, target_path, redirect_status, source_system, note)
  values ('https://csa-eur.nl/', '/', 301, 'wordpress',
          'the main site logo still points here');

  insert into public.legacy_urls (legacy_url, target_path, redirect_status, source_system, note)
  values ('https://csa-rotterdam.nl/china-in-focus-2013/', null, 410, 'wordpress',
          'retired: superseded by the events archive');

  begin
    insert into public.legacy_urls (legacy_url, target_path, redirect_status, source_system)
    values ('https://csa-rotterdam.nl/orphan/', null, 301, 'wordpress');
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'a 301 with nowhere to go must be refused';

  v_ok := false;
  begin
    insert into public.legacy_urls (legacy_url, target_path, redirect_status, source_system)
    values ('https://csa-rotterdam.nl/gone/', '/events', 410, 'wordpress');
  exception when check_violation then
    v_ok := true;
  end;
  assert v_ok, 'a 410 must not carry a target path';

  raise notice 'PASS 09.8  redirect map: 301 has a target, 410 does not';
end
$$;

-- ---------------------------------------------------------------------------
-- 9. The audit grant is exactly as wide as the resolution flow, and no wider
-- ---------------------------------------------------------------------------
-- Wave 0 gives a client no INSERT on audit_events at all: every audited write
-- goes through a SECURITY DEFINER function. Resolving a quarantined record is
-- the first audited action that is a plain UPDATE, so the grant was opened —
-- and this is the test that it was opened by the width of that need only.
insert into public.users (id, email, full_name, role)
values ('c9000000-0000-4000-8000-0000000000a1', 'mig.rls.admin@demo.local', 'RLS Admin', 'admin'),
       ('c9000000-0000-4000-8000-0000000000a2', 'mig.rls.member@demo.local', 'RLS Member', 'attendee');

set local request.jwt.claims = '{"sub":"c9000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_denied boolean;
begin
  -- The one permitted shape.
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, metadata)
  values ('c9000000-0000-4000-8000-0000000000a1', 'quarantine.resolved', 'quarantine_records',
          'c9000000-0000-4000-8000-00000000000a', '{"note": "checked by hand"}'::jsonb);

  -- An audit row about anything else is refused, so an admin session cannot
  -- write arbitrary history through this grant.
  v_denied := false;
  begin
    insert into public.audit_events (actor_user_id, action, entity_type, entity_id)
    values ('c9000000-0000-4000-8000-0000000000a1', 'event.cancelled', 'event',
            'c9000000-0000-4000-8000-00000000000b');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  assert v_denied, 'an audit row about another entity type must be refused';

  -- And it cannot be attributed to someone else.
  v_denied := false;
  begin
    insert into public.audit_events (actor_user_id, action, entity_type, entity_id)
    values ('c9000000-0000-4000-8000-0000000000a2', 'quarantine.resolved', 'quarantine_records',
            'c9000000-0000-4000-8000-00000000000a');
  exception when insufficient_privilege then
    v_denied := true;
  end;
  assert v_denied, 'an audit row in another user''s name must be refused';

  raise notice 'PASS 09.9  the audit grant is narrow: this action, this entity, this actor';
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- 10. A non-admin sees no migration data and can resolve nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"c9000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
set local role authenticated;

do $$
declare
  v_runs    int;
  v_quar    int;
  v_updated int;
begin
  select count(*) into v_runs from public.import_runs;
  select count(*) into v_quar from public.quarantine_records;

  -- Not an error, and not a partial view: an attendee sees nothing here at all.
  -- The console gates on role as well, and this is why it must — an empty
  -- console is indistinguishable from "no import has run".
  assert v_runs = 0, format('an attendee must see no import runs, saw %s', v_runs);
  assert v_quar = 0, format('an attendee must see no quarantine rows, saw %s', v_quar);

  update public.quarantine_records
     set state = 'discarded',
         resolved_by_user_id = 'c9000000-0000-4000-8000-0000000000a2',
         resolved_at = now(),
         resolution_note = 'not mine to resolve'
   where id = 'c9000000-0000-4000-8000-00000000000a';
  get diagnostics v_updated = row_count;
  assert v_updated = 0, 'an attendee must not be able to resolve a quarantined row';

  raise notice 'PASS 09.10 a non-admin sees no migration data and resolves nothing';
end
$$;

reset role;

rollback;

\echo '09_migration_provenance.sql: OK'
