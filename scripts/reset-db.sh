#!/usr/bin/env bash
# =============================================================================
# CSA Digital Hub — drop, recreate, migrate, reseed.
#
#   ./scripts/reset-db.sh          # asks for confirmation
#   ./scripts/reset-db.sh --yes    # does not
#
# Concept prototype. Fictional data only.
#
# Run this before a demo. It guarantees the state the demo script assumes:
# the seeded events and identities exactly as supabase/seed.sql defines them,
# no registrations left over from a rehearsal, and no leftovers from the
# capacity-1 concurrency fixture (200 conc-*@csa-test.local users and the
# one-seat event), which the concurrency run creates, commits, and expects to
# create fresh each time.
#
# This is the destructive script. dev-setup.sh is the safe one — it refuses to
# drop anything without --recreate. Everything here is unrecoverable, which is
# why it confirms by default and refuses to run non-interactively without
# --yes, and why it will not drop a database that does not look like ours.
#
# Options:
#   --db NAME       database to reset           (default: csa_dev, or $CSA_DB)
#   --yes, -y       skip the confirmation prompt
#   --force         drop even if the database does not look like a CSA one
#   --no-seed       schema only, no seed data
#   --keep-db       truncate and reload instead of DROP DATABASE (use when you
#                   have no CREATEDB right, e.g. a managed PostgreSQL)
#   -h, --help      this text
#
# Connection comes from the standard libpq environment: PGHOST, PGPORT, PGUSER,
# PGPASSWORD. With none of them set it finds the local unix socket.
# =============================================================================
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/db.sh"

DB_ARG=""
ASSUME_YES=0
FORCE=0
SEED=1
KEEP_DB=0

usage() { sed -n '3,/^# ===/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' | sed '$d'; }

while (( $# )); do
  case "$1" in
    --db)       DB_ARG="${2:-}"; [[ -n "$DB_ARG" ]] || csa_die "--db needs a name"; shift 2 ;;
    --db=*)     DB_ARG="${1#*=}"; shift ;;
    -y|--yes)   ASSUME_YES=1; shift ;;
    --force)    FORCE=1; shift ;;
    --no-seed)  SEED=0; shift ;;
    --keep-db)  KEEP_DB=1; shift ;;
    -h|--help)  usage; exit 0 ;;
    *)          csa_die "unknown option: $1  (try --help)" ;;
  esac
done

csa_require_bins psql createdb dropdb
csa_resolve_conn "$DB_ARG"
csa_check_server

# -----------------------------------------------------------------------------
# confirm
# -----------------------------------------------------------------------------
existed=0
csa_db_exists && existed=1

if (( existed )); then
  csa_assert_safe_to_drop "$PGDATABASE" "$FORCE"
  printf '%sAbout to destroy database%s %s at %s:%s\n' \
    "$C_YELLOW$C_BOLD" "$C_RESET" "$PGDATABASE" "$PGHOST" "$PGPORT"
  printf '  currently holds: %s\n' "$(csa_row_counts)"
  if (( ! ASSUME_YES )); then
    if [[ -t 0 ]]; then
      printf '%s' "${C_YELLOW}Type the database name to confirm: ${C_RESET}"
      read -r reply
      [[ "$reply" == "$PGDATABASE" ]] || csa_die "not confirmed — nothing was changed"
    else
      csa_die "stdin is not a terminal; pass --yes to confirm destroying '$PGDATABASE'"
    fi
  fi
fi

# -----------------------------------------------------------------------------
# drop and recreate
# -----------------------------------------------------------------------------
if (( KEEP_DB )); then
  # No CREATEDB right, or the database is shared: drop the schema instead. This
  # reaches the same end state because every object this project creates lives
  # in public (the two SECURITY DEFINER functions, the composite type, the
  # enums and the tables) and migration 0000 recreates the extensions schema.
  csa_step "dropping schema public in $PGDATABASE"
  psql -v ON_ERROR_STOP=1 -q --no-psqlrc \
       -c 'drop schema if exists public cascade' \
       -c 'create schema public' \
       -c 'grant usage on schema public to public' \
    || csa_die "could not reset schema public"
  csa_ok "schema public recreated"
else
  if (( existed )); then
    csa_step "dropping $PGDATABASE"
    csa_drop_db
    csa_ok "dropped"
  else
    csa_note "$PGDATABASE did not exist"
  fi
  csa_step "creating $PGDATABASE"
  csa_create_db
  csa_ok "created"
fi

# -----------------------------------------------------------------------------
# migrate and seed
# -----------------------------------------------------------------------------
csa_step "applying migrations"
csa_apply_migrations

if (( SEED )); then
  csa_step "loading seed"
  csa_load_seed
else
  csa_note "skipping seed (--no-seed)"
fi

# The concurrency fixture is committed data, not test-transaction data, so it
# would survive a --keep-db reset if the seed did not truncate it away. Assert
# rather than assume: a demo that starts with a stray capacity-1 event and 200
# conc-* users is not the pristine state this script promises.
leftovers="$(psql -tAc "
  select (select count(*) from public.users where email like '%@csa-test.local')
       + (select count(*) from public.events where id in (
            '0c0ffee0-0000-4000-8000-000000000001',
            '0c0ffee0-0000-4000-8000-000000000002'))
       + (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'csa_test_concurrency_results')" \
  2>/dev/null | tr -d '[:space:]')"

if [[ "$leftovers" != "0" ]]; then
  csa_warn "concurrency fixture leftovers still present ($leftovers rows/objects) — run supabase/tests/01f_concurrency_teardown.sql"
else
  csa_ok "no concurrency-fixture leftovers"
fi

printf '\n%sReset.%s  %s\n\n' "$C_GREEN$C_BOLD" "$C_RESET" "$(csa_row_counts)"
cat <<NEXT
  DATABASE_URL="${CSA_DB_URL}"

  DB_URL="${CSA_DB_URL}" ./supabase/tests/run_concurrency_test.sh
NEXT
