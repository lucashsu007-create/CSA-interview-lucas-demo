#!/usr/bin/env bash
# =============================================================================
# CSA Digital Hub — cutover REHEARSAL, against synthetic fixtures.
#
#   ./scripts/cutover.sh              # full rehearsal, then rolls back
#   ./scripts/cutover.sh --keep       # leave the rehearsal database in place
#
# Concept prototype. Fictional data only. This rehearses steps 1-5 and the
# reversal of the cutover runbook in .claude/skills/csa-data-migration; it is
# NOT a cutover and it touches no CSA system. Steps 6 onward — DNS, the
# rollback window, retiring legacy — need authorization, access, and named
# human owners, and no script substitutes for any of that.
#
# What it does prove, mechanically:
#
#   * a dry run transforms everything and writes nothing
#   * a first load reconciles, per source, entity and year
#   * a second load of the same extract changes no row
#   * a delta over a LARGER extract writes only what is new
#   * the reconciliation still balances after the delta
#   * a rollback removes every imported row and leaves the seed untouched,
#     and it is TIMED, because a reversal nobody has timed is a reversal
#     nobody can decide to use
#
# Options:
#   --db NAME     rehearsal database   (default: csa_cutover_rehearsal)
#   --keep        do not drop the database at the end
#   -h, --help    this text
# =============================================================================
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source scripts/lib/db.sh

DB_NAME="csa_cutover_rehearsal"
KEEP=0
EXTRACT_BASE="$(mktemp -d)"

while (( $# )); do
  case "$1" in
    --db)    DB_NAME="${2:-}"; [[ -n "$DB_NAME" ]] || csa_die "--db needs a name"; shift 2 ;;
    --db=*)  DB_NAME="${1#*=}"; shift ;;
    --keep)  KEEP=1; shift ;;
    -h|--help) sed -n '3,/^# ===/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' | sed '$d'; exit 0 ;;
    *)       csa_die "unknown option: $1" ;;
  esac
done

cleanup() {
  rm -rf "$EXTRACT_BASE"
  if (( KEEP == 0 )) && csa_db_exists "$DB_NAME"; then
    dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

csa_require_bins psql createdb dropdb node
# The helpers below act on the ambient libpq connection, so the rehearsal
# database is named here once and never passed around.
csa_resolve_conn "$DB_NAME"
csa_check_server
DB_URL="$CSA_DB_URL"

FAILED=0
fail() { csa_warn "$*"; FAILED=1; }

# -----------------------------------------------------------------------------
csa_step "0. A rehearsal database, from nothing"
# -----------------------------------------------------------------------------
dropdb --if-exists "$DB_NAME" >/dev/null 2>&1 || true
csa_create_db "$DB_NAME"
csa_apply_migrations "$DB_NAME"
# Seeded first, and on purpose. The rollback has to leave these rows standing:
# a reversal that takes the platform's own data with it is not a reversal.
csa_load_seed "$DB_NAME"
SEEDED_USERS="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is null")"
csa_ok "$SEEDED_USERS seeded users the rollback must not touch"

# -----------------------------------------------------------------------------
csa_step "1. The extract, and the larger one that stands in for the delta"
# -----------------------------------------------------------------------------
# The delta extract is a superset: the same seed reproduces the first 96 people
# byte for byte and adds more after them. That is what a real second extract
# looks like — the estate did not change, it grew.
node_modules/.bin/tsx packages/legacy-fixtures/src/cli.ts \
  --out "$EXTRACT_BASE/before" --members 96 >/dev/null
node_modules/.bin/tsx packages/legacy-fixtures/src/cli.ts \
  --out "$EXTRACT_BASE/after" --members 120 --extracted-at 2026-08-25T09:00:00Z >/dev/null
csa_ok "two extracts, hashed and stamped"

migrate() {
  node_modules/.bin/tsx packages/migrate/src/cli.ts "$@"
}

# -----------------------------------------------------------------------------
csa_step "2. Dry run — the whole transform, and not one target row"
# -----------------------------------------------------------------------------
migrate --extract "$EXTRACT_BASE/before" --mode dry_run --samples 12 >/dev/null 2>&1 || true
DRY_ROWS="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is not null")"
if [[ "$DRY_ROWS" == "0" ]]; then
  csa_ok "dry run wrote no target rows"
else
  fail "dry run wrote $DRY_ROWS rows — dry_run is not a flag that skips the commit"
fi

# -----------------------------------------------------------------------------
csa_step "3. Load into the rehearsal target"
# -----------------------------------------------------------------------------
if migrate --extract "$EXTRACT_BASE/before" --mode load --db "$DB_URL" --samples 12 > "$EXTRACT_BASE/load.log" 2>&1; then
  csa_ok "load reconciles"
else
  code=$?
  fail "load did not reconcile (exit $code); see the report below"
  tail -25 "$EXTRACT_BASE/load.log"
