-- CSA Digital Hub — Wave 0
-- 0600  register_for_event() — contract §5.
--
-- The whole capacity guarantee lives in step 1. Everything else is bookkeeping.
--
-- Named failures, raised as distinguishable SQLSTATEs. PostgREST surfaces
-- SQLSTATE as `error.code` and MESSAGE as `error.message`, so clients may map on
-- either. The human sentence goes in DETAIL so the token stays machine-readable.
--
--   CSA00  invalid_arguments
--   CSA01  event_not_published
--   CSA02  registration_closed
--   CSA03  event_full
--   CSA04  event_not_found
--   CSA05  already_registered
--   CSA06  ticket_code_exhausted   (raised by generate_ticket_code)
--   CSA07  user_not_found
--   CSA42  forbidden
--
-- Class "CS" is not used by PostgreSQL, so none of these can collide with a
-- built-in condition.

create or replace function public.register_for_event(
  p_event_id uuid,
  p_user_id  uuid
)
returns public.registrations
language plpgsql
volatile
security definer
-- Locked-down search_path: nothing is resolved from the caller's environment,
-- every object below is schema-qualified.
set search_path = ''
as $fn$
declare
  v_event          public.events;
  v_registration   public.registrations;
  v_places_taken   int;
  v_is_member      boolean;
  v_price_cents    int;
  v_payment_status public.payment_status;
  v_ticket_code    text;
  v_constraint     text;
  v_attempt        int;
begin
  if p_event_id is null or p_user_id is null then
    raise exception 'invalid_arguments'
      using errcode = 'CSA00',
            detail  = 'p_event_id and p_user_id are both required.';
  end if;

  -- Authorisation. This function is SECURITY DEFINER, so it must decide for
  -- itself who may act for whom: a member registers only themselves; staff,
  -- admin and service-role callers may register someone else (desk sign-up).
  if not public.is_privileged_session()
     and not public.is_staff_or_admin()
     and p_user_id is distinct from public.current_app_user_id() then
    raise exception 'forbidden'
      using errcode = 'CSA42',
            detail  = 'A user may only register themselves.';
  end if;

  if not exists (select 1 from public.users u where u.id = p_user_id) then
    raise exception 'user_not_found'
      using errcode = 'CSA07',
            detail  = format('No user %s.', p_user_id);
  end if;

  ---------------------------------------------------------------------------
  -- 1. THE ROW LOCK. This is the line the demo is about.
  ---------------------------------------------------------------------------
  -- FOR UPDATE takes an exclusive row lock on the events row and holds it for
  -- the rest of this transaction. A second caller reaching this statement
  -- BLOCKS here until the first transaction commits or rolls back.
  --
  -- Why blocking is sufficient (READ COMMITTED, the default):
  --   * when the second caller unblocks, the locking clause re-fetches the
  --     newest committed version of the events row, and
  --   * the `count(*)` in step 4 is a separate statement, so under READ
  --     COMMITTED it takes a FRESH snapshot and therefore SEES the first
  --     caller's committed registration.
  -- Without FOR UPDATE both callers read "capacity - 1 places taken" from
  -- snapshots that predate each other's insert, and both insert.
  --
  -- Under REPEATABLE READ or SERIALIZABLE the second transaction instead aborts
  -- with a serialization failure when the lock is released, which is also safe.
  ---------------------------------------------------------------------------
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'CSA04',
            detail  = format('No event %s.', p_event_id);
  end if;

  -- 2. Only a published event accepts registrations.
  if v_event.status <> 'published'::public.event_status then
    raise exception 'event_not_published'
      using errcode = 'CSA01',
            detail  = format('Event %s has status %s.', p_event_id, v_event.status);
  end if;

  -- 3. Deadline.
  if now() > v_event.registration_deadline_at then
    raise exception 'registration_closed'
      using errcode = 'CSA02',
            detail  = format('Registration closed at %s.', v_event.registration_deadline_at);
  end if;

  -- 4. Capacity, counted under the lock taken in step 1.
  select count(*) into v_places_taken
  from public.registrations r
  where r.event_id = p_event_id;

  if v_places_taken >= v_event.capacity then
    raise exception 'event_full'
      using errcode = 'CSA03',
            detail  = format('%s of %s places taken.', v_places_taken, v_event.capacity);
  end if;

  -- 5. Price resolution. Contract §2: membership period, NEVER users.role.
  select exists (
    select 1
    from public.membership_periods mp
    where mp.user_id = p_user_id
      and mp.status  = 'active'::public.membership_status
      and now() between mp.starts_at and mp.expires_at
  ) into v_is_member;

  v_price_cents := case
                     when v_is_member then v_event.price_member_cents
                     else v_event.price_public_cents
                   end;

  -- 7. A zero-price event is paid on issue; there is no payment step.
  v_payment_status := case
                        when v_price_cents = 0 then 'paid'::public.payment_status
                        else 'pending'::public.payment_status
                      end;

  -- 6 + 7. Generate the code and insert.
  -- The retry loop exists only for a ticket_code collision, which the unique
  -- constraint (not the pre-check inside the generator) is what actually
  -- guarantees. The subtransaction created by the EXCEPTION block does NOT
  -- release the events row lock: it was taken before the implicit savepoint.
  for v_attempt in 1 .. 5 loop
    v_ticket_code := public.generate_ticket_code(10);
    begin
      insert into public.registrations (
        event_id, user_id, ticket_code, price_paid_cents, is_member_price, payment_status
      )
      values (
        p_event_id, p_user_id, v_ticket_code, v_price_cents, v_is_member, v_payment_status
      )
      returning * into v_registration;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      if v_constraint = 'registrations_event_user_key' then
        raise exception 'already_registered'
          using errcode = 'CSA05',
                detail  = format('User %s already has a registration for event %s.', p_user_id, p_event_id);
      elsif v_attempt >= 5 then
        raise;
      end if;
      -- otherwise: ticket_code collision, draw again
    end;
  end loop;

  if v_registration.id is null then
    raise exception 'registration_failed'
      using errcode = 'CSA00',
            detail  = 'Registration insert produced no row.';
  end if;

  -- 8. Audit trail.
  insert into public.audit_events (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(public.current_app_user_id(), p_user_id),
    'registration_created',
    'registration',
    v_registration.id,
    jsonb_build_object(
      'event_id',            p_event_id,
      'user_id',             p_user_id,
      'ticket_code',         v_registration.ticket_code,
      'price_paid_cents',    v_price_cents,
      'is_member_price',     v_is_member,
      'payment_status',      v_payment_status,
      'places_taken_before', v_places_taken,
      'capacity',            v_event.capacity
    )
  );

  return v_registration;
end
$fn$;

comment on function public.register_for_event(uuid, uuid) is
  'Capacity-safe registration. Contract §5. The SELECT ... FOR UPDATE on the events '
  'row is what makes the capacity check correct under concurrency — see supabase/tests/01*.';

revoke all on function public.register_for_event(uuid, uuid) from public;
grant execute on function public.register_for_event(uuid, uuid) to authenticated, service_role;
