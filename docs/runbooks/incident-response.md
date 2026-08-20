# Runbook — Incident response

## Emails not arriving
1. `curl -s localhost:3001/api/v1/metrics | grep vms_email` — a growing
   `vms_email_outbox_backlog` means delivery is stuck, not lost.
2. `docker compose logs worker --tail 50` — the worker dispatches; ECONNREFUSED
   means n8n is down. `docker compose restart n8n`.
3. `node scripts/n8n-drift-check.mjs` — an INACTIVE workflow silently drops mail.
4. The outbox sweeper retries every stalled row automatically once the path is
   back. Nothing needs re-sending by hand; watch the backlog drain.

## API down / unhealthy
1. `curl -s localhost:3001/api/v1/health/ready` — names the failing dependency.
2. `docker compose ps` then `docker compose logs api --tail 100`.
3. A crash loop after a code change: `docker compose exec -T api npx tsc --noEmit`
   surfaces the compile error the watcher is stuck on.

## Suspected account compromise
1. Deactivate: `PATCH /volunteers/:id {"isActive": false}` (admin token) — this
   blocks login; refresh-token reuse detection already revokes stolen sessions.
2. Audit what the account touched: `GET /audit-logs?actorId=<user id>`.
3. If personal data must go: `POST /volunteers/:id/erase` (irreversible).

## Database emergency
See restore.md. RPO is the age of the last nightly backup; the recorded
restore time at demo scale is under 10 seconds.
