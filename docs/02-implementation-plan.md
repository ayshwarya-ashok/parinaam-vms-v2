# Parinaam VMS v2 — Phased Implementation Plan

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 2026-08-18 |
| **Companion to** | `01-design-document.md` v2.1 |
| **Changes in this revision** | Program → Activity → Event remodel; n8n email orchestration and Mailpit validation folded into P0/P2/P5; 2FA removed from P1; admin volunteer directory confirmed into P2. |
| **Baseline** | 2 full-stack engineers + 1 part-time QA. Two-week phases unless stated. Adjust the calendar, not the sequence. |

---

## How to read this plan

Nine phases, each a **vertically sliced, demoable increment** — database, API and UI for a
coherent slice of behaviour. Every phase ends with something a Parinaam stakeholder can click.

Business rule IDs (BR-nn) reference `01-design-document.md` §10. Screen names reference
`05-screen-inventory.md`.

### Sequencing rationale

Identity gates everything. Programmes and activities must exist before anything can be scheduled
against them, and occurrences must exist before anyone can enroll. Training gates enrollment
(BR-04, BR-05), so training is built before the gate is switched on. Attendance produces the
hours that certificates and dashboards consume, so it precedes both.

```
P0 Foundations  (incl. n8n + Mailpit pipeline)
   └── P1 Identity & Consent
         ├── P2 Programmes, Activities, Events (admin) ──┐
         │     └── P3 Scheduling (enroll, waitlist)  ────┤
         └── P4 Training & Assessment ───────────────────┤
                                                         │ (BR-05 gate
                                                         │  activates here)
                                    P5 Field Execution & Attendance
                                          ├── P6 Recognition
                                          └── P7 Dashboard & Reports
                                                  └── P8 Public Impact & Hardening
```

P3 ships with the prerequisite gate feature-flagged **off**
(`app_settings.features.enforceTrainingPrerequisites`, already seeded `false`) and P4 flips it
on. That flag exists so P2+P3 and P4 can run in parallel if the team splits.

---

## Phase 0 — Foundations, environment and the email pipeline

**Duration** 2 weeks · **Goal** One command gives a running stack with a migrated, seeded
database **and a working end-to-end email path you can watch land in a mailbox**.

### Database — *delivered*
- `V001`–`V009`: 36 tables, 8 views, 6 business functions, implementing the Program → Activity → Event
  hierarchy.
- `S001` reference data, `S002` demo data.
- First-boot bootstrap creating the VMS schema **and** n8n's own database.
- Still to build: `npm run db:migrate` runner for post-first-boot migrations, and `db:reset`.

### Email pipeline — *stack delivered, wiring to build*
- `n8n` and `mailpit` containers running. — *delivered*
- `n8n/workflows/vms-email-dispatch.json`: webhook → HMAC verify → optional attachment fetch →
  SMTP send → signed status callback. — *delivered, import and activation pending*
- To build: `NotificationsModule` — Handlebars registry, `email_logs` outbox writer, BullMQ
  `email` queue, the n8n handoff with HMAC signing, `POST /webhooks/n8n/email-status` with
  signature verification, and the `outbox-sweep` job.

### Backend
- NestJS 10 scaffold, strict TS, path aliases.
- Zod-validated env config that fails fast on boot.
- TypeORM data source, `synchronize: false`, entities for all 36 tables, plus a CI check that
  entities and schema agree.
- Global `ValidationPipe`, exception filter, Pino with redaction, `traceId` correlation.
- `GET /health`, `/health/ready` (DB, Redis, **n8n**), Swagger at `/api/docs`.
- `worker.ts` entrypoint; `StorageModule` with the local-disk driver.

### Frontend
- Vite + React 18 + TS scaffold.
- **MUI theme from the prototype's design tokens** (design doc §8.1).
- `PublicLayout`, `VolunteerLayout`, `AdminLayout` with header, breadcrumb strip, snackbar host.
- Router with the full route table stubbed.
- TanStack Query provider; Axios client with the auth interceptor wired but unused.
- Shared components: `PageShell`, `FilterBar`, `StatusPill`, `StatTile`, `EmptyState`,
  `ConfirmDialog`.

