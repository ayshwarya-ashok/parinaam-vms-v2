#!/usr/bin/env bash
# Run ON the VM once the vms.parinaam.ai DNS record exists (A -> 164.52.223.64,
# DNS-only/gray cloud). Adds the v2 site block to the host Caddy — validated
# before reload, timestamped backup first, so volunteer.parinaam.ai (v1) can
# never be taken down by a typo here.
set -euo pipefail

HOST=vms.parinaam.ai
CADDYFILE=/etc/caddy/Caddyfile

echo "==> DNS check"
ip=$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)
if [ "$ip" != "164.52.223.64" ]; then
  echo "    $HOST resolves to '${ip:-nothing}' — create the A record first. Aborting."
  exit 1
fi
echo "    $HOST -> $ip"

if grep -q "^$HOST" "$CADDYFILE"; then
  echo "==> site block already present — nothing to do"
  exit 0
fi

echo "==> backup + append site block"
sudo cp "$CADDYFILE" "$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
sudo tee -a "$CADDYFILE" >/dev/null <<'BLOCK'

# Parinaam VMS v2 (A/B alongside v1). One reverse_proxy: the app's own Caddy
# on loopback :8090 is the front door (web + /api/* + /mailpit/*).
vms.parinaam.ai {
	encode gzip
	reverse_proxy 127.0.0.1:8090
}
BLOCK

echo "==> validate BEFORE reload (a bad config must never reach the running Caddy)"
sudo caddy validate --config "$CADDYFILE" --adapter caddyfile

echo "==> graceful reload"
sudo systemctl reload caddy
sleep 5

echo "==> smoke"
curl -sk -o /dev/null -w "https://$HOST -> %{http_code}\n" "https://$HOST/" || true
curl -sk -o /dev/null -w "https://$HOST/api/v1/health -> %{http_code}\n" "https://$HOST/api/v1/health" || true
curl -sk -o /dev/null -w "v1 unaffected: https://volunteer.parinaam.ai -> %{http_code}\n" "https://volunteer.parinaam.ai/register" || true
