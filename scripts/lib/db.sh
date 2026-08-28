#!/usr/bin/env bash
# =============================================================================
# CSA Digital Hub — shared database plumbing for scripts/dev-setup.sh and
# scripts/reset-db.sh.
#
# Concept prototype. Fictional data only.
#
# Sourced, never executed. Everything here is deliberately libpq-native: the
# scripts export PGHOST/PGPORT/PGDATABASE and then call psql/createdb/dropdb
# with no connection arguments at all, so there is exactly one place where a
# connection is decided and no URL is ever re-parsed by hand.
#
# There is no Docker and no Supabase CLI on the development machine this was
# written for, so every path below assumes a plain local PostgreSQL 15+.
# =============================================================================

# --- output ------------------------------------------------------------------
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'
else
  C_RESET=''; C_BOLD=''; C_DIM=''; C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''
fi

csa_step() { printf '%s==>%s %s\n' "$C_BLUE$C_BOLD" "$C_RESET" "$*"; }
csa_ok()   { printf '%s  ok%s  %s\n' "$C_GREEN" "$C_RESET" "$*"; }
csa_note() { printf '%s  ..%s  %s\n' "$C_DIM" "$C_RESET" "$*"; }
csa_warn() { printf '%swarn%s  %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
csa_die()  { printf '\n%serror%s %s\n' "$C_RED$C_BOLD" "$C_RESET" "$*" >&2; exit 1; }

# --- repo root ---------------------------------------------------------------
# scripts/lib/db.sh -> scripts -> repo root
CSA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export CSA_ROOT

# --- prerequisites -----------------------------------------------------------
csa_require_bins() {
  local missing=() bin
  for bin in "$@"; do
    command -v "$bin" >/dev/null 2>&1 || missing+=("$bin")
  done
  if (( ${#missing[@]} )); then
    printf '\n%serror%s missing required command(s): %s\n\n' \
      "$C_RED$C_BOLD" "$C_RESET" "${missing[*]}" >&2
    cat >&2 <<'HINT'
These ship with the PostgreSQL client tools. Install one of:

  Debian / Ubuntu   sudo apt install postgresql postgresql-contrib
  macOS (Homebrew)  brew install postgresql@16
  Linuxbrew         brew install postgresql@16

`pgbench` (needed only by the concurrency proof) is in postgresql-contrib on
Debian/Ubuntu and in the postgresql formula on Homebrew.
HINT
    exit 127
  fi
}

# --- connection --------------------------------------------------------------
# Resolves PGHOST/PGPORT/PGDATABASE once and exports them, so every later psql,
# createdb and dropdb call inherits the same target. Honours anything the caller
# already set: PGHOST=/var/run/postgresql scripts/dev-setup.sh just works.
csa_resolve_conn() {
  local db="${1:-}"

  export PGPORT="${PGPORT:-5432}"

  if [[ -z "${PGHOST:-}" ]]; then
    local dir
    for dir in /tmp /var/run/postgresql /run/postgresql; do
      if [[ -S "$dir/.s.PGSQL.$PGPORT" ]]; then
        PGHOST="$dir"
        break
      fi
    done
    export PGHOST="${PGHOST:-localhost}"
  fi

  # An explicit --db argument beats the environment, which beats the default.
  export PGDATABASE="${db:-${PGDATABASE:-${CSA_DB:-csa_dev}}}"

  # `postgres` is the maintenance database every CREATE/DROP DATABASE connects
  # to, because you cannot drop the database you are connected to.
  CSA_MAINTENANCE_DB="${CSA_MAINTENANCE_DB:-postgres}"

  CSA_DB_URL="$(csa_db_url "$PGDATABASE")"
  export CSA_DB_URL
}

# The connection string to hand to the apps and to run_concurrency_test.sh.
# libpq spells a unix socket as an empty host plus a ?host= query parameter.
csa_db_url() {
  local db="$1" url
  if [[ "$PGHOST" == /* ]]; then
    url="postgresql:///${db}?host=${PGHOST}"
    [[ "$PGPORT" != "5432" ]] && url+="&port=${PGPORT}"
  else
    url="postgresql://${PGHOST}:${PGPORT}/${db}"
  fi
  printf '%s' "$url"
}

csa_check_server() {
  psql -d "$CSA_MAINTENANCE_DB" -tAc 'select 1' >/dev/null 2>&1 && return 0
  printf '\n%serror%s cannot reach PostgreSQL at host=%s port=%s as user=%s\n\n' \
    "$C_RED$C_BOLD" "$C_RESET" "$PGHOST" "$PGPORT" "${PGUSER:-$(id -un)}" >&2
  cat >&2 <<'HINT'
Start the server, or point the scripts at one:

  PGHOST=/var/run/postgresql scripts/dev-setup.sh
  PGHOST=localhost PGPORT=5433 PGUSER=postgres scripts/dev-setup.sh

The scripts use standard libpq environment variables (PGHOST, PGPORT, PGUSER,
PGPASSWORD), so anything psql can reach, they can reach.
HINT
  exit 1
}

# --- database lifecycle ------------------------------------------------------
csa_db_exists() {
  local db="${1:-$PGDATABASE}"
  [[ "$(psql -d "$CSA_MAINTENANCE_DB" -tAc \
        "select 1 from pg_database where datname = '${db//\'/\'\'}'" 2>/dev/null)" == "1" ]]
}

csa_create_db() {
  local db="${1:-$PGDATABASE}"
  createdb -O "$(psql -d "$CSA_MAINTENANCE_DB" -tAc 'select current_user')" "$db" \
    || csa_die "createdb $db failed"
}

# Guard rail. This machine also hosts unrelated databases, and a reset script
# that will drop whatever name it is handed is one typo away from destroying
# one of them. A database is droppable only when it is recognisably ours (it
# has the CSA schema) or has nothing in it to lose.
csa_assert_safe_to_drop() {
  local db="${1:-$PGDATABASE}" forced="${2:-0}"

  case "$db" in
    postgres|template0|template1)
      csa_die "refusing to drop the '$db' system database" ;;
  esac

  csa_db_exists "$db" || return 0

  local signature relations
  signature="$(psql -d "$db" -tAc "
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('users','events','registrations','scan_attempts')" 2>/dev/null || echo 0)"
  relations="$(psql -d "$db" -tAc "
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'" 2>/dev/null || echo 0)"

  # Ours: all four signature tables present. Empty: nothing to lose.
  if [[ "$signature" == "4" || "$relations" == "0" ]]; then
    return 0
  fi

  if [[ "$forced" == "1" ]]; then
    csa_warn "'$db' does not look like a CSA database ($relations public tables, $signature/4 CSA tables) — dropping anyway because --force was given"
    return 0
  fi

  csa_die "refusing to drop '$db': it has $relations public tables but only $signature of the 4 CSA tables, so it is probably not this project's database.
      Pass --force if you are certain, or --db <name> to name the right one."
}

csa_drop_db() {
  local db="${1:-$PGDATABASE}"
  # WITH (FORCE) terminates other sessions; PostgreSQL 13+. Without it a single
  # forgotten psql prompt blocks the whole reset.
  psql -d "$CSA_MAINTENANCE_DB" -v ON_ERROR_STOP=1 -q \
       -c "drop database if exists \"$db\" with (force)" 2>/dev/null && return 0
  psql -d "$CSA_MAINTENANCE_DB" -v ON_ERROR_STOP=1 -q \
       -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${db//\'/\'\'}' and pid <> pg_backend_pid()" >/dev/null
  psql -d "$CSA_MAINTENANCE_DB" -v ON_ERROR_STOP=1 -q \
       -c "drop database if exists \"$db\"" || csa_die "could not drop database $db"
}

# --- schema and data ---------------------------------------------------------
# Every migration is written CREATE ... IF NOT EXISTS / CREATE OR REPLACE, so
# replaying the whole directory over a live database is a no-op. That is what
# makes dev-setup.sh idempotent without it having to track which files it ran.
csa_apply_migrations() {
  local dir="$CSA_ROOT/supabase/migrations" f count=0
  # The migrations are re-runnable by construction, so replaying them emits a
  # wall of "already exists, skipping" NOTICEs that hides real warnings.
  local PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
  export PGOPTIONS
  [[ -d "$dir" ]] || csa_die "no migrations directory at $dir"

  local files=()
  while IFS= read -r f; do files+=("$f"); done < <(find "$dir" -maxdepth 1 -name '*.sql' | sort)
  (( ${#files[@]} )) || csa_die "no .sql migrations found in $dir"

  for f in "${files[@]}"; do
    psql -v ON_ERROR_STOP=1 -q --no-psqlrc -f "$f" >/dev/null \
      || csa_die "migration failed: ${f#"$CSA_ROOT"/}"
    count=$((count + 1))
    csa_note "${f#"$CSA_ROOT"/}"
  done
  csa_ok "$count migrations applied"
}

csa_load_seed() {
  local seed="$CSA_ROOT/supabase/seed.sql"
  local PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
  export PGOPTIONS
  [[ -f "$seed" ]] || csa_die "no seed at $seed"
  psql -v ON_ERROR_STOP=1 -q --no-psqlrc -f "$seed" >/dev/null \
    || csa_die "seed failed: supabase/seed.sql"
  csa_ok "seed loaded — $(csa_row_counts)"
}

csa_row_counts() {
  psql -tAc "
    select format('%s events, %s users, %s registrations, %s partners',
      (select count(*) from public.events),
      (select count(*) from public.users),
      (select count(*) from public.registrations),
      (select count(*) from public.partners))" 2>/dev/null | tr -d '\n'
}

# Seeded means the demo identities are present, not merely that rows exist —
# a database holding only the concurrency fixture is not a demo database.
csa_is_seeded() {
  [[ "$(psql -tAc "
    select count(*) from public.users
    where email in ('member@demo.local','nonmember@demo.local','admin@demo.local','staff@demo.local')" \
    2>/dev/null | tr -d '[:space:]')" == "4" ]]
}

csa_has_schema() {
  [[ "$(psql -tAc "select to_regclass('public.registrations') is not null" 2>/dev/null | tr -d '[:space:]')" == "t" ]]
}