### DevOps
- Multi-stage Dockerfiles for `apps/api` and `apps/web`.
- GitHub Actions: lint → typecheck → unit → migration apply → build.
- Husky + lint-staged + commitlint; branch protection on `main`.

### Acceptance criteria
1. `cp .env.example .env && docker compose up -d` yields a healthy Postgres with all tables,
   views, functions, reference data and demo data, plus n8n and Mailpit running.
2. `docker compose --profile app up -d` yields `/health/ready` 200 and the themed SPA shell.
3. **`POST /internal/test-email` produces an `email_logs` row that transitions
   `queued → dispatched → sent`, and the message is visible in Mailpit at
   `http://localhost:8026`.**
4. **An unsigned or mis-signed callback to `/webhooks/n8n/email-status` is rejected with 401.**
5. **Stopping n8n leaves the row at `queued`; restarting n8n lets `outbox-sweep` deliver it.**
6. CI green on a trivial PR.

### Exit gate
Clone to running stack in under 10 minutes, and an engineer can watch a test email travel API →
n8n → Mailpit and back.

### Risks
Docker-on-Windows `node_modules` mount performance (mitigated by anonymous volumes). n8n's first
run needs a one-time manual import and SMTP-credential creation — documented in `n8n/README.md`;
budget an hour.

---

## Phase 1 — Identity, onboarding and compliance consent

**Duration** 2 weeks · **Goal** A volunteer can create an account, complete their profile and
sign the compliance agreement; an admin can sign in.

**Screens** Landing, Volunteer registration, Admin login, Volunteer profile, Compliance consent.

### Backend
- `AuthModule`: signup, login, refresh with rotation and reuse detection, logout,
  forgot/reset password. **No 2FA** (decision Q8).
- Argon2id hashing; lockout after 5 failures.
- `JwtAuthGuard` global with `@Public()`; `RolesGuard`.
- `VolunteersModule`: profile read/update; `GET /volunteers/me/compliance` from
  `v_volunteer_compliance`.
- `POST /volunteers/me/consent` capturing signature, version, IP, user-agent; recomputes phase;
  writes `audit_logs`.
- `OrganizationsModule` CRUD — needed for BR-01 on CSR signup.
- Templates live now on the P0 pipeline: `welcome_verify`, `password_reset`.

### Frontend
- Landing with the login/signup tab toggle.
- Registration form: names, gender, DOB, city, state, phone, category, conditional organization
  picker (BR-01), compliance-read checkbox.
- Admin login — **no OTP field**.
- `AuthContext`, protected routes, silent refresh, logout.
- Profile panel and edit form.
- Consent screen: three policy cards, declaration block with typed name and date, submit
  disabled until all three ticked.
- Guard: reaching `/app/trainings` without consent redirects to `/app/consent` (BR-02).

### Acceptance criteria
1. Signup creates `users` + `volunteers`; the volunteer lands on registration, then dashboard.
2. BR-01 enforced by both form and API.
3. Login issues an access token and rotating refresh cookie; reusing a rotated token revokes the
   family.
4. Signing consent writes the full evidentiary record and moves `Onboarding → In Training`
   (BR-14).
5. `/app/trainings` without consent redirects (BR-02).
6. Five failed logins lock for 15 minutes.
7. The welcome email lands in Mailpit with the correct recipient and subject.

---

## Phase 2 — Programmes, activities and scheduled occurrences

**Duration** 3 weeks *(was 2; the three-level hierarchy adds a screen layer)* · **Goal** An
admin can run the full lifecycle: create a programme, define its activities, schedule
occurrences, link trainings, announce, cancel and discontinue.

**Screens** Admin dashboard, Programs list, Program detail, Add/edit program, Add/edit activity,
Schedule/edit event, **Volunteer directory** (Q1).

