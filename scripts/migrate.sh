#!/bin/sh
# scripts/migrate.sh — idempotent schema migration runner (TASK-012).
#
# Applies pending database/migrations/*.sql files in filename order against
# $DATABASE_URL, tracking applied files in a `_migrations` ledger table.
# Safe to re-run: applied files are skipped (TEST-005).
#
# Usage:
#   DATABASE_URL="postgres://..." scripts/migrate.sh
#
# Requirements: psql on PATH. In CI the deploy workflow provides DATABASE_URL
# from the GitHub Environment secret (REQ-009).

set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$REPO_ROOT/database/migrations}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is not set" >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql not found on PATH" >&2
  exit 1
fi

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "error: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

# Ledger table: records each applied migration filename.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
create table if not exists _migrations (
  filename  text primary key,
  applied_at timestamptz not null default now()
);
SQL

applied_count=0
skipped_count=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$file" ] || continue
  filename=$(basename "$file")

  already=$(psql "$DATABASE_URL" -tA -c \
    "select 1 from _migrations where filename = '$filename' limit 1")
  if [ "$already" = "1" ]; then
    skipped_count=$((skipped_count + 1))
    continue
  fi

  echo "applying $filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$file"

  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
    "insert into _migrations (filename) values ('$filename')"
  applied_count=$((applied_count + 1))
done

echo "migrations complete: $applied_count applied, $skipped_count already applied"
