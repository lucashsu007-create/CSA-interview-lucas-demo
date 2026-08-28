-- CSA Digital Hub — Wave 0
-- 0500  Ticket code generation and normalisation — contract §6.
--
-- ticket_code is 10 characters of Crockford base32 drawn from a CSPRNG:
-- unique, non-sequential, and NOT derived from any id.
--
-- This file does NOT sign anything. Signing is Ed25519 and happens in the
-- server-side signer (Edge Function / node:crypto) per contract §6 — pgcrypto
-- has HMAC and PGP only. Postgres owns the transaction; the signer owns the key.


-- ---------------------------------------------------------------------------
-- generate_ticket_code()
-- ---------------------------------------------------------------------------
create or replace function public.generate_ticket_code(p_length int default 10)
returns text
language plpgsql
volatile
-- `extensions` is on the path for gen_random_bytes(); both schemas on this path
-- are owned by the database owner and are not writable by anon/authenticated.
set search_path = public, extensions
as $fn$
declare
  -- Crockford base32: 0-9 then A-Z with I, L, O and U removed. Exactly 32 symbols.
  c_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes    bytea;
  v_code     text;
  v_i        int;
  v_tries    int := 0;
begin
  if p_length < 8 or p_length > 32 then
    raise exception 'invalid_ticket_code_length'
      using errcode = 'CSA00',
            detail  = format('Requested length %s is outside 8..32.', p_length);
  end if;

  loop
    -- gen_random_bytes() is pgcrypto's CSPRNG. random() is NOT acceptable here:
    -- it is a seeded PRNG and its output is predictable from prior draws.
    v_bytes := gen_random_bytes(p_length);
    v_code  := '';

    for v_i in 0 .. p_length - 1 loop
      -- 256 mod 32 = 0, so `byte % 32` is a perfectly uniform map onto the
      -- alphabet. There is no modulo bias to reject-sample away.
      v_code := v_code || substr(c_alphabet, (get_byte(v_bytes, v_i) % 32) + 1, 1);
    end loop;

    exit when not exists (
      select 1 from public.registrations r where r.ticket_code = v_code
    );

    -- 10 symbols = 50 bits of entropy; a collision needs ~2^25 live tickets
    -- before it is even worth thinking about. The loop is belt-and-braces, and
    -- the unique constraint is the actual guarantee.
    v_tries := v_tries + 1;
    if v_tries >= 10 then
      raise exception 'ticket_code_exhausted'
        using errcode = 'CSA06',
              detail  = 'Could not find a free ticket code in 10 attempts.';
    end if;
  end loop;

  return v_code;
end
$fn$;

comment on function public.generate_ticket_code(int) is
  '10 chars of Crockford base32 from pgcrypto gen_random_bytes(). 50 bits of entropy, '
  'uniform (256 mod 32 = 0), never derived from an id or a sequence.';


-- ---------------------------------------------------------------------------
-- normalise_ticket_code() — for manual entry at the door.
-- ---------------------------------------------------------------------------
-- Crockford base32 is defined to be case-insensitive on input, to treat I, i, L
-- and l as 1 and O and o as 0, and to allow hyphens as visual separators.
-- U is excluded from the alphabet and has no digit mapping, so it is left alone
-- and will simply fail to match any ticket.
create or replace function public.normalise_ticket_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select translate(upper(btrim(coalesce(p_code, ''))), 'ILO-', '110');
$fn$;

comment on function public.normalise_ticket_code(text) is
  'Crockford base32 input rules: case-insensitive, I/L -> 1, O -> 0, hyphens stripped.';


-- Not part of the client API. register_for_event() reaches it as the owner.
revoke all on function public.generate_ticket_code(int)   from public;
revoke all on function public.normalise_ticket_code(text) from public;
grant execute on function public.normalise_ticket_code(text) to authenticated, service_role;