### Backend
- `CoordinatorsModule` CRUD with soft deactivation.
- `ProgramsModule`: list with search and status filter; detail with activities and their
  occurrence counts; create; update; publish (`draft → active`); **discontinue** with reason,
  writing `audit_logs` and notifying volunteers with upcoming enrollments (BR-17).
- `ActivitiesModule`: create, update, **discontinue/reactivate**, list by programme, defaults
  (`default_duration_hours`, `default_max_slots`, `default_location`) that seed new occurrences.
- `EventsModule`: schedule one occurrence, **schedule a series** (a repeat helper generating N
  occurrences from a pattern — the payoff of the remodel), update, publish, cancel.
- **Cancellation (BR-07)** in one transaction: set status and `cancelled_at`, block enrollment,
  queue `event_cancelled` to every enrolled and waitlisted volunteer, audit.
- Training links at **both** levels: `PUT /programs/:id/trainings`, `PUT /activities/:id/trainings`.
- Announcements: preview endpoint rendering the real template, send recording an `announcements`
  row and fanning out one queued message per opted-in volunteer; resends are additional rows.
- Volunteer directory: search, phase/category/city filters, detail, activate/deactivate.

### Frontend
- Admin dashboard tile grid with live counts.
- Programs list with chip filters; each card shows its activities and next occurrence.
- Program detail: stat tiles, activities table, per-activity occurrence list (upcoming and
  past), linked trainings, header actions (Edit, Announce, Add Activity, Discontinue).
- Add/edit program and activity forms with the training catalog checkbox list and live chip
  preview.
- Schedule-occurrence form pre-filled from activity defaults; a "repeat" helper for a series.
- Cancel-occurrence modal showing the affected volunteer count.
- Discontinue modal explaining precisely what it does and does not do (blocks enrollment; does
  not cancel scheduled occurrences).
- Announcement modal with a real rendered preview.
- Volunteer directory table.

### Acceptance criteria
1. Creating a programme with activities and two occurrences of one activity persists correctly
   and displays accurate counts.
2. Occurrences inherit activity defaults but can override them.
3. Cancelling an occurrence queues one `email_logs` row per affected volunteer, blocks
   enrollment and audits — **verified by message count in Mailpit** (BR-07).
4. **Discontinuing a programme makes `fn_is_event_enrollable` false for every occurrence beneath
   it, while all history remains readable (BR-17).**
5. Discontinuing a single activity affects only its own occurrences.
6. The announcement preview is rendered by the same template the send uses; a second send is
   recorded as a resend and the button label changes.
7. `spots_left` everywhere comes from `v_event_capacity`.

### Exit gate
An admin can build the demo dataset's five programmes, eleven activities and twelve occurrences
from scratch through the UI.

---

## Phase 3 — Volunteer scheduling: browse, enroll, waitlist, calendar

**Duration** 2 weeks · **Goal** A volunteer can find occurrences, enroll, hit capacity and
conflict boundaries, join a waitlist, withdraw, and see it all on a calendar.

**Screens** Volunteer dashboard, Browse events, Event detail, Calendar (both roles).

> The BR-05 gate stays feature-flagged **off** until P4.

### Backend
- `EnrollmentsModule` implementing the seven-step transaction (design doc §7.3).
- Structured conflict responses: `ACTIVITY_FULL` with the prospective position;
  `SCHEDULING_CONFLICT` with the conflicting occurrence; `PREREQUISITES_NOT_MET` with the
  missing trainings from `fn_volunteer_missing_trainings()`.
- Withdraw with automatic promotion and a queued `waitlist_promoted` email.
- Waitlist join/leave with renumbering.
- Browse endpoint: search, type filter, enrollment-state filter, four sorts, returning capacity,
  the caller's state, prerequisites and any conflict per occurrence.
- Calendar endpoint: occurrences for a month plus per-day conflict flags.

### Frontend
- Volunteer dashboard grouped by programme, showing each programme's upcoming occurrences, with
  the running "selected / hours committed" summary and Confirm Participation.
