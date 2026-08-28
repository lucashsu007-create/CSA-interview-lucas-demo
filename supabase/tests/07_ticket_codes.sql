-- =============================================================================
-- CSA Digital Hub — test 07: ticket codes are unique, non-sequential and opaque
-- =============================================================================
-- Concept prototype. Fictional data only.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/07_ticket_codes.sql
--
-- Contract §6: 10 characters of Crockford base32 from a CSPRNG — unique,
-- non-sequential, and not derived from any id.
--
-- Signing is NOT tested here and is not the database's job: the QR payload is
-- Ed25519-signed by a server-side signer, because pgcrypto has HMAC and PGP
-- only. Postgres owns the transaction; the signer owns the key.
-- =============================================================================

\set ON_ERROR_STOP on

begin;
set local plpgsql.check_asserts = on;

-- ---------------------------------------------------------------------------
-- 1. Shape, alphabet, uniqueness and distribution over a large sample.
-- ---------------------------------------------------------------------------
do $$
declare
  c_n            constant int := 500;
  v_codes        text[];
  v_code         text;
  v_i            int;
  v_distinct     int;
  v_first_chars  int;
  v_sorted       boolean;
begin
  v_codes := array[]::text[];

  for v_i in 1 .. c_n loop
    v_code := public.generate_ticket_code();

    assert length(v_code) = 10,
      format('expected 10 characters, got %s for %s', length(v_code), v_code);
    assert v_code ~ '^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$',
      format('%s is not Crockford base32', v_code);
    -- Crockford excludes I, L, O and U to survive being read aloud and typed in.
    assert v_code !~ '[ILOU]',
      format('%s contains an excluded Crockford character', v_code);

    v_codes := v_codes || v_code;
  end loop;

  select count(distinct c) into v_distinct from unnest(v_codes) as c;
  assert v_distinct = c_n,
    format('expected %s distinct codes, got %s', c_n, v_distinct);

  -- Non-sequential: a counter, a timestamp or a hash of a serial id would all
  -- concentrate the leading character. A CSPRNG spreads it over the alphabet.
  select count(distinct left(c, 1)) into v_first_chars from unnest(v_codes) as c;
  assert v_first_chars >= 24,
    format('only %s distinct leading characters in %s codes — this does not look random',
           v_first_chars, c_n);

  -- ... and successive codes are not ordered.
  select v_codes = (select array_agg(c order by c) from unnest(v_codes) as c) into v_sorted;
  assert not v_sorted, 'codes were generated in sorted order — that is a counter, not a CSPRNG';

  raise notice 'PASS 07.1  % codes: all 10 chars, Crockford-clean, distinct, % distinct leading chars',
    c_n, v_first_chars;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The database refuses a malformed code even on a direct insert.
--    The generator is one guarantee; the CHECK constraint is the other.
-- ---------------------------------------------------------------------------
insert into public.users (id, email, full_name, role) values
  ('a7000000-0000-4000-8000-000000000001', 'ticket-a@csa-test.local', 'Ticket Tester A', 'attendee'),
  ('a7000000-0000-4000-8000-000000000002', 'ticket-b@csa-test.local', 'Ticket Tester B', 'attendee');

insert into public.events (
  id, title, description, category, location,
  starts_at, registration_deadline_at,
  capacity, price_member_cents, price_public_cents, status
) values (
  'a7000000-0000-4000-8000-00000000e001',
  'Ticket code test', 'Fictional.', 'educational', 'Rotterdam (fictional venue)',
  now() + interval '5 days', now() + interval '4 days', 10, 0, 0, 'published'
);

do $$
declare
  v_case  record;
  v_state text;
  v_ok    boolean;
begin
  for v_case in
    select * from (values
      ('too short',        'ABC123'),
      ('too long',         'ABCDEFGHJKM'),
      ('lower case',       'abcdefghjk'),
      ('excluded letter I','ABCDEFGHIJ'),
      ('excluded letter O','ABCDEFGHJO'),
      ('excluded letter U','ABCDEFGHJU'),
      ('punctuation',      'ABCDE-GHJK')
    ) as t(label, code)
  loop
    v_ok := false;
    begin
      insert into public.registrations (event_id, user_id, ticket_code, price_paid_cents, payment_status)
      values ('a7000000-0000-4000-8000-00000000e001',
              'a7000000-0000-4000-8000-000000000001',
              v_case.code, 0, 'paid');
    exception when check_violation then
      v_ok := true;
      get stacked diagnostics v_state = constraint_name;
    end;

    assert v_ok, format('%s: ticket_code %L should have been rejected', v_case.label, v_case.code);
    assert v_state = 'registrations_ticket_code_shape',
      format('%s: rejected by %s rather than the shape check', v_case.label, v_state);
  end loop;

  raise notice 'PASS 07.2  malformed ticket codes rejected by registrations_ticket_code_shape';
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Duplicate codes are impossible even on a direct insert.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reg  public.registrations;
  v_ok   boolean := false;
  v_name text;
begin
  select * into v_reg
  from public.register_for_event('a7000000-0000-4000-8000-00000000e001',
                                 'a7000000-0000-4000-8000-000000000001');

  begin
    insert into public.registrations (event_id, user_id, ticket_code, price_paid_cents, payment_status)
    values ('a7000000-0000-4000-8000-00000000e001',
            'a7000000-0000-4000-8000-000000000002',
            v_reg.ticket_code, 0, 'paid');
  exception when unique_violation then
    v_ok := true;
    get stacked diagnostics v_name = constraint_name;
  end;

  assert v_ok, 'a duplicate ticket_code must be impossible';
  assert v_name = 'registrations_ticket_code_key',
    format('expected registrations_ticket_code_key, got %s', v_name);

  raise notice 'PASS 07.3  ticket_code uniqueness enforced by the database';
end
$$;

-- ---------------------------------------------------------------------------
-- 4. One registration per user per event.
-- ---------------------------------------------------------------------------
do $$
declare
  v_ok    boolean := false;
  v_state text;
  v_msg   text;
begin
  begin
    perform public.register_for_event('a7000000-0000-4000-8000-00000000e001',
                                      'a7000000-0000-4000-8000-000000000001');
  exception when others then
    v_ok := true;
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;

  assert v_ok, 'a second registration for the same event must be refused';
  assert v_state = 'CSA05', format('expected SQLSTATE CSA05, got %s', v_state);
  assert v_msg = 'already_registered', format('expected already_registered, got %s', v_msg);

  raise notice 'PASS 07.4  duplicate registration -> already_registered (CSA05)';
end
$$;

rollback;

\echo '07_ticket_codes.sql: OK'
