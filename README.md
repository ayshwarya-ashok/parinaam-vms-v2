# Parinaam VMS v2

Volunteer Management System for Parinaam Foundation — a full rebuild derived from
`VMS_prototype_v2.html` and `VMS_database_model.md`, delivered in eight phases and refined
through eleven post-MVP review rounds (`docs/07-post-mvp-refinements.md`) and the client's
phased-sessions refinement (`docs/08`, `docs/09`).

**Stack** React 18 + MUI · NestJS 10 · PostgreSQL 16 · Redis · **n8n** (email orchestration) ·
**Mailpit** (sample mailbox) — all in Docker, all local.

> Independent of the earlier `parinaam-vms` repository, which must not be touched. Ports are
> shifted so both stacks run side by side on the same machine.

**The domain model, in one picture:**

```
programs            (no dates)      "Community Health Camp"      ← can be discontinued
   └── activities   (no dates)      "Blood Pressure Screening"   ← can be discontinued
          └── events (DATED)        15 Jul 09:00 · 19 Aug 09:00  ← volunteers enroll HERE
```

Certificates attach to **programmes** (hours summed across attended occurrences — visit rows
included); feedback and attendance attach to **occurrences**. A session may carry **phases**
(multi-day, owned by Parinaam / a partner lead / both) and must serve at least one
**beneficiary community**. `docs/01-design-document.md` §2 has the full model.

---

# Part 1 — Setup & Run

## 1.1 Prerequisites

- **Docker Desktop** (the whole stack runs in containers — no local Node or Postgres needed)
- ~4 GB free RAM for the seven containers
- A free run of ports **8090, 3001, 5174, 5679, 8026, 1026, 8082, 5432, 6379**

## 1.2 Clone the repository

```bash
git clone <repo-url> parinaam-vms-v2
cd parinaam-vms-v2
```

## 1.3 Install dependencies

Nothing to install on your machine. Each container installs its own dependencies on first
build; source directories are bind-mounted, so code changes hot-reload without rebuilds.

## 1.4 Environment variables

```bash
cp .env.example .env
```

The defaults run out of the box. The ones worth knowing:

| Variable | Default | Meaning |
|---|---|---|
| `SEED_DEMO_DATA` | `true` | Load the demo dataset on first boot (set `false` for a clean DB) |
| `API_PORT` / `WEB_PORT` | `3001` / `5174` | Host ports for API and web app |
| `VITE_API_BASE_URL` | `/api/v1` | **Relative** — the app works behind any host: Caddy (:8090), the Vite dev server (:5174, which proxies `/api`), a tailnet name, a tunnel, or a production domain |
| `VMS_WEBHOOK_SECRET` | dev value | HMAC secret shared between API and n8n — change per environment |
| `*_SECRET` / passwords | dev values | Change every one of them anywhere beyond a laptop |

## 1.5 Database setup

Automatic. On the database container's **first** boot it applies migrations `V001–V016` in
order (recording a SHA-256 checksum per file in `schema_migrations`), creates n8n's own
database, and loads seeds. Nothing to run by hand.

```bash
# rebuild everything from scratch, re-running migrations + seeds:
docker compose down -v && docker compose up -d
```

## 1.6 Seed / sample data

With `SEED_DEMO_DATA=true` you get a dataset built so **every business rule is demoable out of
the box** (reference date 2026-08-18):

- 6 programmes, 12+ activities, ~17 sessions across every state (draft / upcoming / completed / cancelled)
- **Lake Clean-up Drive** (Green Bengaluru) — the fully-worked activity: three completed
  sessions with mixed attendance sources and a documented absence, an upcoming session
  deliberately **full with a live waitlist**, and a **draft** for testing Publish/Edit
- One registration left **pending** (`anita.rao@example.org`) so the approval flow has a subject
- Two issued certificates (individual + corporate), published testimonials feeding the public page
- Two sessions on 10 Sep that deliberately **overlap**, for the scheduling-conflict flow
- **The four client-document scenarios** (S005): AAP Exposure Visit and Read to Rise, the
  **seven-phase Chote Kadam mentor journey** (in progress, CSR volunteer as named lead, one
  logged visit), and the Snow City outing — each linked to a beneficiary community