- Browse grid: slot bars with open/warn/full colouring, training tags, conflict warnings, and
  the six button states (Enroll, Join Waitlist, Enrolled, On Waitlist #n, Discontinued,
  Training Required).
- Event detail with the enrollment panel and enrolled-volunteer list.
- Conflict modal with "Enroll Anyway"; waitlist modal with the prospective position.
- Calendar: month grid, per-programme coloured pills, conflict dots, selected-day panel,
  admin double-click-to-schedule, role-aware navigation.
- Optimistic updates with rollback.

### Acceptance criteria
1. Enrolling with a free seat succeeds and updates the slot bar immediately.
2. Enrolling into a full occurrence offers the waitlist with the correct position (BR-10).
3. Withdrawal promotes the head of the queue in the same transaction, renumbers, and queues a
   promotion email — **already verified against the seeded data**.
4. **Concurrency test**: two simultaneous withdrawals with one waitlisted volunteer promote
   exactly one person and never oversubscribe.
5. Overlapping enrollment warns; proceeding sets `conflict_acknowledged` (BR-11).
6. Cancelled occurrences and anything under a discontinued programme or activity never appear as
   enrollable.
7. The calendar marks days containing a conflict for the signed-in volunteer.

### Exit gate
The waitlist concurrency test passes repeatedly under Testcontainers with parallel clients.

---

## Phase 4 — Training and assessment

**Duration** 3 weeks *(largest phase)* · **Goal** The full compliance pipeline works and gates
enrollment.

**Screens** Trainings list, Add/edit training, My trainings, Training view, Volunteer assessments.

### Backend
- `TrainingsModule` CRUD; BR-03 enforced by schema, surfaced as a clear API error.
- Material upload: MIME allowlist, size cap, SHA-256 hash, ordering; adding a material bumps
  `content_version`.
- Quiz builder with validation (≥2 options, exactly one correct index).
- Volunteer training feed split into mandatory and activity sections with the lock state (BR-04).
- `POST /trainings/:id/attempts` — validates BR-02 and BR-03; returns questions **without**
  correct answers.
- `…/submit` — scores server-side, stores attempt and per-question answers, sets `expiry_date`
  on a pass, recomputes phase, returns the review payload.
- Admin assessment view per mandatory training, with status filters.
- Reset endpoint marking attempts `is_superseded`, writing `training_attempt_resets`, auditing.
- Content-change reset flow (BR-12).
- **Flip `features.enforceTrainingPrerequisites` to `true`.**

### Frontend
- Trainings list with filters and the Assessments action on mandatory rows.
- Add/edit training with materials uploader and dynamic question builder.
- My Trainings with two sections, lock bar, completion dots, attempt counters, validity dates.
- Training view: Materials tab with preview and download; Quiz tab with the attempt-status bar
  (pips, remaining, latest score, validity), question flow with progress, score card, answer
  review, attempts-exhausted state.
- Admin assessment table with pips and Reset; reset-on-new-document modal.

### Acceptance criteria
1. Quizzes are scored server-side; correct answers never reach the client before submission.
2. A mandatory training blocks a fourth attempt and shows the exhausted state (BR-03).
3. A passing mandatory attempt sets `expiry_date` 12 months out.
4. Activity trainings stay locked until all three compliance trainings pass (BR-04).
5. **With the flag on, enrolling without the required trainings returns
   `PREREQUISITES_NOT_MET` naming the union of programme-level and activity-level gaps (BR-05)**
   — the seeded Rahul case (missing tc1, tc2, t2 for EVT-2026-0012) is the fixture.
6. An admin reset restores attempts to zero, preserves superseded history, and audits (BR-12).
7. An expired certification returns the volunteer to `In Training` and re-locks enrollment.

### Exit gate
signup → consent → three compliance quizzes → activity trainings unlock → enrollment succeeds,
with the gate on.

---

## Phase 5 — Field execution, attendance and evidence

**Duration** 2 weeks · **Goal** Attendance paperwork travels by email, is filled in by people
without accounts, and lands as structured data.

