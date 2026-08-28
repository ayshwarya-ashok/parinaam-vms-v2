# apps/api — NestJS API + worker

One codebase, one Docker image, two processes: the **api** serves HTTP; the **worker** consumes
the email queue and runs every cron sweep. The `ROLE` env (`api` | `worker` | `all`) decides
which responsibilities a process takes on — queue consumers and sweeps run exactly once because
only the worker registers them.

## Layout

```
src/
  main.ts / worker.ts     entrypoints (dual-stack listen — never bind '0.0.0.0' only)
  app.module.ts           module registry + the global guard order
  config/                 zod-validated env (env.schema.ts) — boot fails on a bad variable
  common/                 guards, decorators, UuidPipe, BusinessException catalog
  database/               TypeORM data source (synchronize: false) + entities/ (40 tables)
  assets/                 parinaam-logo.png (embedded into certificate PDFs)
  modules/
    auth/                 login, atomic register, refresh rotation, argon2id (bcrypt upgrades on login)
    volunteers/           profiles, admin directory, registration review, erasure,
                          welcome-back on reactivation, bulk corporate invites
    programs/             programme → activity → event admin, publish/cancel/complete, coordinators,
                          session phases (ownership, marks, audited overrides), pre-session email sweep
    enrollments/          enroll/waitlist/withdraw — BR-05/06/10/11/17 live here; volunteer browse
    communities/          beneficiary communities — admin CRUD, >=1 per published session
    trainings/            catalog, materials, server-scored quizzes, retake/supersede rules
    attendance/           signed link tokens (BR-13), session record, admin corrections, walk-ins,
                          visit-level records on phased sessions (one per volunteer/phase/day),
                          sponsor thank-you pack on completed sessions
    certificates/         per-programme certificates, pdf-lib renderer, issue/resend/reissue,
                          optional memento note at issue time
    feedback/             per-occurrence ratings, tags, testimonial publishing (BR-16),
                          volunteer photo uploads (EXIF-stripped, owner-guarded)
    analytics/ reports/   dashboard payload; CSV/Excel/PDF exports (incl. the annual calendar);
                          scheduled reports + dispatcher
    notifications/        the transactional outbox, Handlebars templates, n8n client, webhooks
    storage/              local-disk file store + HMAC-signed URLs (/files/signed)
    public/ reference/    unauthenticated impact aggregates; option catalogs for forms
    health/ internal/     liveness/readiness + /metrics (Prometheus); dev-only test endpoints
scripts/
  authz-matrix.mjs        74 endpoints × 3 roles (222 checks) asserted against the LIVE api — run after route changes
  migrate.ts              apply pending migrations against a running database
```

## Conventions that are load-bearing

- **Guard order is authenticate → throttle → authorise** (see `app.module.ts`). Routes are
  secure by default; `@Public()` is the opt-out, `@Roles('admin')` the narrowing.
- **Business rules fail as `BusinessException` with a stable `code`** — the web UI branches on
  codes, never on message text. Add new codes to the catalog mindset: named, specific,
  actionable (`HOURS_REQUIRED`, not a 500).
- **Every email is an outbox row first**, written in the same transaction as the business event
  (`NotificationsService.queueEmail(params, manager)`). Attachment pointers live **on the row**
  so sweep retries keep them.
- **Templates render in the API, not in n8n** — the preview an admin sees is byte-identical to
  the send. New `.hbs` files need an api+worker restart (assets load at boot).
- **Cron sweeps live in the worker** (module-level `ROLE` gating); the report dispatcher is the
  one exception — registered in both so *Run now* works from the API, its cron body no-ops
  outside the worker.
- **UUIDs are validated structurally** (`UuidPipe` / `UUID_PATTERN`), because seed UUIDs are
  version-0 and `ParseUUIDPipe` rejects them.
- **Postgres `DATE` columns arrive as strings** (type parser pinned in the database module) —
  never `new Date(row.date)` a date-only column.
- Multi-parameter raw SQL batches share one params array — every query must **reference all
  placeholders** (see the `ANCHOR` pattern in `analytics.service.ts`) or pg refuses to bind.

## Day-to-day

```bash
docker compose exec api npx tsc --noEmit         # typecheck (do this before committing)
docker compose logs api --tail 50                # pino logs, pretty-printed in dev
node scripts/authz-matrix.mjs                    # from apps/api/ — full authz sweep
curl localhost:3001/api/v1/health/ready          # db + redis + n8n
```

Swagger lives at `http://localhost:3001/api/docs` (the API is also reachable through the
Caddy front door as `http://localhost:8090/api/v1`). The full endpoint contract is
`docs/04-api-specification.md`; the rules the endpoints enforce are `docs/01-design-document.md`
§10 and the post-MVP deltas in `docs/07-post-mvp-refinements.md`.