- Real PDF training materials — run once after first boot:

```bash
docker compose cp scripts/generate-seed-materials.mjs api:/app/gen.mjs
docker compose exec -T api sh -c "node /app/gen.mjs && rm /app/gen.mjs"
```

## 1.7 Start the backend

```bash
docker compose up -d                                # db, redis, n8n, mailpit, adminer
docker compose --profile app up -d --build          # + api, worker, web
```

**One-time n8n setup** (the email path) — import the workflow and credential:

```bash
docker compose exec n8n n8n import:credentials --input=/workflows/vms-smtp.credentials.json
docker compose exec n8n n8n import:workflow --input=/workflows/vms-email-dispatch.json
docker compose exec n8n n8n publish:workflow --id=vmsEmailDispatch1
```

Health check: `curl localhost:3001/api/v1/health/ready` should report db, redis **and n8n** up.

**Sharing the app with teammates** (no server needed): everything rides one origin through
Caddy, so exposing **only port 8090** — via Tailscale (share the machine, private) or a
Cloudflare tunnel (`cloudflared tunnel --url http://localhost:8090`, public link) — gives
others the web app, the API and the Mailpit UI with zero CORS or cookie changes. For links
inside emails to work for them, set `PUBLIC_WEB_URL` to the shared URL and restart api+worker.
The full recipe (and the exact setup currently live on this machine) is
`docs/runbooks/share-local-stack.md`.

## 1.8 Start the frontend

Started by the same `--profile app` command above. Open **http://localhost:5174** — the public
impact page. Everything you need is reachable from there.

| Service | URL |
|---|---|
| **Caddy — the single front door (app + API + Mailpit on one origin)** | **http://localhost:8090** |
| Web app (direct; the Vite dev server proxies `/api` itself) | http://localhost:5174 |
| API (Swagger at `/api/docs`) | http://localhost:3001 |
| **Mailpit — every email the system sends lands here** | **http://localhost:8026/mailpit/** |
| n8n editor | http://localhost:5679 |
| Adminer (DB browser — server `db`, user `parinaam`, db `parinaam_vms`) | http://localhost:8082 |

## 1.9 Login credentials

All demo accounts use the password **`Parinaam@123`**.

| Role | Email | Why this account is interesting |
|---|---|---|
| **Admin** | `admin@parinaam.org` | Full admin — start here |
| Volunteer | `rahul@example.org` | Active; holds certificate PAR-2026-000001; waitlisted on the Sept Lake drive |
| Volunteer | `meera@example.org` | Active; enrolled in the (full) Sept Lake drive; a published testimonial is hers |
| Volunteer | `ananya@example.org` | Active, all compliance passed |
| Volunteer | `deepa@example.org` | Onboarding — hasn't signed consent yet; shows the consent gate |
| CSR volunteer | `csr@techcorp.in` | Holds the **corporate** certificate naming TechCorp; named **mentor lead** on the Chote Kadam phases (EVT-2026-0204) |
| Volunteer | `anita.rao@example.org` | **Registration pending** — can log in and train, cannot enroll until approved |

### Infrastructure service credentials

Everything below comes from `.env` (copied from `.env.example` in §1.4) — these are the dev
defaults every teammate gets on a fresh clone. None of them are production secrets.