**Screens** Field execution & attendance, Volunteer attendance form, Coordinator event report.

### Backend
- Link-token issue and `LinkTokenGuard` verification (BR-13).
- Field execution list: per-occurrence dispatch state, attendance counts, filters.
- Dispatch endpoints (volunteer / coordinator / both) with previews; volunteer dispatch issues
  one token per enrolled volunteer.
- Volunteer attendance submission via token, with up to two evidence images. Hours computed
  from the time pair (BR-15).
- Coordinator report submission via token.
- Image pipeline: Sharp resize, thumbnail, EXIF strip, link to `event_photos`.
- Admin override endpoints; reminder sweep 24 h after dispatch.
- **New n8n workflows**: `vms-bulk-announcement.json` (fan-out with rate limiting) and
  `vms-attendance-reminder.json`, both exported into `n8n/workflows/`.

### Frontend
- Field execution table with Send/Resend, Vol Form and Coord Form actions.
- Send-emails modal with both previews and three send buttons.
- Volunteer attendance form: standalone, mobile-first, token-authenticated; attended toggle
  revealing timing or absence block; two-slot uploader; thank-you state.
- Coordinator report form: four status options, timings, headcounts, three narratives, images.
- Expired/consumed token page with a clear explanation and contact address.

### Acceptance criteria
1. Dispatching updates `attendance_dispatches` and issues a token unique to each volunteer.
2. A valid link renders the form without login; an expired or consumed link renders the
   explanation page (BR-13).
3. Submitting writes exactly one record per volunteer per occurrence; resubmit inside the grace
   window updates rather than duplicating.
4. BR-15 holds: absent requires a reason, present requires hours.
5. The coordinator report's beneficiary count reaches `v_dashboard_kpis`.
6. Evidence images are stored, thumbnailed, EXIF-stripped, `is_public = false`.
7. **Every message the system has ever sent now has an `email_logs` row with a terminal status,
   and each is findable in Mailpit.**

### Exit gate
A full field cycle on demo data: dispatch, volunteer submits from a phone viewport, coordinator
submits, admin sees counts update.

---

## Phase 6 — Recognition: certificates and feedback

**Duration** 2 weeks · **Goal** Volunteers are thanked, and their feedback becomes insight.

**Screens** Recognition hub, Certificates, Feedback responses, My certificates, Feedback form.

### Backend
- **Per-programme certificate generation (BR-18)**: for each volunteer with attendance in a
  programme, sum hours from `v_program_participation`, snapshot `events_attended`,
  `period_start`, `period_end`; `cert_type` from the volunteer's category (BR-08).
- Reissue path when a volunteer participates further after issuance (open question O3).
- `pdf` queue with pooled Puppeteer; two Handlebars templates.
- Issue, bulk issue with progress, resend, signed download URL, idempotency.
- Feedback per occurrence: option catalog, submission with BR-09 enforcement, eligible-events
  endpoint, admin analytics (counts, average rating, average NPS, would-return, ranked tags).
- Testimonial publish/unpublish (BR-16); `feedback_request` sweep.

### Frontend
- Recognition hub; certificates table with search, filter, select-all, bulk issue with progress.
- Certificate-issued modal with the rendered preview inside the email preview.
- My Certificates wallet with inline preview and PDF download.
- Feedback form: all eight sections, with the occurrence picker listing attended occurrences.
- Admin feedback view: stat tiles, ranked tags, response list, publish toggle.

### Acceptance criteria
1. A CSR volunteer's certificate uses the corporate template and names the organization (BR-08).
2. **A volunteer who attended two occurrences of one programme receives one certificate whose
   hours are the sum** — the seeded Rahul (7h across two) and Meera (4h across two) cases.
3. Bulk-issuing 50 certificates completes without blocking the UI, producing 50 PDFs and 50
   Mailpit messages.
4. Certificate PDFs are reproducible for identical inputs and carry a unique number.
5. A volunteer cannot submit feedback twice for the same occurrence (BR-09).
6. Admin analytics match hand-computed values on demo data.
7. Only published feedback appears through the public API (BR-16).

