-- CSA Digital Hub — Wave 0
-- 0700  check_in_ticket() — contract §5.
--
-- Idempotent check-in with an append-only evidence log, designed for scanners
-- that go offline and sync later.

-- Return shape: the outcome plus enough of the registration for the scanner UI.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'check_in_result'
  ) then
    create type public.check_in_result as (
      outcome         public.check_in_outcome,
      registration_id uuid,
      event_id        uuid,
      user_id         uuid,
      ticket_code     text,
      checked_in_at   timestamptz,
      scan_attempt_id uuid
    );
  end if;
end
$$;


create or replace function public.check_in_ticket(
  p_ticket_code text,
  p_event_id    uuid,
  p_scanned_at  timestamptz default null,
  p_device_id   text        default null
)
returns public.check_in_result
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  -- now() is transaction time and is what the contract clamps against;
  -- clock_timestamp() is the true wall-clock arrival and is what the evidence
  -- log needs, so that a batch of queued scans replayed in one transaction is
  -- still ordered by when each one actually reached the database.
  v_now          timestamptz := now();
  v_received     timestamptz := clock_timestamp();
  v_scanned      timestamptz;
  v_effective    timestamptz;
  v_code         text;
  v_registration public.registrations;
  v_outcome      public.check_in_outcome;
  v_attempt_id   uuid;
  v_result       public.check_in_result;
begin
  -- Contract §6: only staff and admin scan. SECURITY DEFINER means the grant
  -- alone cannot express this (every signed-in user is the same DB role), so
  -- the check has to be here.
  if not public.is_privileged_session() and not public.is_staff_or_admin() then
    raise exception 'forbidden'
      using errcode = 'CSA42',
            detail  = 'check_in_ticket requires role staff or admin.';
  end if;

  if p_ticket_code is null or p_event_id is null then
    raise exception 'invalid_arguments'
      using errcode = 'CSA00',
            detail  = 'p_ticket_code and p_event_id are both required.';
  end if;

  v_code := public.normalise_ticket_code(p_ticket_code);

  -- A scanner that has been offline reports its own clock. Trust it for
  -- ordering, but never let it place a check-in in the future.
  v_scanned   := coalesce(p_scanned_at, v_now);
  v_effective := least(v_scanned, v_now);

  -- Row lock on the ticket. Two scanners hitting the same ticket at the same
  -- instant serialise here, so exactly one of them can see checked_in_at IS
  -- NULL and return 'success'; the other unblocks, re-reads the committed row
  -- and returns 'duplicate'.
  select * into v_registration
  from public.registrations
  where ticket_code = v_code
  for update;

  if not found then
    -- 2. Unknown code.
    v_outcome := 'invalid'::public.check_in_outcome;

  elsif v_registration.event_id <> p_event_id then
    -- 3. Right ticket, wrong door. Never checks anyone in.
    v_outcome := 'wrong_event'::public.check_in_outcome;

  elsif v_registration.checked_in_at is not null then
    -- 4. Already checked in: report the outcome, do not error, do not create a
    --    second check-in.
    v_outcome := 'duplicate'::public.check_in_outcome;

    -- Conflict rule for queued offline scans (contract §5): the canonical
    -- checked_in_at is the EARLIEST reported scan for this ticket.
    --   * a scan reported LATER than the stored time changes nothing — a
    --     late-arriving scan never overwrites an earlier check-in;
    --   * a scan reported EARLIER (an offline queue that syncs after a later
    --     online scan already landed) lowers the stored time to the earliest,
    --     because that is when the person actually walked through the door.
    -- Either way the outcome is 'duplicate' and the row count does not change.
    if v_effective < v_registration.checked_in_at then
      update public.registrations
         set checked_in_at = v_effective
       where id = v_registration.id
      returning * into v_registration;
    end if;

  else
    -- 5. First scan.
    v_outcome := 'success'::public.check_in_outcome;

    update public.registrations
       set checked_in_at = v_effective
     where id = v_registration.id
    returning * into v_registration;
  end if;

  -- 1. Every scan is recorded, whatever the outcome. scanned_at keeps the
  --    scanner's raw claim (not the clamped value) — this table is evidence,
  --    and received_at next to it is what makes the offline story auditable.
  --
  --    Note this is inside the caller's transaction: if the transaction is
  --    rolled back the evidence row goes with it. PostgreSQL has no autonomous
  --    transaction, and this function never raises after this point, so the
  --    only way to lose the row is for the caller to abort the whole call.
  insert into public.scan_attempts (
    ticket_code, event_id, device_id, scanned_at, received_at, outcome
  )
  values (
    v_code, p_event_id, p_device_id, v_scanned, v_received, v_outcome
  )
  returning id into v_attempt_id;

  v_result.outcome         := v_outcome;
  v_result.registration_id := v_registration.id;
  v_result.event_id        := v_registration.event_id;
  v_result.user_id         := v_registration.user_id;
  v_result.ticket_code     := coalesce(v_registration.ticket_code, v_code);
  v_result.checked_in_at   := v_registration.checked_in_at;
  v_result.scan_attempt_id := v_attempt_id;

  return v_result;
end
$fn$;

comment on function public.check_in_ticket(text, uuid, timestamptz, text) is
  'Idempotent check-in. Always writes a scan_attempts row. Duplicates return the '
  'canonical (earliest) checked_in_at rather than an error. Contract §5.';

revoke all on function public.check_in_ticket(text, uuid, timestamptz, text) from public;
grant execute on function public.check_in_ticket(text, uuid, timestamptz, text) to authenticated, service_role;
