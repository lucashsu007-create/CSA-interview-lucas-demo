-- CSA Digital Hub — Wave M
-- 1201  Migration tables — contract §16.
--
-- These five tables are the audit trail of an import. Nothing here is member
-- data in its own right: they record where a row came from, what was done to
-- it, and what could not be decided. That record is the difference between a
-- migration and a bulk insert.
--
-- Fictional fixtures only. No CSA system is read by any of this — contract §15.

set search_path = public, extensions, pg_temp;


-- ---------------------------------------------------------------------------
-- import_runs
-- ---------------------------------------------------------------------------
create table if not exists public.import_runs (
  id                      uuid primary key default gen_random_uuid(),
  -- NULL means "the whole estate", which is the normal case: deduplication is
  -- cross-source by nature, so a run that saw one system at a time could not
  -- resolve the duplicates the harness exists for.
  source_system           public.legacy_system,
  mode                    public.import_mode       not null,
  status                  public.import_run_status not null default 'running',
  extract_id              text not null,
  extract_sha256          text not null,
  extract_schema_version  text not null,
  extract_counts          jsonb not null default '{}'::jsonb,
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  accepted_count          int  not null default 0,
  warning_count           int  not null default 0,
  rejected_count          int  not null default 0,
  notes                   text,
  created_at              timestamptz not null default now(),

  constraint import_runs_extract_id_set     check (length(btrim(extract_id)) > 0),
  constraint import_runs_sha256_shape       check (extract_sha256 ~ '^[0-9a-f]{64}$'),
  constraint import_runs_counts_nonneg      check (
    accepted_count >= 0 and warning_count >= 0 and rejected_count >= 0
  ),
  constraint import_runs_counts_is_object   check (jsonb_typeof(extract_counts) = 'object'),
  -- A finished run has a finish time; a running one does not.
  constraint import_runs_finish_consistent  check (
    (status = 'running') = (finished_at is null)
  )
);

comment on table public.import_runs is
  'One execution of one importer against one extract — contract §16.';
comment on column public.import_runs.extract_sha256 is
  'sha256 of the extract file, recorded at extract time. An extract that cannot be '
  're-identified later cannot support a reconciliation later.';
comment on column public.import_runs.extract_counts is
  'Source counts as measured at extract time, BEFORE any transform. Every reconciliation '
  'compares against this. Recomputing it from the transformed set defeats the purpose.';

-- The column began NOT NULL, which forced every run to claim one source and
-- made a whole-estate import label itself with whichever system happened to be
-- named first. An existing database is corrected here.
do $$
begin
  alter table public.import_runs alter column source_system drop not null;
exception when others then
  null;
end
$$;

create index if not exists import_runs_source_started_idx
  on public.import_runs (source_system, started_at desc);


-- ---------------------------------------------------------------------------
-- import_records — one row per source row per run
-- ---------------------------------------------------------------------------
create table if not exists public.import_records (
  id             uuid primary key default gen_random_uuid(),
  import_run_id  uuid not null references public.import_runs (id) on delete cascade,
  source_system  public.legacy_system      not null,
  source_id      text                      not null,
  entity_type    text                      not null,
  disposition    public.import_disposition not null,
  target_id      uuid,
  applied_rules  text[] not null default '{}',
  detail         text,
  created_at     timestamptz not null default now(),

  constraint import_records_source_id_set check (length(btrim(source_id)) > 0),
  constraint import_records_entity_set    check (length(btrim(entity_type)) > 0),
  -- A rejected row landed nowhere, so it must not claim a target.
  --
  -- One direction only, deliberately. The converse does not hold: a dry run
  -- writes the full report and no target rows at all, and a row merged into an
  -- existing person by an approved dedup rule points at the winner rather than
  -- at a row of its own. Requiring a target for every non-rejected record would
  -- make both of those unrepresentable.
  constraint import_records_rejected_has_no_target check (
    disposition <> 'rejected' or target_id is null
  ),
  -- "Every rejection has a documented reason" — §17. Here that is the detail
  -- string; the machine-readable half is the matching quarantine record.
  constraint import_records_rejection_explained check (
    disposition <> 'rejected' or length(btrim(coalesce(detail, ''))) > 0
  ),
  unique (import_run_id, source_system, source_id, entity_type)
);

comment on table public.import_records is
  'The accepted/warning/rejected report, keyed by source id — contract §16. '
  'accepted + warning + rejected equals the source count by construction.';
comment on column public.import_records.applied_rules is
  'Every transform rule applied to this row, in order. A derivation nobody recorded '
  'is a derivation nobody can review.';

-- `create table if not exists` cannot change a constraint on a table that
-- already exists, so the change is applied explicitly too. Both halves are
-- needed: the CREATE TABLE above is what a fresh database gets, and this is
-- what an existing one gets.
do $$
begin
  alter table public.import_records
    drop constraint if exists import_records_target_consistent;

  if not exists (
    select 1 from pg_constraint where conname = 'import_records_rejected_has_no_target'
  ) then
    alter table public.import_records
      add constraint import_records_rejected_has_no_target
      check (disposition <> 'rejected' or target_id is null);
  end if;