---

## Phase 7 — Metrics dashboard and reporting

**Duration** 2 weeks · **Goal** Parinaam can see its impact and email it to funders on a schedule.

**Screens** Metrics dashboard, Reports, Automated reports.

### Backend
- `AnalyticsModule`: one `GET /analytics/dashboard` returning KPIs and all chart series,
  filtered by period, programme and city as real SQL predicates.
- `ReportsModule`: volunteer report query with filters; PDF, Excel and CSV exporters over the
  same paginated query; >5,000 rows queued and emailed.
- Scheduled report CRUD, `next_run_at` in the report's timezone, the 5-minute dispatcher,
  `report_runs` history, pause/resume/delete.
- `vms-scheduled-report.json` workflow exported.
- Maintenance sweeps from design doc §14 wired.

### Frontend
- Dashboard: filter bar, KPI tiles, the ten Chart.js charts, each with a visually hidden data
  table for accessibility.
- Reports screen with date pickers, three export buttons, volunteer table with attendance bars.
- Automated reports: schedule form and list with status pills.

### Acceptance criteria
1. Changing period, programme or city re-queries and every chart updates consistently.
2. KPI values reconcile with direct SQL against demo data.
3. All three export formats contain identical rows for identical filters.
4. A report scheduled two minutes out fires once, writes a `success` run, and **the file arrives
   in Mailpit as an attachment**.
5. Pausing prevents the next run; resuming recomputes `next_run_at` correctly.
6. The dashboard renders in under 2 seconds on demo data.

---

## Phase 8 — Public impact page, hardening and release

**Duration** 2 weeks · **Goal** A shareable public page, and a system that is safe, observed,
documented and handed over.

### Backend
- `PublicModule`: unauthenticated aggregates — headline stats, impact numbers, public gallery,
  published testimonials only (BR-16). Caching, aggressive rate limiting, no personal data
  beyond a first name and last initial.
- Security pass: Helmet CSP, CORS lockdown, dependency and container scanning, ZAP baseline, and
  an authorization matrix test asserting every endpoint against every role.
- **n8n hardening**: user management enabled, port not publicly exposed, encryption key rotated
  into the secret store, **a check that every live workflow matches its exported file** (R4).
- Performance pass: k6 on the announcement blast, dashboard and enrollment storm;
  `V010__performance_indexes.sql` driven by the results, not by guesswork.
- Data lifecycle: retention sweeps, volunteer erasure, backup script, rehearsed restore runbook
  **including the n8n database**.
- `/metrics` in Prometheus format.

### Frontend
- Public impact page from live data: hero stats, impact numbers, gallery from public
  `event_photos`, testimonials from published feedback, feedback CTA, footer.
- Accessibility audit (axe + manual keyboard pass); bundle analysis and code splitting.
- Error boundaries, offline detection, friendly 404.

### Documentation and handover
- `docs/runbooks/`: deploy, restore, incident response, adding an admin, **editing an n8n
  workflow safely**.
- Admin user guide with screenshots; volunteer quick-start; final API reference.
- UAT, defect triage, sign-off.

### Acceptance criteria
1. The public page exposes no unpublished feedback, no non-public photo, no volunteer contact
   detail.
2. The authorization matrix test passes.
3. ZAP baseline reports no high or medium findings.
4. Lighthouse: performance ≥ 85, accessibility ≥ 95.
5. A restore from last night's backup — VMS **and** n8n databases — succeeds, timed and recorded.
6. All thirteen E2E journeys pass in CI.
7. UAT sign-off obtained.

---

## Summary schedule

