# Runbook — Deploy

## Fresh machine
```sh
cp .env.example .env          # then change every *_SECRET and password
docker compose --profile app up -d --build
```
First boot runs `database/migrations/V001..V010` and (if `SEED_DEMO_DATA=true`)
the demo seeds. Import the n8n workflow once:
```sh
docker compose exec n8n n8n import:credentials --input=/workflows/vms-smtp.credentials.json
docker compose exec n8n n8n import:workflow --input=/workflows/vms-email-dispatch.json
docker compose exec n8n n8n publish:workflow --id=vmsEmailDispatch1
```

## Upgrading a running stack
1. `git pull`
2. Apply any new migration files:
   `MSYS_NO_PATHCONV=1 docker compose exec -T db psql -U parinaam -d parinaam_vms -v ON_ERROR_STOP=1 -f /database/migrations/V0XX__*.sql`
   then insert the row into `schema_migrations`.
3. `docker compose up -d --build api worker web`
4. Run the post-deploy checks below.

## Post-deploy checks (2 minutes)
```sh
curl -s localhost:3001/api/v1/health/ready        # db + redis + n8n all "up"
node scripts/n8n-drift-check.mjs                  # live workflow matches repo
node apps/api/scripts/authz-matrix.mjs            # 132 authz checks
curl -s -X POST localhost:3001/api/v1/internal/test-email \
  -H "Content-Type: application/json" -d '{"to":"deploy.check@example.org"}'
# → message must appear at http://localhost:8026 within ~15 s
```

## Ports (chosen to never collide with the legacy parinaam-vms stack)
API 3001 · Web 5174 · n8n 5679 · Mailpit UI 8026 / SMTP 1026 · Adminer 8082