| Service | URL / port | Credentials |
|---|---|---|
| Web app | http://localhost:5174 | Demo accounts above (`Parinaam@123`) |
| API + Swagger | http://localhost:3001 · docs at `/api/docs` | JWT — log in via `POST /api/v1/auth/login` with any demo account |
| PostgreSQL | `localhost:5432` | user `parinaam` / password `parinaam_dev_pw` · databases `parinaam_vms` (app) and `n8n` |
| Adminer | http://localhost:8082 | System **PostgreSQL**, server **`db`** (not localhost — Adminer connects inside the Docker network), then the PostgreSQL credentials above |
| Redis | `localhost:6379` | No password (`docker compose exec redis redis-cli ping` → PONG) |
| n8n editor | http://localhost:5679 | No shared account — n8n v1 forces per-install owner setup: the first visit shows a **set-up-owner** screen where you create your own login. If someone else already claimed it, run `docker compose exec n8n n8n user-management:reset` and set yours (workflows and credentials survive) |
| Mailpit UI | http://localhost:8026/mailpit/ | No login — open it to read every email the system sends |
| Mailpit SMTP | `localhost:1026` (containers use `mailpit:1025`) | No auth |

The application-level secrets (`JWT_*`, `LINK_TOKEN_SECRET`, `VMS_WEBHOOK_SECRET`,
`N8N_ENCRYPTION_KEY`) also live in `.env` with `_change_me` dev values — services read them
automatically; you never type them anywhere.

## 1.10 Troubleshooting

| Symptom | Cause & fix |
|---|---|
| `localhost` URLs time out but `127.0.0.1` works | Docker Desktop's IPv6 port proxy has died. Restart Docker Desktop. (CORS accepts both origins, but the auth cookie needs the app and API on the **same** hostname.) |
| A port is already in use | The legacy `parinaam-vms` stack uses 5678/1025/8025/3000/5173 — this stack is shifted on purpose; check nothing else claims 3001/5174/5679/8026/8082. |
| n8n shows a sign-in page | Someone completed its owner setup with an unknown password: `docker compose exec n8n n8n user-management:reset`, then set your own on the setup screen. Workflows survive. |
| Emails stuck in `queued` | The worker or n8n is down. `docker compose logs worker n8n`. Nothing is lost — the outbox sweeper delivers everything once the path recovers. Run `node scripts/n8n-drift-check.mjs` to confirm the live workflow matches the repo and is active. |
| New/changed email template not taking effect | Templates load at boot: `docker compose restart api worker`. |
| `psql -f /database/...` mangles the path (Git Bash on Windows) | Prefix the command with `MSYS_NO_PATHCONV=1`. |
| "Open" on a training material 404s | The seed PDFs haven't been generated — run the generator in §1.6. |
| Want a truly clean slate | `docker compose down -v && docker compose up -d` re-runs migrations and seeds. |

Deeper operational issues: `docs/runbooks/` (deploy, restore, incident response, adding an
admin, editing the n8n workflow safely).

---

# Part 2 — VMS Functional Guide