| Phase | Weeks | Cumulative | Demoable outcome |
|---|---|---|---|
| P0 Foundations + email pipeline | 2 | 2 | One-command stack; a test email lands in Mailpit |
| P1 Identity & consent | 2 | 4 | Sign up, sign in, sign the compliance agreement |
| P2 Programmes / activities / occurrences | 3 | 7 | Run a programme end to end, including discontinuation |
| P3 Scheduling | 2 | 9 | Enroll, waitlist, conflict, calendar |
| P4 Training & assessment | 3 | 12 | Compliance pipeline gating enrollment |
| P5 Field execution | 2 | 14 | Attendance by signed link, no login |
| P6 Recognition | 2 | 16 | Per-programme certificates; feedback analysed |
| P7 Dashboard & reports | 2 | 18 | Impact visible and emailable |
| P8 Public page & hardening | 2 | 20 | Public impact page, production release |

**20 weeks / ~5 months** at the stated team size — one week longer than the v1.0 plan, because
the three-level hierarchy adds a screen layer to P2.

### Parallelisation

With a second pair of engineers, P2+P3 and P4 run concurrently after P1 — they share only the
prerequisite flag. That compresses the critical path to roughly 16 weeks. P6 and P7 can also
overlap. Do not parallelise P5 with P4: attendance depends on enrollment being final.

### Definition of done (every phase)

- [ ] Acceptance criteria demonstrated on a shared environment
- [ ] Unit and integration tests green; coverage thresholds met
- [ ] E2E journeys for the phase automated in Playwright
- [ ] **Any email introduced this phase asserted against the Mailpit API, not just logged**
- [ ] **Any n8n workflow changed this phase exported back into `n8n/workflows/`**
- [ ] OpenAPI updated and the web client regenerated
- [ ] Migrations forward-only and applied cleanly to a production-shaped copy
- [ ] No new high/critical findings from `npm audit` or Trivy
- [ ] Accessibility check on new screens
- [ ] Documentation updated, including the decisions log if a decision changed
- [ ] Demoed to Parinaam and feedback logged

### Cross-phase carry-forward risks

| Risk | First appears | Watch until |
|---|---|---|
| Waitlist concurrency (R1) | P3 | P8 load test |
| Puppeteer memory (R2) | P6 | P8 load test |
| n8n as a notification SPOF (R3) | P0 | P8 load test + alerting |
| Workflow drift from the repo (R4) | P0 | P8 automated check |
| Link-token exposure (R5) | P5 | P8 security pass |
| Compliance expiry edge cases (R6) | P4 | P7 sweeps |
| Program/Activity/Event naming confusion (R7) | P2 | Ongoing — reinforce in review |

---

## Immediate next steps

1. **Confirm the three still-open questions** in design doc §20.3 — particularly O1 (does
   discontinuing a programme auto-cancel its future occurrences?) and O3 (certificate reissue
   after further participation).
2. **Import and activate the n8n workflow**, create the `VMS SMTP` credential, and run the smoke
   test in `n8n/README.md`. This is the one manual step in the stack.
3. **Start Phase 0.** The database layer and the email stack are delivered; what remains is the
   application scaffolds, the MUI theme, the `NotificationsModule` wiring and CI.


---

## Delivery record (added post-implementation)

All eight phases shipped between 2026-08-17 and 2026-08-20; commits `78094d0` (P1) through
`da5fe2f` (P8). Deviations from this plan, made deliberately and recorded at the time:

- **Certificates render with pdf-lib, not Puppeteer** — a ~300 MB Chromium layer was not worth
  one fixed A4 layout; the swap is contained to `CertificatePdfService`.
- **argon2id landed in Phase 8 as planned**, with bcrypt seeds upgrading transparently on the
  first successful login (hashes carry their algorithm prefix).
- **Sessions are completed by an explicit admin action** (post-MVP, audit round) rather than a
  background sweep — "the date passed" and "the session happened" are different claims.
- **Descoped from the local delivery** and documented in the P8 commit: ZAP baseline, k6 load
  tests (and the results-driven index migration), Lighthouse scoring, CI E2E suite, UAT
  sign-off. The authorization-matrix test and a timed backup/restore rehearsal shipped instead.

Post-MVP work continued in nine review rounds — see `07-post-mvp-refinements.md`.
