#!/bin/bash
# =============================================================================
# Postgres first-boot bootstrap.
# Runs once, when the data volume is empty. Applies every migration in order,
# then reference data, then (optionally) demo data.
#
# Re-running against an existing volume: use `npm run db:migrate` from the API,
# or `docker compose down -v` to start from scratch.
# =============================================================================
set -euo pipefail

PSQL="psql --username=$POSTGRES_USER --dbname=$POSTGRES_DB -v ON_ERROR_STOP=1 --quiet"

# n8n keeps its own workflow/credential/execution state in a separate database
# on this same server. Created here so the n8n container can start cleanly.
N8N_DB_NAME="${N8N_DB_NAME:-n8n}"
echo "==> Creating n8n database ($N8N_DB_NAME)"
psql --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" -v ON_ERROR_STOP=1 --quiet \
  --command="CREATE DATABASE \"$N8N_DB_NAME\";" || echo "    (already exists)"

echo "==> Creating schema_migrations ledger"
$PSQL <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(20)  PRIMARY KEY,
  filename    VARCHAR(200) NOT NULL,
  checksum    CHAR(64),
  applied_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
SQL

echo "==> Applying migrations"
for file in /database/migrations/V*.sql; do
  [ -e "$file" ] || continue
  base=$(basename "$file")
  version="${base%%__*}"
  checksum=$(sha256sum "$file" | cut -d' ' -f1)

  echo "    - $base"
  $PSQL --file="$file"
  $PSQL --command="INSERT INTO schema_migrations (version, filename, checksum)
                   VALUES ('$version', '$base', '$checksum')
                   ON CONFLICT (version) DO NOTHING;"
done

echo "==> Applying reference data"
for file in /database/seeds/S001__*.sql; do
  [ -e "$file" ] || continue
  echo "    - $(basename "$file")"
  $PSQL --file="$file"
done

# Demo seeds are every S*.sql except the S001 reference set.
if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "==> Applying demo data (SEED_DEMO_DATA=true)"
  for file in /database/seeds/S*.sql; do
    [ -e "$file" ] || continue
    base=$(basename "$file")
    case "$base" in
      S001__*) continue ;;
    esac
    echo "    - $base"
    $PSQL --file="$file"
  done
else
  echo "==> Skipping demo data (set SEED_DEMO_DATA=true to load it)"
fi

echo "==> Database bootstrap complete"