What the system does and where to click. Keep **Mailpit (http://localhost:8026/mailpit/)** open in a
second tab throughout — half the product's behaviour is visible there.

## 2.1 Admin login

`http://localhost:5174` → **Admin Login** (top bar) → `admin@parinaam.org` / `Parinaam@123`.
You land on the admin hub: cards for every module, live counts on top. The nav bar (folding
into a hamburger on narrow windows) covers Programs, Calendar, Trainings, Volunteers, Field
Execution, Recognition, Metrics and Reports.

## 2.2 Volunteer login

`http://localhost:5174` → **Volunteer login** → any volunteer account. The volunteer shell has
its own nav: Dashboard, Events, Calendar, Trainings, Certificates, Feedback, Profile. Log in as
`deepa@example.org` to see the consent gate; as `anita.rao@example.org` to see the
"registration under review" banner and the enrollment lock.

## 2.3 Registration & onboarding

- **Sign up** (from the login page) collects credentials, then the profile — identity fields
  (name, gender, DOB, city, state, 10-digit phone) are mandatory. Account and profile are
  created **atomically on submit**: abandoning the form leaves nothing behind.
- New registrations land as **pending**. Admin → **Volunteers** shows a "🔔 N awaiting review"
  button; click a row for the full drawer (everything they entered, editable while pending) and
  **Approve** or **Reject** (a reason is required and is emailed to the applicant; rejection
  deactivates the account).
- Pending volunteers can explore, sign consent and complete trainings — but **cannot enroll**
  until approved.
- Onboarding proper: the volunteer signs the POCSO/POSH/NDA consent, which moves them
  Onboarding → In Training; passing all mandatory trainings moves them → Active.

- **Bulk corporate invites**: Volunteers → **＋ Invite volunteers** — up to 50 addresses with
  an optional sponsoring organization and note; already-registered addresses are skipped and
  reported back.
- **Welcome-Back**: reactivating an inactive volunteer automatically emails them their
  previous community's upcoming sessions; every active row has a **✉ Welcome-back** re-send
  button.
- **Bulk XLSX import**: Volunteers → **⬆ Import XLSX** — download the reference template
  (mandatory columns starred, sample rows included), fill it, upload; per-row validation with
  reasons, duplicates skipped, ≤200 rows. Imported volunteers arrive **approved** but still
  sign consent on first login; every import starts with the initial password `Parinaam@123`
  (no password column in the template) — volunteers change it at **Profile → Change password**.
- **Add one volunteer**: Volunteers → **＋ Add volunteer** — the mandatory identity fields
  only, optional initial password.

## 2.4 Activity & scheduling

Admin → **Programs**. The hierarchy is programme → activity → session (dated occurrence):

- Create a programme (draft) → add activities (defaults for duration, capacity, location,
  required trainings) → **Schedule Session** — single, or a **repeat series** (weekly/monthly)
  created as drafts.
- **Publish** flips a draft to *open to volunteers* — before that, only staff can see it.
- **Edit Occurrence** changes one session only; it refuses capacity below current enrolment and
  warns that rescheduling does not auto-notify enrollees. **Raising capacity auto-promotes the
  waitlist** (with emails).
- **Cancel** notifies every enrolled and waitlisted volunteer (check Mailpit). Discontinuing an
  activity or programme blocks enrollment down the whole tree.
- After a session's date passes, **Mark completed** closes the book — that's what dashboards
  count as *conducted*.
- **Beneficiary communities** (Admin → Communities): every published session must serve at
  least one; the community page lists its sessions by status (upcoming / in progress /
  completed).
- **Phases** (optional, on the session record): a session can be multi-phase — each phase is a
  day or a date range owned by the Parinaam team, a partner (a named volunteer lead marks it),
  or both in collaboration. Completing every phase completes the session automatically; while
  phases run, the session shows as **in progress** (counted separately from *conducted*).
  Attendance on phased sessions is logged **per visit** (volunteer + day + hours), and hours
  add up across all phases for certificates. Admin overrides of phase status are audited, and
  knocking a phase back reverts the session. A session with no phases behaves exactly as the
  bullet above. Try it: **Green Bengaluru → Lakefront Sapling Drive**.

## 2.5 Orientation & training

- Admin → **Trainings**: compliance (mandatory) vs activity trainings, materials (PDFs open
  inline), quiz questions, passing score, attempt limits, validity period. **Assessments** per
  training shows every volunteer's attempts, with an admin reset for exhausted attempts.
- Volunteer → **Trainings**: mandatory ones unlock activity ones (BR-04). Quizzes are scored
  server-side with an answer review. A valid **compliance** pass is final for its window — no
  retake. **Activity** trainings can be retaken, with an explicit warning that the **latest
  score is retained even if lower** — a failing retake really does revoke the pass.

## 2.6 Field execution & attendance

Admin → **Field Execution** — one row per session:

- **Send emails** dispatches two kinds of signed, no-login links (7-day expiry): volunteers
  self-report attendance (hours, optional evidence photos — EXIF-stripped); the coordinator
  files the occurrence report (actual timing, beneficiaries reached, highlights/challenges).
  Open the actual links from Mailpit to play both roles.
- Click a session (or **Record**) for the **session record**: upcoming shows the roster and
  waitlist; completed shows who came, hours logged and by whom, plus the coordinator report.
  Admins can **correct any row** (audited, attributed), **log attendance for silent
  volunteers**, and record **walk-ins** — picked from active approved volunteers only.
- Volunteers who never respond get exactly one automatic reminder (daily sweep, 09:00 IST).
- **Pre-session emails go out automatically**: programme details up to a week before and a
  reminder the day before (daily sweep, 09:30 IST) — and the session record has **re-send
  buttons** with sent counts for both.
- On **phased** sessions, attendance is logged per **visit** (volunteer + day + hours) under
  each phase; hours add up across phases for certificates. The admin can add any active
  volunteer to a phase mid-session.
- On a **completed** session, **✉ Send sponsor pack** emails the corporate sponsor the
  session's outcomes plus 7-day links to its photos.
- Volunteers can attach up to two **photos to their feedback** (EXIF-stripped, private until
  an admin publishes them) — they surface on the session record alongside the other evidence.

## 2.7 Recognition & retention

Admin → **Recognition**:

- **Certificates** — one per volunteer per programme, hours summed across *attended*
  occurrences. Issue singly or **bulk per programme**; the PDF (with the Parinaam logo,
  corporate variant for CSR volunteers) is stored, downloadable, and **emailed as an
  attachment**. If attendance changes after issue the row shows *hours changed* with a
  **Reissue**.
- **Feedback** — per-occurrence ratings, NPS and tagged issues/improvements, with analytics
  (ranked tags). **Publish as testimonial** is an explicit act; only published quotes appear on
  the public page, attributed as first name + last initial.
- Volunteer side: **Certificates** (wallet + download) and **Feedback** (rate attended
  sessions once each; invitations arrive by email after attendance is recorded).

> Issuing a certificate now asks for an optional **tangible-gift note** (memento, sapling…) —
> recorded on the certificate and mentioned in the email; the handover itself stays offline.

## 2.8 Dashboard & reporting

- Admin → **Metrics** — ten live charts and six KPI tiles, all one query, filtered by period
  (including a **custom date range**), programme and city. Every figure reconciles with SQL.
- Admin → **Reports** — the volunteer summary table (sortable, attendance bars) with **CSV /
  Excel / PDF exports that contain identical rows**, plus a run history.
- **Automated reports** — schedules (daily/weekly/monthly at a time IST) that generate and
  email the file as an attachment; pause/resume recomputes the next run; **Run now** fires
  without touching the clock. Watch the attachment arrive in Mailpit.
- Public: **http://localhost:5174/** — the impact page every visitor sees, entirely live-data:
  headline stats, impact numbers, field photos, published testimonials.

> Reports also export the year's annual **volunteering calendar** (every session with its
> programme, communities and enrolment) as one-click Excel — the Goodhearts planning sheet
> shared with corporate partners.

