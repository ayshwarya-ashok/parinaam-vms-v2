#!/usr/bin/env bash
#
# Decommission the v1 (parinaam-vms) application layer on the shared VM, so
# v2 (parinaam-vms-v2) can be deployed onto a clean box.
#
# Run ON the VM (volunteer@164.52.223.64), as the `volunteer` user:
#
#   scp scripts/decommission-v1-vm.sh volunteer@164.52.223.64:~
#   ssh -i parinaam-volunteer -o IdentitiesOnly=yes volunteer@164.52.223.64
#   chmod +x decommission-v1-vm.sh && ./decommission-v1-vm.sh
#
# ---------------------------------------------------------------------------
# Scope — decided deliberately, do not widen it without re-checking this box
# ---------------------------------------------------------------------------
# The VM runs TWO layers that must not be confused:
#
#   /opt/parinam       Pre-existing shared infra: PostgreSQL 16, n8n, NocoDB,
#                       Caddy. Parinaam provisioned this before parinaam-vms
#                       existed. It is not in either repo, other things may
#                       come to depend on it, and it is NOT what this script
#                       touches — its containers keep running throughout.
#
#   /opt/parinaam-vms  v1's own layer: the api + mailpit containers (deploy/
#                       docker-compose.yml), joined to /opt/parinam's network,
#                       plus the `appdb` database and the "Parinaam VMS *"
#                       workflows/credentials v1 imported into the SHARED n8n.
#
# This script destroys the second layer only:
#   - stops and removes the v1 api + mailpit containers, images, and the
#     mailpit volume (mailpit is v1's own container, not shared infra)
#   - drops and recreates `appdb` empty, back to the state the box's own
#     bootstrap left it in (deploy/bootstrap-db.sql), so it's ready for reuse
#     or for a future `DROP DATABASE` if nothing ends up wanting it
#   - deletes the "Parinaam VMS *" workflows and credentials v1 left inside
#     the SHARED n8n container, leaving that n8n instance itself running
#
# v2 does not need any of this to deploy — it brings its own Postgres, n8n,
# Redis and Mailpit as one self-contained compose stack on non-colliding
# ports (see docs/runbooks/deploy.md). This script exists to leave the box
# clean, not because v2 depends on it.
#
# Everything destructive is backed up first. Nothing destructive runs without
# an explicit typed confirmation.

set -euo pipefail

APP_DIR=${APP_DIR:-/opt/parinaam-vms}
PG_CONTAINER=${PG_CONTAINER:-parinam-postgres}
N8N_CONTAINER=${N8N_CONTAINER:-parinam-n8n}
DB_NAME=${DB_NAME:-appdb}
DB_APP_USER=${DB_APP_USER:-app}
WORKFLOW_PREFIX=${WORKFLOW_PREFIX:-"Parinaam VMS"}

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=${BACKUP_DIR:-/opt/backups/parinaam-vms-v1-decommission/$STAMP}

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
warn() { printf '    \033[33mwarning: %s\033[0m\n' "$1"; }
die()  { printf '\n\033[31mFAILED: %s\033[0m\n\n' "$1" >&2; exit 1; }

command -v docker >/dev/null || die "docker not found — run this on the VM, not locally."
docker info >/dev/null 2>&1 || die "docker is not reachable (permissions? daemon down?)."

container_exists() { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }
container_running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

# ---------------------------------------------------------------------------
step "0/5  What this will do"
# ---------------------------------------------------------------------------
cat <<BANNER
  Backing up, then destroying:
    - v1 containers/volumes under $APP_DIR (api, mailpit) — via docker compose down -v
    - the "$DB_NAME" database inside $PG_CONTAINER — dropped and recreated empty
    - workflows/credentials named "$WORKFLOW_PREFIX *" inside $N8N_CONTAINER

  Left running, untouched:
    - $PG_CONTAINER, $N8N_CONTAINER, NocoDB, Caddy — the shared /opt/parinam stack
    - every other database and every other n8n workflow/credential

  Backups land in: $BACKUP_DIR
BANNER

# ---------------------------------------------------------------------------
step "1/5  Backing up appdb (roles + data)"
# ---------------------------------------------------------------------------
mkdir -p "$BACKUP_DIR"

