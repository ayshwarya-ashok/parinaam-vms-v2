# Parinaam VMS v2

Volunteer Management System for Parinaam Foundation — a rebuild derived from
`VMS_prototype_v2.html` and `VMS_database_model.md` v1.0.

**Stack** React 18 + MUI · NestJS 10 · PostgreSQL 16 · Redis · **n8n** (email orchestration) ·
**Mailpit** (sample mailbox) — all in Docker.

> Independent of the earlier `parinaam-vms` repository, which is out of scope. Ports are shifted
> so both stacks can run side by side on the same machine.

---

## The domain model, in one picture

```
programs            (no dates)      "Community Health Camp"      ← can be discontinued
   └── activities   (no dates)      "Blood Pressure Screening"   ← can be discontinued
          └── events (DATED)        15 Jul 09:00 · 19 Aug 09:00  ← volunteers enroll HERE
```

**"Event" means the dated occurrence** — the opposite of what it means in the prototype HTML,
where the top-level container was called an event. `docs/01-design-document.md` §2.1 has the
mapping table. Certificates attach to **programmes** (hours summed across occurrences attended);
feedback and attendance attach to **occurrences**.

---

## Current state

The database layer, the email pipeline and the documentation are complete. Application scaffolds
are Phase 0 work.

| Delivered | Location |
|---|---|
| Design document | `docs/01-design-document.md` |
| Phased implementation plan | `docs/02-implementation-plan.md` |
| Data model reference | `docs/03-data-model.md` |
| API specification | `docs/04-api-specification.md` |
| Screen inventory (33 screens mapped) | `docs/05-screen-inventory.md` |
| Gap analysis (prototype vs v1 model) | `docs/06-gap-analysis.md` |
| Schema — 36 tables, 8 views, 6 business functions | `database/migrations/V001`–`V009` |
| Reference + demo data | `database/seeds/` |
| n8n email workflow and contract | `n8n/` |
| Local Docker stack | `docker-compose.yml` |

---

## Quick start

Requires Docker Desktop.

```bash
cp .env.example .env
docker compose up -d
```

That brings up PostgreSQL, Redis, n8n, Mailpit and Adminer. On its **first** boot the database
container applies every migration in order, creates n8n's own database, loads reference data,
and — because `SEED_DEMO_DATA=true` — loads the demo dataset.

| Service | URL |
|---|---|
| PostgreSQL | `localhost:5432` · db `parinaam_vms` · user `parinaam` |
| **Mailpit — the sample mailbox** | **http://localhost:8026** |
| n8n editor | http://localhost:5679 |
| Adminer (DB browser) | http://localhost:8082 |
| Redis | `localhost:6379` |

Verify the schema:

```bash
docker compose exec db psql -U parinaam -d parinaam_vms \
  -c "select * from v_dashboard_kpis;" \
  -c "select p.name, a.name, count(e.id) as occurrences
      from programs p join activities a on a.program_id=p.id
      join events e on e.activity_id=a.id group by 1,2 order by 3 desc limit 3;"
```

Once the application exists (Phase 0): `docker compose --profile app up -d --build` adds the API
(`:3000`), worker and web app (`:5173`).

### One-time n8n setup

The email path needs a five-minute manual step the first time — import the workflow and create
the SMTP credential. **Full instructions and a copy-paste smoke test are in `n8n/README.md`.**

---

## Validating that email works

Mailpit accepts every message and delivers nothing onward, so you can exercise the real send
path without mailing actual volunteers.

1. Open **http://localhost:8026**.
2. Trigger anything that sends — or run the smoke test in `n8n/README.md` to post a signed
   payload straight at n8n.
3. The message appears in the inbox.

`GET http://localhost:8026/api/v1/messages` is the same data as JSON; the E2E suite asserts
against it, so *"cancelling this occurrence produced exactly N messages"* is a real test rather
than a hopeful log line.

The pipeline is: **API writes `email_logs` → renders the template → signed webhook to n8n → n8n
sends via SMTP → signed callback updates `email_logs`.** The API never opens an SMTP connection.
Going to production changes one thing: n8n's SMTP credential points at a real relay.

---

## Demo credentials

All demo accounts use the password **`Parinaam@123`**.

| Role | Email | State |
|---|---|---|
| Admin | `admin@parinaam.org` | — |
| Volunteer | `ananya@example.org` | Active — all compliance passed, enrolled in upcoming occurrences |
| Volunteer | `rahul@example.org` | In Training — POCSO attempts exhausted (3 fails); drives the admin-reset flow |
| Volunteer | `deepa@example.org` | Onboarding — no consent signed |
| CSR volunteer | `csr@techcorp.in` | Active — receives a corporate certificate naming TechCorp |

The dataset assumes a reference date of **2026-08-18** and is built so every rule is demoable
out of the box:

- **Recurrence** — Blood Pressure Screening runs twice (15 Jul completed, 19 Aug upcoming).
- **Discontinuation** — the Cleanup Drive activity is discontinued; the Environment Awareness
  programme is still a draft. Neither accepts enrollment.
- **Waitlist** — Basic Computer Skills on 22 Jul is full (3/3) with two volunteers queued.
- **Conflict** — the two 10 Sep occurrences deliberately overlap (08:00–11:00 and 09:30–11:30).
- **Union training gate** — Rahul is missing `tc1`, `tc2` and `t2` for the August screening, but
  *not* `t1`, which he passed at programme level.

---

## Repository layout

```
apps/api/          NestJS API + worker            (Phase 0)
apps/web/          React + MUI SPA                (Phase 0)
packages/shared/   DTO types and Zod schemas      (Phase 0)
database/
  migrations/      V001–V009 — schema source of truth
  seeds/           S001 reference, S002 demo
  docker-init/     first-boot bootstrap
n8n/
  workflows/       version-controlled workflow exports
  README.md        contract, setup, smoke test
docs/
docker-compose.yml
```

---

## Working with the database

| Task | Command |
|---|---|
| Rebuild from scratch | `docker compose down -v && docker compose up -d` |
| Skip demo data | set `SEED_DEMO_DATA=false` before the first boot |
| psql shell | `docker compose exec db psql -U parinaam -d parinaam_vms` |
| Applied migrations | `select * from schema_migrations order by version;` |
| Dump | `docker compose exec db pg_dump -U parinaam -Fc parinaam_vms > backup.dump` |

Back up the **`n8n` database too** — it holds workflow definitions and credentials.

### Adding a migration

1. Create `database/migrations/V0NN__short_description.sql`. Never edit an applied file — the
   bootstrap records a SHA-256 checksum per file.
2. Migrations are **forward-only and additive**.
3. Long index builds use `CREATE INDEX CONCURRENTLY` in their own non-transactional migration.
4. Update `docs/03-data-model.md` in the same pull request.

---

## Where to start reading

1. `docs/01-design-document.md` — §2 (the domain model), §10 (business rules), §12 (n8n),
   §20 (decisions and open risks).
2. `docs/06-gap-analysis.md` §0 — why the hierarchy changed and what it cost.
3. `docs/02-implementation-plan.md` — the nine phases.

**Three questions remain open** (design doc §20.3), none blocking: whether discontinuing a
programme should auto-cancel its scheduled occurrences; whether occurrences of one activity may
have different coordinators (assumed yes); and whether certificates should be re-issuable after
further participation (assumed yes).