## 2.9 Key workflows to try

Each of these runs end to end on the seed data, in a few minutes:

1. **Approve a registration.** Admin → Volunteers → "1 awaiting review" → open **Anita Rao** —
   read everything she entered, edit a field, **Approve**. Mailpit: her approval email, whose
   button goes to the sign-in page. Log in as her: the banner is gone and enrolling works.
2. **Full volunteer lifecycle.** Sign up a brand-new volunteer → note the pending banner and
   the enrollment lock → approve them as admin → sign consent → pass a mandatory quiz → enroll
   in an open session. Watch each email arrive as you go.
3. **Waitlist promotion, two ways.** As `rahul@example.org` you're #1 on the waitlist for the
   full **September Drive**. Either withdraw `meera@example.org` from it, or — better — as
   admin **Edit Occurrence** and raise capacity from 2 to 3. Rahul is enrolled automatically
   and congratulated by email.
4. **Run a session end to end.** Publish the draft **October Drive** (Green Bengaluru → Lake
   Clean-up Drive) → enroll a volunteer → Field Execution → **Send emails** → open both links
   from Mailpit and submit attendance + the coordinator report → back as admin: correct a row,
   add a **walk-in**, then **Mark completed**.
5. **Issue a certificate.** Recognition → Certificates → filter Green Bengaluru → **Issue** for
   a volunteer with attended hours. Download the logo-headed PDF; find the same PDF attached to
   the email in Mailpit.
