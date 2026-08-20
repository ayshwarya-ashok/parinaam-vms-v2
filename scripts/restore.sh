#!/usr/bin/env sh
# Restore both databases from a backup directory produced by backup.sh.
#
# Usage: ./scripts/restore.sh <backup-dir> [suffix]
#   Without a suffix, restores OVER the live databases (stop api/worker first!).
#   With a suffix (e.g. "_rehearsal") restores into parinaam_vms<suffix> and
#   n8n<suffix> — the safe way to prove a backup is restorable.
set -eu

# Git Bash on Windows rewrites /app-style args into C:/... paths; disable that.
# Harmless everywhere else.
export MSYS_NO_PATHCONV=1

SRC="$1"
SUFFIX="${2:-}"
VMS_DB="parinaam_vms${SUFFIX}"
N8N_DB="n8n${SUFFIX}"

[ -f "$SRC/parinaam_vms.dump" ] || { echo "No parinaam_vms.dump in $SRC"; exit 1; }
(cd "$SRC" && sha256sum -c SHA256SUMS) || { echo "Checksum mismatch — refusing to restore"; exit 1; }

if [ -z "$SUFFIX" ]; then
  echo "Restoring over LIVE databases in 5s — Ctrl-C to abort."
  sleep 5
fi

docker compose exec -T db psql -U parinaam -d postgres -c "DROP DATABASE IF EXISTS $VMS_DB WITH (FORCE)"
docker compose exec -T db psql -U parinaam -d postgres -c "CREATE DATABASE $VMS_DB"
docker compose exec -T db pg_restore -U parinaam -d "$VMS_DB" --no-owner < "$SRC/parinaam_vms.dump"

docker compose exec -T db psql -U parinaam -d postgres -c "DROP DATABASE IF EXISTS $N8N_DB WITH (FORCE)"
docker compose exec -T db psql -U parinaam -d postgres -c "CREATE DATABASE $N8N_DB"
docker compose exec -T db pg_restore -U parinaam -d "$N8N_DB" --no-owner < "$SRC/n8n.dump"

if [ -f "$SRC/uploads.tar.gz" ] && [ -z "$SUFFIX" ]; then
  docker compose exec -T api sh -c "tar -xzf - -C /app" < "$SRC/uploads.tar.gz"
fi

echo "Restored $VMS_DB and $N8N_DB from $SRC"
