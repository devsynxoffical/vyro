#!/usr/bin/env bash
# Runs the schema, security and billing tests against a throwaway database.
# Usage: PGHOST=/tmp PGPORT=5433 PGUSER=postgres tests/run_db_tests.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=vyro_test
psql -qc "drop database if exists $DB" -c "create database $DB"
for t in rls_test billing_test; do
  psql -qc "drop database if exists $DB" -c "create database $DB" >/dev/null
  psql -d $DB -q -v ON_ERROR_STOP=1 -f tests/supabase_shim.sql
  for m in supabase/migrations/*.sql; do
    case "$m" in *storage*) continue;; esac   # needs Supabase's storage schema
    psql -d $DB -q -v ON_ERROR_STOP=1 -f "$m"
  done
  psql -d $DB -q -v ON_ERROR_STOP=1 -At -f "tests/$t.sql" | tail -1
done