6. **Close the feedback loop.** As a volunteer who attended (e.g. `meera@example.org`), rate a
   session under **Feedback**. As admin, see it in Recognition → Feedback analytics and
   **Publish as testimonial** — then refresh the public page: the quote is live.
7. **A funder report.** Metrics → period **Custom range** (try 1–30 June 2026: one session,
   11.75 hours, 320 beneficiaries). Reports → export the same data three ways → create an
   automated weekly schedule → **Run now** → the Excel lands in Mailpit as an attachment.
8. **The retake rule.** As `rahul@example.org` open the *Orientation* training: it offers a
   retake with the latest-score warning. Fail it on purpose — the pass is revoked; pass it
   again — restored, with the full attempt history kept.
9. **Walk the Chote Kadam mentor journey.** Programs → Chote Kadam → open **Anganwadi
   Renovation — Hosur Road** (EVT-2026-0204): seven phases, phase 1 done, phase 2 running
   with a logged mentor visit. **Log a visit** under phase 2 (any date in its window), mark
   the Parinaam side of a collab phase, then **Override** one with a reason and watch the
   session status follow. As `csr@techcorp.in`, see the same phases on the session detail
   with **"Mark my side complete"**, and the open responsibilities on the dashboard.
10. **Communities and pre-session emails.** Admin → **Communities** → open *DJ Halli Learning
    Community* and filter its sessions by status. Then open any upcoming session's record and
    hit **✉ Send details email** — the T-7 programme-details mail (normally sent
    automatically a week out, with a reminder at T-1) lands in Mailpit for every enrolled
    volunteer, and the button shows the running sent count.

---

## Repository layout

```
apps/api/          NestJS API + worker (one image, ROLE-gated)
apps/web/          React 18 + MUI SPA
packages/shared/   contract types + BUSINESS_ERROR_CODES (reference; unused by the apps yet)
database/
  migrations/      V001–V016 — schema source of truth (forward-only, checksummed)
  seeds/           S001 reference · S002 demo · S003 worked activity · S004 identity backfill
  docker-init/     first-boot bootstrap
n8n/               version-controlled workflow + credential exports, contract, smoke test
scripts/           backup/restore, n8n drift check, seed-material generator
docs/              design docs 01–07 + runbooks/
docker-compose.yml
```

Each top-level directory has its own README with the conventions that matter inside it:
[`apps/api`](apps/api/README.md) · [`apps/web`](apps/web/README.md) ·
[`database`](database/README.md) · [`n8n`](n8n/README.md) · [`scripts`](scripts/README.md) ·
[`packages/shared`](packages/shared/README.md).

## Where to read next

1. **`docs/07-post-mvp-refinements.md`** — what changed after the MVP and why; the product
   decisions and app-wide conventions live here.
2. `docs/08-phased-sessions-and-communities.md` — the client refinement of Aug 2026: phases,
   communities, visit-level attendance, and the demo scenarios for all four client programmes.
3. `docs/09-client-doc-impact-analysis.md` — the client requirements document checked against
   the implementation: what fits, the gap register, and the pending decisions.
4. `docs/10-brand-palette.md` — the logo-derived color palette, **applied app-wide** (toasts
   exempt), with the exact token mapping that was made.
5. `docs/01-design-document.md` — the domain model (§2), business rules (§10), email
   architecture (§12).
6. `docs/04-api-specification.md` — every endpoint; live Swagger at `localhost:3001/api/docs`.
7. `docs/runbooks/` — deploy, restore (rehearsed and timed), incident response.

## Email, in one paragraph

The API never opens an SMTP connection. Every send is a row in `email_logs` first (same
transaction as the business event), then a signed webhook to n8n, which delivers via SMTP and
reports back through a signed callback. Mailpit swallows everything locally; an outbox sweeper
retries anything stalled, attachments included. Going to production changes exactly one thing:
n8n's SMTP credential points at a real relay.
