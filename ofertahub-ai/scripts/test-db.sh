#!/usr/bin/env bash
# Testa as migrações + RLS num PostgreSQL local descartável (sem Supabase).
# Uso: PGHOST=/caminho/socket PGPORT=5432 PGUSER=postgres ./scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/../supabase"
DB="ofertahub_test_$$"
psql -q -c "create database $DB"
trap 'psql -q -c "drop database if exists $DB"' EXIT
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f tests/auth_stub.sql
for f in migrations/*.sql; do psql -q -d "$DB" -v ON_ERROR_STOP=1 -f "$f"; done
psql -q -d "$DB" -v ON_ERROR_STOP=1 -f tests/rls_test.sql
