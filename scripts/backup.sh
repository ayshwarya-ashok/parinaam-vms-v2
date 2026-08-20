#!/usr/bin/env sh
# Nightly backup: BOTH databases (the VMS and n8n's own state) plus uploads.
# n8n's DB matters as much as ours — workflows, credentials and execution
# history live there; restoring the VMS without it leaves email delivery dead.
#
# Usage: ./scripts/backup.sh [output-dir]   (default ./backups)
set -eu

# Git Bash on Windows rewrites /app-style args into C:/... paths; disable that.
# Harmless everywhere else.
export MSYS_NO_PATHCONV=1

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="${1:-./backups}/$STAMP"
mkdir -p "$OUT"

echo "Backing up to $OUT"
docker compose exec -T db pg_dump -U parinaam -d parinaam_vms -Fc > "$OUT/parinaam_vms.dump"
docker compose exec -T db pg_dump -U parinaam -d n8n          -Fc > "$OUT/n8n.dump"
docker compose exec -T api tar -czf - -C /app uploads > "$OUT/uploads.tar.gz" 2>/dev/null || true

# basenames only, so "sha256sum -c" works from inside the backup directory
(cd "$OUT" && sha256sum ./* > SHA256SUMS)
echo "Done:"
ls -la "$OUT"
