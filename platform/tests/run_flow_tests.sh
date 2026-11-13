#!/usr/bin/env bash
# End-to-end billing flow test (real Postgres + fake OMPAY). Needs deno.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=postgres tests/run_flow_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -qc "drop database if exists vyro_test" -c "create database vyro_test" >/dev/null 2>&1
psql -d vyro_test -q -v ON_ERROR_STOP=1 -f tests/supabase_shim.sql
for m in supabase/migrations/*.sql; do
  case "$m" in *storage*) continue;; esac
  psql -d vyro_test -q -v ON_ERROR_STOP=1 -f "$m"
done
"${DENO:-deno}" test --allow-net --allow-env --allow-read --allow-sys tests/billing_flow_test.ts
