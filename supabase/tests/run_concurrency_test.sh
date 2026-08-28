#!/usr/bin/env bash
# =============================================================================
# CSA Digital Hub — N-way concurrency proof for register_for_event().
#
# Fires CLIENTS pgbench clients, each on its own connection, at a single event
# with capacity 1, then asserts that exactly one of them got a place.
#
#   ./supabase/tests/run_concurrency_test.sh
#   CLIENTS=64 TX=10 ./supabase/tests/run_concurrency_test.sh
#   DB_URL="postgresql://..." ./supabase/tests/run_concurrency_test.sh
#
# Requires psql and pgbench on PATH (pgbench ships with the PostgreSQL client
# packages: postgresql-contrib on Debian/Ubuntu, libpq+postgresql on Homebrew).
#
# The default DB_URL is the port `supabase start` publishes locally.
# =============================================================================
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CLIENTS="${CLIENTS:-40}"
TX="${TX:-5}"

if (( CLIENTS < 2 )); then
  echo "CLIENTS must be at least 2 for this to prove anything." >&2
  exit 2
fi
if (( CLIENTS > 200 )); then
  echo "CLIENTS is capped at 200 by the fixture (200 seeded users)." >&2
  exit 2
fi

THREADS=$(( CLIENTS < 8 ? CLIENTS : 8 ))
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for bin in psql pgbench; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing required binary: $bin" >&2; exit 127; }
done

echo "==> fixture"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$DIR/01c_concurrency_fixture.sql"

echo "==> ${CLIENTS} concurrent clients x ${TX} transactions against capacity 1"
pgbench "$DB_URL" \
  --no-vacuum \
  --client="$CLIENTS" \
  --jobs="$THREADS" \
  --transactions="$TX" \
  --file="$DIR/01d_concurrency_pgbench.sql"

echo "==> assertions"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$DIR/01e_concurrency_assert.sql"
