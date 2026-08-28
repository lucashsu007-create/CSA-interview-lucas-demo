#!/usr/bin/env bash
# =============================================================================
# CSA Digital Hub — clean checkout to a running system, in one command.
#
#   ./scripts/dev-setup.sh
#
# Concept prototype for the CSA Rotterdam IT Committee application. Fictional
# data only — this script never touches, imports, or produces real member data.
#
# What it does:
#   1. checks psql and friends are on PATH and the server is reachable
#   2. creates the database if it is absent
#   3. applies every migration in supabase/migrations, in filename order
#   4. loads supabase/seed.sql if the database is not already seeded
#   5. prints the connection string and what to run next
#
# Idempotent: running it twice is a no-op on an already-set-up database. It
# never drops anything unless you say --recreate, and it will not silently
# reload the seed over a database you have been demoing against.
#
# Options:
#   --db NAME     database to set up            (default: csa_dev, or $CSA_DB)
#   --reseed      reload supabase/seed.sql over the existing database
#   --recreate    DROP and rebuild the database from scratch (destructive)
#   --force       with --recreate, skip the "does this look like ours?" guard
#   --yes, -y     do not prompt for confirmation (for CI and scripts)
#   --quiet       only print the summary
#   -h, --help    this text
#
# Connection comes from the standard libpq environment: PGHOST, PGPORT, PGUSER,
# PGPASSWORD. With none of them set it finds the local unix socket.
# =============================================================================
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/db.sh"

DB_ARG=""
RESEED=0
RECREATE=0
FORCE=0
ASSUME_YES=0
QUIET=0

usage() { sed -n '3,/^# ===/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' | sed '$d'; }

while (( $# )); do
  case "$1" in
    --db)        DB_ARG="${2:-}"; [[ -n "$DB_ARG" ]] || csa_die "--db needs a name"; shift 2 ;;
    --db=*)      DB_ARG="${1#*=}"; shift ;;
    --reseed)    RESEED=1; shift ;;
    --recreate)  RECREATE=1; shift ;;
    --force)     FORCE=1; shift ;;
    -y|--yes)    ASSUME_YES=1; shift ;;
    --quiet)     QUIET=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)           csa_die "unknown option: $1  (try --help)" ;;
  esac
done

if (( QUIET )); then
  csa_step() { :; }
  csa_note() { :; }
fi

csa_require_bins psql createdb dropdb
csa_resolve_conn "$DB_ARG"
csa_check_server

csa_step "target"
csa_note "host      $PGHOST:$PGPORT"
csa_note "database  $PGDATABASE"
csa_note "server    $(psql -d "$CSA_MAINTENANCE_DB" -tAc 'show server_version' | tr -d '[:space:]')"

# -----------------------------------------------------------------------------
# 1. the database itself
# -----------------------------------------------------------------------------
created=0
if csa_db_exists; then
  if (( RECREATE )); then
    # The one destructive path, and it is opt-in. csa_assert_safe_to_drop is
    # what stops `--db lrl --recreate` from destroying an unrelated database.
    csa_assert_safe_to_drop "$PGDATABASE" "$FORCE"
    if (( ! ASSUME_YES )); then
      if [[ -t 0 ]]; then
        printf '%s' "${C_YELLOW}This DROPS database '$PGDATABASE' at $PGHOST:$PGPORT. Type the database name to confirm: ${C_RESET}"
        read -r reply
        [[ "$reply" == "$PGDATABASE" ]] || csa_die "not confirmed — nothing was changed"
      else
        csa_die "--recreate is destructive and stdin is not a terminal; pass --yes to confirm"
      fi
    fi
    csa_step "recreating database"
    csa_drop_db
    csa_create_db
    created=1
    csa_ok "dropped and recreated $PGDATABASE"
  else
    csa_step "database"
    csa_ok "$PGDATABASE already exists — leaving it alone"
  fi
else
  csa_step "creating database"
  csa_create_db
  created=1
  csa_ok "created $PGDATABASE"
fi

# -----------------------------------------------------------------------------
# 2. schema
# -----------------------------------------------------------------------------
csa_step "applying migrations"
csa_apply_migrations

# -----------------------------------------------------------------------------
# 3. seed
#
# Refusing to reseed by default is the "do not silently destroy" rule applied to
# the data as well as the database: supabase/seed.sql TRUNCATEs every table it
# owns, so an unasked-for reload would throw away registrations made during a
# demo just as surely as a DROP DATABASE would.
# -----------------------------------------------------------------------------
csa_step "seed"
if (( created )) || ! csa_is_seeded; then
  csa_load_seed
elif (( RESEED )); then
  csa_warn "--reseed truncates and reloads every seeded table in '$PGDATABASE'"
  if (( ! ASSUME_YES )) && [[ -t 0 ]]; then
    printf '%s' "${C_YELLOW}Reload the seed over the existing data? [y/N] ${C_RESET}"
    read -r reply
    [[ "$reply" == [yY]* ]] || csa_die "not confirmed — nothing was changed"
  elif (( ! ASSUME_YES )); then
    csa_die "--reseed is destructive and stdin is not a terminal; pass --yes to confirm"
  fi
  csa_load_seed
else
  csa_ok "already seeded — $(csa_row_counts)"
  csa_note "leaving data untouched; use --reseed to reload it, or scripts/reset-db.sh to start over"
fi

# -----------------------------------------------------------------------------
# 4. what to do next
# -----------------------------------------------------------------------------
printf '\n%sReady.%s  %s\n\n' "$C_GREEN$C_BOLD" "$C_RESET" "$(csa_row_counts)"

cat <<NEXT
${C_BOLD}Connection string${C_RESET}
  DATABASE_URL="${CSA_DB_URL}"

${C_BOLD}Next${C_RESET}
  pnpm install                     install workspace dependencies
  pnpm typecheck && pnpm test      the TypeScript gates
  python3 scripts/check-contract.py   contract conformance gate

  pnpm --filter @csa/admin dev     committee portal + JSON API  (http://localhost:3000)
  pnpm --filter @csa/mobile start  Expo member app

${C_BOLD}Database tests${C_RESET} (not part of pnpm test — they need this database)
  for f in supabase/tests/0[1-8]_*.sql; do psql -d ${PGDATABASE} -v ON_ERROR_STOP=1 -f "\$f"; done
  DB_URL="${CSA_DB_URL}" ./supabase/tests/run_concurrency_test.sh

${C_BOLD}Demo identities${C_RESET} (fictional, seeded)
  member@demo.local     attendee with an active membership   -> member pricing
  nonmember@demo.local  attendee, no active membership       -> public pricing
  admin@demo.local      role admin                           -> committee portal
  staff@demo.local      role staff                           -> door scanning
NEXT