if container_running "$PG_CONTAINER"; then
  DUMP="$BACKUP_DIR/$DB_NAME.dump"
  if docker exec "$PG_CONTAINER" psql -U postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    docker exec "$PG_CONTAINER" pg_dump -U postgres -Fc "$DB_NAME" > "$DUMP" \
      || die "pg_dump of $DB_NAME failed — stopping before anything is touched."
    printf '    %s (%s)\n' "$DUMP" "$(du -h "$DUMP" | cut -f1)"
  else
    warn "$DB_NAME does not exist on $PG_CONTAINER — nothing to dump, nothing to reset later."
  fi
  # Roles are cluster-scoped; a plain pg_dump would not carry `app`,
  # `nocodb_app` or `n8n_readonly` back if this ever needs restoring.
  docker exec "$PG_CONTAINER" pg_dumpall -U postgres --roles-only > "$BACKUP_DIR/roles.sql"
else
  warn "$PG_CONTAINER is not running — skipping database backup and reset."
fi

# ---------------------------------------------------------------------------
step "2/5  Backing up v1's n8n workflows + credentials"
# ---------------------------------------------------------------------------
WF_BACKUP="$BACKUP_DIR/n8n-workflows.json"
CRED_BACKUP="$BACKUP_DIR/n8n-credentials.json"

if container_running "$N8N_CONTAINER"; then
  docker exec "$N8N_CONTAINER" n8n export:workflow --all --output=/tmp/decommission-workflows.json \
    && docker cp "$N8N_CONTAINER:/tmp/decommission-workflows.json" "$WF_BACKUP" \
    || warn "could not export workflows from $N8N_CONTAINER — nothing will be deleted from it either."

  # Left encrypted (no --decrypted): this file is a paper trail of which
  # credentials existed, not a way to read their secrets back out.
  docker exec "$N8N_CONTAINER" n8n export:credentials --all --output=/tmp/decommission-credentials.json \
    && docker cp "$N8N_CONTAINER:/tmp/decommission-credentials.json" "$CRED_BACKUP" \
    || warn "could not export credentials from $N8N_CONTAINER — nothing will be deleted from it either."

  docker exec "$N8N_CONTAINER" rm -f /tmp/decommission-workflows.json /tmp/decommission-credentials.json 2>/dev/null || true
else
  warn "$N8N_CONTAINER is not running — skipping n8n backup and workflow/credential cleanup."
fi

# ---------------------------------------------------------------------------
step "3/5  Backing up v1's mailpit inbox"
# ---------------------------------------------------------------------------
if container_exists parinaam-vms-mailpit; then
  docker cp parinaam-vms-mailpit:/data/mailpit.db "$BACKUP_DIR/mailpit.db" 2>/dev/null \
    && printf '    %s\n' "$BACKUP_DIR/mailpit.db" \
    || warn "could not copy mailpit.db (container may have no data yet) — continuing."
else
  warn "parinaam-vms-mailpit container not found — nothing to back up."
fi

(cd "$BACKUP_DIR" && find . -type f -exec sha256sum {} \; > SHA256SUMS 2>/dev/null || true)
printf '\n    Backup complete: %s\n' "$BACKUP_DIR"

# ---------------------------------------------------------------------------
step "4/5  Confirm before destroying anything"
# ---------------------------------------------------------------------------
echo
read -r -p "  Type DECOMMISSION V1 to proceed, anything else to abort: " CONFIRM
[ "$CONFIRM" = "DECOMMISSION V1" ] || die "confirmation not given — nothing was touched beyond the backup above."

# ---------------------------------------------------------------------------
step "5/5  Destroying v1's app layer"
# ---------------------------------------------------------------------------

# --- v1 containers, images, and the mailpit volume -------------------------
if [ -f "$APP_DIR/docker-compose.yml" ]; then
  ( cd "$APP_DIR" && docker compose --env-file .env down -v --remove-orphans ) \
    || warn "docker compose down failed in $APP_DIR — check manually with 'docker ps -a'."
else
  warn "$APP_DIR/docker-compose.yml not found — stopping any leftover containers by name instead."
  docker rm -f parinaam-vms-api parinaam-vms-mailpit 2>/dev/null || true
  docker volume rm parinaam-vms_mailpit_data 2>/dev/null || true
fi