end
$$;

create index if not exists import_records_run_disposition_idx
  on public.import_records (import_run_id, disposition);
create index if not exists import_records_source_idx
  on public.import_records (source_system, source_id);


-- ---------------------------------------------------------------------------
-- quarantine_records
-- ---------------------------------------------------------------------------
create table if not exists public.quarantine_records (
  id                  uuid primary key default gen_random_uuid(),
  import_run_id       uuid not null references public.import_runs (id) on delete cascade,
  source_system       public.legacy_system     not null,
  source_id           text                     not null,
  entity_type         text                     not null,
  reason              public.quarantine_reason not null,
  state               public.quarantine_state  not null default 'open',
  payload             jsonb not null default '{}'::jsonb,
  occurred_year       int,
  payment_status      public.payment_status,
  amount_cents        int,
  resolved_by_user_id uuid references public.users (id) on delete set null,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz not null default now(),

  constraint quarantine_source_id_set   check (length(btrim(source_id)) > 0),
  constraint quarantine_entity_set      check (length(btrim(entity_type)) > 0),
  constraint quarantine_payload_object  check (jsonb_typeof(payload) = 'object'),
  constraint quarantine_year_plausible  check (occurred_year is null
                                          or occurred_year between 2000 and 2100),
  constraint quarantine_amount_nonneg   check (amount_cents is null or amount_cents >= 0),
  -- Resolving requires an admin identity AND a reason — CLAUDE.md's override rule.
  constraint quarantine_resolution_complete check (
    state = 'open'
    or (resolved_by_user_id is not null
        and resolved_at is not null
        and length(btrim(coalesce(resolution_note, ''))) > 0)
  ),
  constraint quarantine_open_is_unresolved check (
    state <> 'open'
    or (resolved_by_user_id is null and resolved_at is null and resolution_note is null)
  ),
  unique (import_run_id, source_system, source_id, entity_type)
);

comment on table public.quarantine_records is
  'Records the rules could not resolve — contract §16. Not imported and not dropped. '
  'Quarantine is the ONLY mechanism for explaining a reconciliation difference, which is '
  'why a delta outside it is unexplained by construction (§17).';
comment on column public.quarantine_records.payment_status is
  'Carried so the quarantine set can explain a financial finding, not only a row count.';

create index if not exists quarantine_open_idx
  on public.quarantine_records (state, created_at desc);
create index if not exists quarantine_run_reason_idx
  on public.quarantine_records (import_run_id, entity_type, occurred_year, reason);


-- ---------------------------------------------------------------------------
-- dedup_decisions
-- ---------------------------------------------------------------------------
create table if not exists public.dedup_decisions (
  id                     uuid primary key default gen_random_uuid(),
  import_run_id          uuid not null references public.import_runs (id) on delete cascade,
  entity_type            text not null,
  rule                   text not null,
  winner_source_system   public.legacy_system not null,
  winner_source_id       text not null,
  merged_source_system   public.legacy_system not null,
  merged_source_id       text not null,
  created_at             timestamptz not null default now(),

  constraint dedup_rule_set   check (length(btrim(rule)) > 0),
  constraint dedup_not_self   check (
    winner_source_system <> merged_source_system or winner_source_id <> merged_source_id
  ),
  unique (import_run_id, merged_source_system, merged_source_id, entity_type)
);

comment on table public.dedup_decisions is
  'Both sides of every merge — contract §16. A dedup that records only the winner is '
  'irreversible in practice and unreviewable in principle.';


-- ---------------------------------------------------------------------------
-- legacy_urls — the redirect map, migration plan §14
-- ---------------------------------------------------------------------------
create table if not exists public.legacy_urls (
  id              uuid primary key default gen_random_uuid(),
  legacy_url      text not null unique,
  target_path     text,
  redirect_status int  not null default 301,
  source_system   public.legacy_system not null,
  note            text,
  created_at      timestamptz not null default now(),

  constraint legacy_urls_absolute      check (legacy_url ~ '^https?://'),
  constraint legacy_urls_status_closed check (redirect_status in (301, 410)),
  -- 301 needs somewhere to go; 410 means deliberately retired and must not have one.
  constraint legacy_urls_target_consistent check (
    (redirect_status = 410) = (target_path is null)
  ),
  constraint legacy_urls_target_rooted check (target_path is null or target_path ~ '^/')
);

comment on table public.legacy_urls is
  'Legacy URL to new path map — contract §16, migration plan §14. CSA publishes at least five '
  'brand domains today and the main site logo still points at the legacy csa-eur.nl, so an '
  'unmapped legacy URL is a live failure mode rather than a hypothetical one.';
