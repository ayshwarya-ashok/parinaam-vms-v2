#!/usr/bin/env bash
# Parinaam VMS v2 — VM first-time setup (A/B alongside v1; v1 untouched).
# Everything binds to 127.0.0.1; the only public exposure will be the host
# Caddy's vms.parinaam.ai site block, added separately once DNS exists.
set -euo pipefail

APP_DIR=/opt/parinaam-vms-v2
BUNDLE=${1:-/home/volunteer/vms-v2.bundle}

echo "==> 1/4 checkout"
if [ ! -d "$APP_DIR/.git" ]; then
  sudo mkdir -p "$APP_DIR"
  sudo chown volunteer:volunteer "$APP_DIR"
  git clone -b feature/ayshwarya "$BUNDLE" "$APP_DIR"
else
  cd "$APP_DIR"
  git fetch "$BUNDLE" feature/ayshwarya
  git checkout feature/ayshwarya
  git reset --hard FETCH_HEAD
fi
cd "$APP_DIR"
git log --oneline -1

echo "==> 2/4 .env (fresh secrets, loopback-bound non-colliding ports)"
if [ -f .env ]; then
  echo "    .env already exists — leaving it alone"
else
  gen() { openssl rand -hex 32; }
  PGPW=$(gen)
  cat > .env <<ENV
# Generated $(date -Is) by vm-setup.sh — VM deployment (A/B alongside v1).
# Every port is loopback-bound: the host Caddy is the only public door.

# ---- Database ----------------------------------------------------------------
POSTGRES_USER=parinaam
POSTGRES_PASSWORD=$PGPW
POSTGRES_DB=parinaam_vms
POSTGRES_PORT=127.0.0.1:5433
N8N_DB_NAME=n8n
SEED_DEMO_DATA=true

# ---- Ports (all loopback; shifted off v1/shared-infra ports) ------------------
API_PORT=127.0.0.1:3001
WEB_PORT=127.0.0.1:5174
REDIS_PORT=127.0.0.1:6380
ADMINER_PORT=127.0.0.1:8082
N8N_PORT=127.0.0.1:5679
MAILPIT_SMTP_PORT=127.0.0.1:1026
MAILPIT_UI_PORT=127.0.0.1:8026
CADDY_PORT=127.0.0.1:8090

# ---- Runtime ------------------------------------------------------------------
NODE_ENV=development
BUILD_TARGET=development
PUBLIC_WEB_URL=https://vms.parinaam.ai
VITE_API_BASE_URL=/api/v1
CORS_ORIGINS=https://vms.parinaam.ai,http://localhost:8090,http://127.0.0.1:8090

# ---- Secrets ------------------------------------------------------------------
JWT_ACCESS_SECRET=$(gen)
JWT_REFRESH_SECRET=$(gen)
LINK_TOKEN_SECRET=$(gen)
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
VMS_WEBHOOK_SECRET=$(gen)
N8N_ENCRYPTION_KEY=$(gen)

# ---- n8n (loopback-only editor; reach it over an SSH tunnel) -------------------
N8N_HOST=localhost
N8N_WEBHOOK_URL=http://localhost:5679/
N8N_USER_MANAGEMENT_DISABLED=true

# ---- Mail (Mailpit sandbox during A/B — no real volunteer gets emailed) --------
MAIL_FROM_NAME=Parinaam Foundation
MAIL_FROM_EMAIL=noreply@parinaam.org

# ---- API addressing -------------------------------------------------------------
INTERNAL_API_URL=http://api:3000/api/v1
PUBLIC_API_URL=https://vms.parinaam.ai/api/v1

# ---- Storage --------------------------------------------------------------------
UPLOAD_DIR=/app/uploads
MAX_UPLOAD_MB=25
ENV
  chmod 600 .env
  echo "    .env written"
fi

echo "==> 3/4 build + start (first boot runs V001-V021 and the seeds)"
docker compose --profile app up -d --build

echo "==> 4/4 waiting for the API to be ready"
for i in $(seq 1 60); do
  if curl -sf http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1; then
    echo "    API is up"
    break
  fi
  sleep 5
done
curl -s http://127.0.0.1:3001/api/v1/health/ready || true
echo
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