IMAGES=$(docker images 'parinaam-vms*' -q | sort -u)
[ -n "$IMAGES" ] && docker rmi $IMAGES 2>/dev/null || true

# The checkout is archived, not deleted — it still holds release.sh's own
# backups/ directory, and this is a reversible step (see house rule: prefer
# rename over delete for anything that might be someone's history).
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "${APP_DIR}.decommissioned-$STAMP"
  printf '    archived %s -> %s\n' "$APP_DIR" "${APP_DIR}.decommissioned-$STAMP"
fi

# --- appdb: drop and recreate empty -----------------------------------------
if container_running "$PG_CONTAINER"; then
  docker exec "$PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
    >/dev/null 2>&1 || true
  docker exec "$PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DB_NAME;" \
    || die "could not drop $DB_NAME — restore from $BACKUP_DIR/$DB_NAME.dump if it was partially touched."
  docker exec "$PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c \
    "CREATE DATABASE $DB_NAME OWNER $DB_APP_USER;"
  # Mirrors deploy/bootstrap-db.sql, so appdb is left exactly as the box's own
  # provisioning would leave a fresh one — ready to reuse, or to drop outright
  # later if nothing claims it.
  docker exec "$PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$DB_NAME" -c \
    "ALTER ROLE $DB_APP_USER CREATEROLE; CREATE EXTENSION IF NOT EXISTS pgcrypto; ALTER SCHEMA public OWNER TO $DB_APP_USER;"
  printf '    %s dropped and recreated empty, owned by %s\n' "$DB_NAME" "$DB_APP_USER"

  # v1-only integration roles (migration 016). Cluster-scoped, so they
  # outlive dropping appdb; safe to drop only if nothing else granted them
  # anything — hence non-fatal.
  for ROLE in nocodb_app n8n_readonly; do
    docker exec "$PG_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS $ROLE;" 2>/dev/null \
      && printf '    dropped role %s\n' "$ROLE" \
      || warn "could not drop role $ROLE (it may still hold grants elsewhere) — leaving it in place."
  done
fi

# --- v1's workflows/credentials out of the shared n8n -----------------------
if container_running "$N8N_CONTAINER" && [ -s "$WF_BACKUP" -o -s "$CRED_BACKUP" ]; then
  command -v python3 >/dev/null || warn "python3 not found on this box — delete the \"$WORKFLOW_PREFIX *\" workflows/credentials by hand in the n8n editor instead."

  if command -v python3 >/dev/null; then
    ids_matching_prefix() {
      python3 - "$1" "$WORKFLOW_PREFIX" <<'PY'
import json, sys
path, prefix = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        items = json.load(f)
except Exception:
    items = []
for item in items:
    if isinstance(item, dict) and str(item.get("name", "")).startswith(prefix):
        print(item.get("id"))
PY
    }

    if [ -s "$WF_BACKUP" ]; then
      for ID in $(ids_matching_prefix "$WF_BACKUP"); do
        docker exec "$N8N_CONTAINER" n8n delete:workflow --id="$ID" \
          && printf '    deleted workflow %s\n' "$ID" \
          || warn "could not delete workflow $ID — remove it by hand in the n8n editor."
      done
    fi

    if [ -s "$CRED_BACKUP" ]; then
      for ID in $(ids_matching_prefix "$CRED_BACKUP"); do
        docker exec "$N8N_CONTAINER" n8n delete:credentials --id="$ID" \
          && printf '    deleted credential %s\n' "$ID" \
          || warn "could not delete credential $ID — remove it by hand in the n8n editor."
      done
    fi
  fi
else
  warn "skipping n8n workflow/credential cleanup — see step 2's warnings above; remove the \"$WORKFLOW_PREFIX *\" entries by hand in the n8n editor."
fi

printf '\n\033[32mv1 decommissioned.\033[0m\n'
cat <<NEXT

  Backups:            $BACKUP_DIR
  Archived checkout:  ${APP_DIR}.decommissioned-$STAMP (if it existed)
  Untouched:          $PG_CONTAINER, $N8N_CONTAINER, NocoDB, Caddy — still running

  Next: deploy v2 per parinaam-vms-v2/docs/runbooks/deploy.md — it brings its
  own Postgres, n8n, Redis and Mailpit as one self-contained stack and does
  not need anything from /opt/parinam.

NEXT
