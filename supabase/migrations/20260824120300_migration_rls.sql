-- CSA Digital Hub — Wave M
-- 1203  Privileges and RLS for the migration tables.
--
-- The whole harness is admin-only. An import run names the source, the counts
-- and every row that failed to resolve; a quarantine payload holds whatever the
-- legacy record contained. Neither is member-facing, and staff have no reason
-- to read either — the door scanner does not migrate anything.
--
-- legacy_urls is the one exception: it is a public redirect map, and the web
-- surface has to read it without a session.

set search_path = public, extensions, pg_temp;

alter table public.import_runs        enable row level security;
alter table public.import_records     enable row level security;
alter table public.quarantine_records enable row level security;
alter table public.dedup_decisions    enable row level security;
alter table public.legacy_urls        enable row level security;


-- ---------------------------------------------------------------------------
-- import_runs, import_records, dedup_decisions — admin read, no client writes
-- ---------------------------------------------------------------------------
-- Writes belong to the importer, which runs as the owner/service role. No
-- client role gets INSERT here for the same reason no client role can INSERT a
-- registration: the audit trail must not be forgeable from a session.
do $$
declare
  t text;
begin
  foreach t in array array['import_runs', 'import_records', 'dedup_decisions']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read_admin', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      t || '_read_admin', t);
  end loop;
end
$$;


-- ---------------------------------------------------------------------------
-- quarantine_records — admin reads, and admin resolves
-- ---------------------------------------------------------------------------
revoke all    on public.quarantine_records from anon, authenticated;
grant  select on public.quarantine_records to authenticated;
grant  update on public.quarantine_records to authenticated;  -- gated to admin below

drop policy if exists quarantine_read_admin on public.quarantine_records;
create policy quarantine_read_admin on public.quarantine_records
  for select to authenticated
  using (public.is_admin());

-- Resolution is an UPDATE and nothing else: an admin may close a quarantined
-- record, never insert one, and never delete the evidence that it existed.
drop policy if exists quarantine_resolve_admin on public.quarantine_records;
create policy quarantine_resolve_admin on public.quarantine_records
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin() and resolved_by_user_id = public.current_app_user_id());

comment on policy quarantine_resolve_admin on public.quarantine_records is
  'An admin resolves in their own name. The WITH CHECK pins resolved_by_user_id to the '
  'caller so a resolution cannot be attributed to someone else; the table CHECK already '
  'requires a note. Manual overrides need an identity and a reason — CLAUDE.md.';


-- ---------------------------------------------------------------------------
-- legacy_urls — public read
-- ---------------------------------------------------------------------------
revoke all    on public.legacy_urls from anon, authenticated;
grant  select on public.legacy_urls to anon, authenticated;
grant  insert, update, delete on public.legacy_urls to authenticated;  -- gated to admin below

drop policy if exists legacy_urls_read_all on public.legacy_urls;
create policy legacy_urls_read_all on public.legacy_urls
  for select to anon, authenticated
  using (true);

drop policy if exists legacy_urls_write_admin on public.legacy_urls;
create policy legacy_urls_write_admin on public.legacy_urls
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- audit_events — the ONE client write, and it is a narrow one
-- ---------------------------------------------------------------------------
-- Wave 0 grants no client INSERT here at all: every audited write goes through
-- a SECURITY DEFINER function, which inserts as the owner. Resolving a
-- quarantined record is the first audited action that is a plain UPDATE, and
-- the update and its audit row have to commit together — an override recorded
-- in one and not the other looks like an audit trail and is not one.
--
-- Rather than add a third SECURITY DEFINER function, the grant is opened by
-- exactly the width of that need. The WITH CHECK pins three things: the actor
-- is the caller, the entity is a quarantine record, and the action is one of
-- two strings. An admin session therefore cannot write an audit row about
-- anything else, or in anyone else's name.
grant insert on public.audit_events to authenticated;

drop policy if exists audit_events_write_quarantine_resolution on public.audit_events;
create policy audit_events_write_quarantine_resolution on public.audit_events
  for insert to authenticated
  with check (
    public.is_admin()
    and actor_user_id = public.current_app_user_id()
    and entity_type = 'quarantine_records'
    and action in ('quarantine.resolved', 'quarantine.discarded')
  );

comment on policy audit_events_write_quarantine_resolution on public.audit_events is
  'The only client-side INSERT into the audit log, deliberately narrow — contract §21. '
  'Everything else is written by a SECURITY DEFINER function as the owner.';