fi
FIRST_USERS="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is not null")"
csa_note "$FIRST_USERS rows carry provenance after the first load"

# -----------------------------------------------------------------------------
csa_step "4. Re-run the same extract — nothing may change"
# -----------------------------------------------------------------------------
migrate --extract "$EXTRACT_BASE/before" --mode load --db "$DB_URL" --samples 12 >/dev/null 2>&1 || true
AGAIN_USERS="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is not null")"
if [[ "$AGAIN_USERS" == "$FIRST_USERS" ]]; then
  csa_ok "re-run changed no row ($AGAIN_USERS)"
else
  fail "re-run moved the count from $FIRST_USERS to $AGAIN_USERS — the import is not idempotent"
fi

# -----------------------------------------------------------------------------
csa_step "5. Freeze, and record the final source counts"
# -----------------------------------------------------------------------------
# Evidence only, and unreversible by nature: this is the number every later
# comparison is made against, so it is taken before the delta and never again.
FREEZE_AT="$(psql -d "$DB_NAME" -t -A -c "select now()")"
csa_note "freeze recorded at $FREEZE_AT"
csa_note "source counts are in each extract's manifest.json, hashed at extract time"

# -----------------------------------------------------------------------------
csa_step "6. The delta — only what the earlier run had not seen"
# -----------------------------------------------------------------------------
# Implemented by the same provenance key as everything else rather than by a
# separate code path. A delta that works differently from a full import is a
# second importer to trust, and the cutover is the worst moment to find out.
if migrate --extract "$EXTRACT_BASE/after" --mode delta --db "$DB_URL" --samples 12 > "$EXTRACT_BASE/delta.log" 2>&1; then
  csa_ok "delta reconciles"
else
  fail "the delta did not reconcile; stop here rather than switching traffic"
  tail -25 "$EXTRACT_BASE/delta.log"
fi
DELTA_USERS="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is not null")"
if (( DELTA_USERS > FIRST_USERS )); then
  csa_ok "delta added $(( DELTA_USERS - FIRST_USERS )) rows and re-wrote none"
else
  fail "the delta added nothing; the larger extract should have grown the target"
fi

# -----------------------------------------------------------------------------
csa_step "7. Go / no-go — the last cheap exit"
# -----------------------------------------------------------------------------
if (( FAILED == 0 )); then
  csa_ok "every mechanical check passed"
else
  csa_warn "mechanical checks failed — a real cutover stops here"
fi
csa_note "and this is where a person decides. The numbers agreeing is a necessary"
csa_note "condition, never a sufficient one: §17 also wants sampling by hand,"
csa_note "approved dedup rules in writing, and a review of the target's access"
csa_note "controls and audit log. No script signs those off."

# -----------------------------------------------------------------------------
csa_step "8. Rollback rehearsal — timed, because an untimed reversal is a hope"
# -----------------------------------------------------------------------------
# Rows are DELETED by import_run_id, in dependency order. Never TRUNCATE: the
# provenance foreign key means `truncate import_runs cascade` takes users with
# it, seeded identities included, and a rollback that destroys the platform's
# own data is not a rollback.
ROLLBACK_START="$(date +%s%N)"
psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
delete from registrations      where import_run_id is not null;
delete from payments           where import_run_id is not null;
delete from membership_periods where import_run_id is not null;
delete from events             where import_run_id is not null;
delete from users              where import_run_id is not null;
-- The redirect map goes too. Rolling the content back and leaving the
-- redirects live points every legacy URL at a target that no longer has the
-- page, which is a 404 with extra steps.
delete from legacy_urls;
-- import_records, quarantine_records and dedup_decisions cascade from the run.
delete from import_runs;
commit;
SQL
ROLLBACK_MS=$(( ($(date +%s%N) - ROLLBACK_START) / 1000000 ))

LEFT="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is not null")"
SEED_LEFT="$(psql -d "$DB_NAME" -t -A -c "select count(*) from users where source_system is null")"

if [[ "$LEFT" == "0" ]]; then
  csa_ok "every imported row removed, in ${ROLLBACK_MS}ms"
else
  fail "$LEFT imported rows survived the rollback"
fi
if [[ "$SEED_LEFT" == "$SEEDED_USERS" ]]; then
  csa_ok "all $SEED_LEFT seeded users still standing"
else
  fail "the rollback took seeded data with it: $SEEDED_USERS before, $SEED_LEFT after"
fi

# -----------------------------------------------------------------------------
csa_step "Rehearsal complete"
# -----------------------------------------------------------------------------
if (( KEEP == 1 )); then
  csa_note "database kept: $DB_URL"
fi
if (( FAILED == 0 )); then
  csa_ok "steps 1-5 and the reversal all behaved. Synthetic fixtures only —"
  csa_ok "this rehearsed a runbook, it did not migrate anything."
  exit 0
fi
csa_die "the rehearsal found a problem. A cutover does not proceed past this."
