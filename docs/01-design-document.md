# Parinaam VMS v2 — Design Document

| | |
|---|---|
| **System** | Parinaam Volunteer Management System (VMS) |
| **Version** | 2.1 |
| **Date** | 2026-08-18 |
| **Status** | For review |
| **Source inputs** | `VMS_prototype_v2.html` (interactive prototype, 30 screens), `VMS_database_model.md` (v1.0 relational model) |
| **Supersedes** | v2.0 (2026-08-16). Changes in this revision: the Program → Activity → Event remodel, n8n-orchestrated email, Mailpit as the sample mailbox, and 2FA removed from scope. |


> **Post-MVP addendum (2026-08-21).** This document describes the system as designed. Nine
> review rounds and a codebase audit refined it after delivery; where this document and
> `07-post-mvp-refinements.md` disagree, the refinements document wins. The largest deltas:
> registration is atomic (account + profile in one transaction) and **admin-reviewed**;
> enrolling requires an approved registration; hours count **attended records only** (V012);
> sessions are completed by an explicit admin action; `/` serves the public impact page with
> sign-in at `/login`; certificates carry the Parinaam logo and are named
> `<certificateNumber>.pdf`.

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Domain model: Program, Activity, Event](#2-domain-model-program-activity-event)
3. [Actors and roles](#3-actors-and-roles)
4. [Functional decomposition](#4-functional-decomposition)
5. [Architecture](#5-architecture)
6. [Technology stack](#6-technology-stack)
7. [Backend design](#7-backend-design)
8. [Frontend design](#8-frontend-design)
9. [Data architecture](#9-data-architecture)
10. [Business rules catalog](#10-business-rules-catalog)
11. [Security design](#11-security-design)
12. [Notifications: n8n orchestration](#12-notifications-n8n-orchestration)
13. [File storage and document generation](#13-file-storage-and-document-generation)
14. [Background jobs and scheduling](#14-background-jobs-and-scheduling)
15. [Reporting and analytics](#15-reporting-and-analytics)
16. [Non-functional requirements](#16-non-functional-requirements)
17. [Environments and deployment](#17-environments-and-deployment)
18. [Observability, backup and recovery](#18-observability-backup-and-recovery)
19. [Testing strategy](#19-testing-strategy)
20. [Decisions log and open risks](#20-decisions-log-and-open-risks)

---

## 1. Purpose and scope

Parinaam VMS manages the complete lifecycle of a volunteer engagement for an Indian
non-profit: a person signs up, agrees to statutory compliance policies, passes mandatory
compliance assessments, enrolls in scheduled occurrences of volunteering work, attends and
self-reports, receives a certificate, and gives feedback. Administrators plan programmes,
publish training, dispatch field paperwork, and report on impact.

### 1.1 In scope

All 30 prototype screens, plus two the prototype stubbed:

| Area | Screens |
|---|---|
| Public / auth | Landing (login + signup), Volunteer registration, Admin login, Public impact page |
| Volunteer | Dashboard, Browse events, Event detail, Calendar, Compliance consent, My trainings, Training view (materials + quiz), My certificates, Feedback form, Attendance form |
| Admin — programmes | Admin dashboard, Programs list, Program detail, Add/edit program, Add/edit activity, Schedule/edit event, Calendar |
| Admin — training | Trainings list, Add/edit training, Volunteer assessments |
| Admin — field | Field execution & attendance, Coordinator event report form |
| Admin — recognition | Recognition hub, Certificates, Feedback responses |
| Admin — insight | Metrics dashboard, Reports, Automated reports |
| Admin — people | Volunteer directory *(prototype stub, confirmed in scope)* |

Plus the nine modal interactions the prototype defines.

### 1.2 Out of scope for v2.0

Mobile native apps; payments; multi-tenancy; a public volunteer directory; volunteer-to-volunteer
messaging; real-time chat; localisation beyond English; **two-factor authentication** (removed
2026-08-18 — reinstating it is a two-column additive migration and one auth endpoint).

### 1.3 Design principles

1. **The database is the authority on business rules.** Capacity, compliance status, the
   discontinuation cascade and waitlist ordering are enforced by constraints, views and
   functions — not only by application code.
2. **Derived values are never stored.** `spots_left`, attendance percentage and compliance
   status are views.
3. **Coordinators never get accounts.** They act through signed, expiring links.
4. **Every outbound message is logged before it is sent.** `email_logs` is a transactional
   outbox, not a debugging aid.
5. **Compliance actions are auditable.** Consent signatures, assessment resets, event
   cancellations and programme discontinuation write to `audit_logs`.

---

## 2. Domain model: Program, Activity, Event

This is the single most important structural decision in the system, and it differs from the
prototype. Three levels:

| Level | Time-bound? | Meaning | Example |
|---|:--:|---|---|
| **Program** | No | A long-running initiative | Community Health Camp |
| **Activity** | No | A repeatable unit of work inside a programme | Blood Pressure Screening |
| **Event** | **Yes** | One dated, timed occurrence of an activity | 15 Jul 2026, 09:00, City Hall Block A |

**Volunteers enroll in Events.** Capacity, coordinator, location, attendance, waitlist and
feedback all attach to the occurrence, because that is the only thing that actually happens on
a day.

### 2.1 How this maps onto the prototype

The prototype had two levels and conflated the third:

```
Prototype                                 v2
─────────                                 ──
"Community Health Camp"  (Event, 15 Jul)  →  Program        (dates removed)
  └ "Blood Pressure Screening"            →  Activity       (the definition)
      09:00, 3h, Block A, 5 slots         →  Event          (the occurrence)
```

The prototype's Activity carried both the *definition* (what the work is, what skill it needs,
what training gates it) and the *scheduling* (when, where, how many seats). Splitting them is
what makes a recurring activity expressible: Blood Pressure Screening can now run monthly, each
run with its own date, coordinator, capacity and attendance, without duplicating the definition
or its training links.

> **Terminology warning.** "Event" in this document means the *occurrence*, which is the
> opposite of what it means in the prototype HTML. When reading prototype code alongside this
> design, translate: prototype Event → v2 Program.

### 2.2 Discontinuation

Programmes and activities are long-lived, so both can be **discontinued** — a soft state that
blocks new enrollment while preserving every historical record.

The cascade has three levels, and rather than ask every caller to remember all three, it is
centralised in one function:

```sql
fn_is_event_enrollable(event_id)
  = event.status = 'upcoming'
  AND activity.status = 'active'
  AND program.status  = 'active'
  AND event.date >= CURRENT_DATE
```

Discontinuing a programme immediately stops enrollment on every occurrence beneath it.
Whether to also *cancel* already-scheduled future occurrences is a separate, explicit admin
action — discontinuation alone never cancels on the volunteer's behalf, because someone must
decide whether those people get a cancellation email.

---

## 3. Actors and roles

| Actor | Authenticates | Primary surface | Notes |
|---|---|---|---|
| **Volunteer** | Email + password (JWT) | Volunteer dashboard | Has both a `users` row and a `volunteers` row. |
| **Admin** | Email + password | Admin dashboard | Has a `users` row only. |
| **Field coordinator** | No account. Signed one-time link. | Event report form | Exists in `coordinators`. |
| **Public visitor** | None | Impact page | Read-only aggregates; no personal data. |
| **System** | — | Worker / n8n | Announcements, attendance links, scheduled reports. |

### 3.1 Permission matrix

| Capability | Volunteer | Admin | Coordinator (link) |
|---|:--:|:--:|:--:|
| Register, manage own profile | ✔ | — | — |
| Sign compliance consent | ✔ | — | — |
| Take training quizzes | ✔ | — | — |
| Browse / enroll / withdraw from events | ✔ | — | — |
| Join and leave waitlists | ✔ | — | — |
| Self-report attendance | ✔ (own, via link) | ✔ (any) | — |
| Submit event occurrence report | — | ✔ | ✔ (own event) |
| Submit feedback | ✔ (attended events) | — | — |
| View own certificates | ✔ | — | — |
| CRUD programmes, activities, events, coordinators | — | ✔ | — |
| Discontinue a programme or activity | — | ✔ | — |
| CRUD trainings, materials, quizzes | — | ✔ | — |
| Reset assessment attempts | — | ✔ | — |
| Issue / resend certificates | — | ✔ | — |
| Send announcements and attendance emails | — | ✔ | — |
| View dashboard, reports, all feedback | — | ✔ | — |
| Configure scheduled reports | — | ✔ | — |

---

## 4. Functional decomposition

### M1 — Identity, onboarding and compliance consent

Signup, login, volunteer profile capture, the admin volunteer directory, and the POCSO/POSH/NDA
compliance agreement. The consent screen is legally significant: it captures a typed signature,
a date, the policy version, and the client IP and user-agent.

### M2 — Programme, activity and event management

Admin CRUD over coordinators, programmes, activities and scheduled occurrences; linking
trainings at programme and activity level; the filterable programme list; the programme detail
screen showing its activities and their upcoming and past occurrences; scheduling one or many
occurrences of an activity; event cancellation with bulk notification; programme and activity
discontinuation; and the announcement broadcast with resend tracking.

### M3 — Volunteer scheduling

The volunteer dashboard, browse-events grid with sort and filter, event detail, the role-aware
calendar, and the enrollment engine: capacity checks, scheduling-conflict detection with an
"enroll anyway" override, waitlist join with position, withdrawal, and automatic promotion.

### M4 — Training and assessment

The training catalog with materials and MCQ quizzes; the volunteer training experience; attempt
tracking with a 3-attempt cap on mandatory trainings; annual expiry; the admin assessment table
with reset; and the "a new document was added — reset scores?" decision.

### M5 — Field execution, attendance and evidence

Per-occurrence dispatch state; the two-email send (volunteer self-report + coordinator
occurrence report); the tokenised volunteer attendance form; and the coordinator report with
actual timings, headcounts, narrative and evidence images.

### M6 — Recognition, feedback and insight

Per-programme certificates in individual and corporate variants; the volunteer certificate
wallet; the eight-section per-occurrence feedback form; admin feedback analytics; the metrics
dashboard; the volunteer report table with PDF/Excel/CSV export; scheduled report jobs; and the
public impact page.

---

## 5. Architecture

### 5.1 System context

```
                       ┌──────────────────────────┐
   Volunteer ─────────▶│                          │
   Admin ─────────────▶│   React SPA (MUI)        │
   Public visitor ────▶│   apps/web               │
                       └────────────┬─────────────┘
                                    │ HTTPS / JSON  (Bearer JWT or signed link token)
                                    ▼
                       ┌──────────────────────────┐        ┌──────────────┐
   Coordinator ───────▶│   NestJS REST API        │───────▶│  PostgreSQL  │
   (signed link)       │   apps/api               │        │   16         │
                       │                          │        └──────────────┘
                       │  ┌────────────────────┐  │        ┌──────────────┐
                       └──┴─────────┬──────────┴──┴───────▶│    Redis     │
                                    │  BullMQ              └──────┬───────┘
                                    ▼                             │
                       ┌──────────────────────────┐               │
                       │   Worker process         │◀──────────────┘
                       │   outbox · PDF · reports │
                       └────────────┬─────────────┘
                                    │ signed webhook (HMAC)
                                    ▼
                       ┌──────────────────────────┐
                       │   n8n                    │──▶ SMTP ──▶ Mailpit (dev)
                       │   email orchestration    │              relay  (prod)
                       └────────────┬─────────────┘
                                    │ signed status callback
                                    └──────────────▶ API  (email_logs updated)
```

### 5.2 Container view (Docker Compose)

| Container | Image / build | Responsibility | Host port (dev) |
|---|---|---|---|
| `db` | `postgres:16-alpine` | System of record. Also hosts n8n's own database. | 5432 |
| `redis` | `redis:7-alpine` | BullMQ backend. | 6379 |
| `api` | `apps/api` (Node 20) | REST API, business rules, outbox writer. | 3000 |
| `worker` | `apps/api`, different entrypoint | Outbox dispatch to n8n, PDF, reports. | — |
| `web` | `apps/web` | React SPA. | 5173 |
| `n8n` | `n8nio/n8n` | **Owns email delivery.** | 5679 |
| `mailpit` | `axllent/mailpit` | **The sample mailbox.** Catches every message. | 8026 UI / 1026 SMTP |
| `adminer` | `adminer` | DB browser. Dev only. | 8082 |

> Ports are shifted off their defaults because an existing `parinaam-vms` stack occupies
> 5678/1025/8025 on this machine. Both stacks can run side by side.

### 5.3 Repository layout

```
parinaam-vms-v2/
├── apps/
│   ├── api/                     # NestJS API + worker
│   │   └── src/
│   │       ├── common/ config/ database/
│   │       └── modules/
│   │           ├── auth/        · users/       · volunteers/  · organizations/
│   │           ├── coordinators/· programs/    · activities/  · events/
│   │           ├── trainings/   · enrollments/ · attendance/  · certificates/
│   │           ├── feedback/    · analytics/   · reports/
│   │           ├── notifications/  # renders templates, hands off to n8n
│   │           ├── storage/     · public/
│   └── web/                     # React + Vite + MUI
├── packages/shared/             # DTO types + zod schemas
├── database/
│   ├── migrations/              # V001–V009 — schema source of truth
│   ├── seeds/                   # S001 reference, S002 demo
│   └── docker-init/             # first-boot bootstrap
├── n8n/
│   ├── workflows/               # version-controlled workflow exports
│   └── README.md                # contract, setup, smoke test
├── docs/
├── docker-compose.yml
└── .env.example
```

---

## 6. Technology stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Mandated. |
| UI kit | MUI v6 | Mandated. The prototype's visual language maps onto a custom theme. |
| Routing | React Router v6 (data router) | Nested layouts per role. |
| Server state | TanStack Query v5 | Caching, optimistic enroll/withdraw. |
| Forms | React Hook Form + Zod | Large forms; schemas shared with the API. |
| Charts | Chart.js 4 via `react-chartjs-2` | Direct parity with the prototype's ten charts. |
| Calendar | Custom MUI grid | The prototype's month grid is bespoke. |
| Backend | NestJS 10 + TypeScript | Mandated. |
| ORM | TypeORM 0.3, `synchronize: false` | Entities map onto the SQL-defined schema. |
| Auth | Passport JWT + argon2 | Access + rotating refresh tokens. No 2FA in v2.0. |
| Queues | BullMQ + Redis | Outbox dispatch, PDF, reports. |
| **Email orchestration** | **n8n** | See §12. |
| **Dev mailbox** | **Mailpit** | Catches every message; has a search API the e2e tests assert against. |
| Templating | Handlebars, rendered in the API | Keeps the admin's email preview byte-identical to what is sent. |
| PDF | Puppeteer | Certificates are HTML-designed; HTML→PDF preserves the layout. |
| Excel / CSV | ExcelJS / `fast-csv` | Streamed exports. |
| Images | Sharp | Thumbnails and EXIF stripping. |
| API docs | `@nestjs/swagger` | OpenAPI 3; the web client is generated from it. |
| Testing | Jest, Supertest, Testcontainers, Vitest, RTL, Playwright | §19. |

### 6.1 Notable decisions

**Raw SQL migrations rather than ORM-generated ones.** The database carries real business logic
— a waitlist promotion function, an enrollability cascade, capacity views. Generated migrations
would obscure these. A CI check asserts entities and schema agree.

**Mailpit rather than MailHog.** MailHog is unmaintained; Mailpit is a drop-in replacement with
a message-search API, which lets the E2E suite assert *"cancelling this event produced exactly
one message per registrant"* instead of trusting a log line.

**UUID primary keys.** Prevents ID enumeration in the tokenised attendance links, which are the
system's most exposed surface. Human-readable `code` columns (`PRG-2026-001`, `ACT-001`,
`EVT-2026-0012`) carry the identifiers people actually say out loud.

---

## 7. Backend design

### 7.1 Module map

| Nest module | Owns |
|---|---|
| `AuthModule` | Login, refresh, logout, password reset, link-token issue/verify |
| `UsersModule` / `VolunteersModule` | Accounts, profiles, consent, lifecycle phase, directory |
| `OrganizationsModule` / `CoordinatorsModule` | CSR partners; coordinator directory |
| `ProgramsModule` | Programmes, discontinuation, programme-level training links, announcements |
| `ActivitiesModule` | Activity definitions, discontinuation, activity-level training links |
| `EventsModule` | Scheduled occurrences, capacity, cancellation |
| `TrainingsModule` | Catalog, materials, questions, attempts, resets, gating |
| `EnrollmentsModule` | Enrollments, conflicts, waitlist |
| `AttendanceModule` | Dispatch, attendance records, event reports, evidence |
| `CertificatesModule` | Per-programme generation, issue, bulk issue, resend |
| `FeedbackModule` | Per-occurrence submissions, tags, analytics, publishing |
| `AnalyticsModule` / `ReportsModule` | Dashboard, exports, scheduled reports |
| `NotificationsModule` | Template rendering, outbox, n8n handoff, status callback |
| `StorageModule` / `PublicModule` | Files and signed URLs; public impact aggregates |

### 7.2 Layering

Controllers → services → repositories → database. Controllers never touch repositories.
Services own transaction boundaries. Any operation spanning more than one table — enroll,
withdraw, cancel event, discontinue programme, issue certificate, submit attendance — runs
inside one `QueryRunner` transaction.

### 7.3 The enrollment service — the most rule-dense component

`EnrollmentsService.enroll(volunteerId, eventId, opts)`, in one transaction:

1. Load the event `FOR UPDATE`. Reject unless `fn_is_event_enrollable(eventId)` — this one call
   covers event status, activity discontinuation, programme discontinuation and past dates.
2. Reject if the volunteer already holds a live enrollment or a waitlist entry.
3. Call `fn_event_prereqs_met(volunteer, event)`. If false, return `409 PREREQUISITES_NOT_MET`
   with the missing trainings from `fn_volunteer_missing_trainings()`, so the UI can render the
   lock state naming exactly what is outstanding.
4. Read `v_event_capacity`. If full and `opts.acceptWaitlist` is set, append at
   `MAX(position) + 1` and return the position; otherwise return `409 ACTIVITY_FULL` carrying
   the position the volunteer *would* take — which is what the waitlist modal displays.
5. Call `fn_volunteer_conflicts(volunteer, event)`. If overlapping and not acknowledged, return
   `409 SCHEDULING_CONFLICT` with the conflicting occurrence. If acknowledged, record it.
6. Insert the `event_enrollments` row.
7. Queue the confirmation email, plus a required-trainings email if any prerequisite is
   outstanding but the gate is not yet enforced.

Withdrawal is the mirror image; `trg_enrollment_cancelled_promote` runs `fn_promote_waitlist`
automatically, and the service reads its return value to queue promotion emails.

### 7.4 Cross-cutting concerns

| Concern | Mechanism |
|---|---|
| Authn | `JwtAuthGuard` global; `@Public()` and `@LinkToken(purpose)` opt out |
| Authz | `RolesGuard` for roles; ownership checks in services |
| Validation | Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Errors | `{ statusCode, code, message, details, traceId }` with stable `code` values |
| Correlation | `traceId` via `AsyncLocalStorage`, echoed in responses and logs |
| Logging | Pino, JSON in production, redacting `password`, `token`, `authorization` |
| Rate limiting | 5/min login, 3/min password reset, 10/min link-token consumption, 100/min default |
| Audit | `@Audited('program.discontinued')` interceptor writing `audit_logs` |
| Idempotency | `Idempotency-Key` honoured on certificate issue and email dispatch |

---

## 8. Frontend design

### 8.1 Design tokens

| Token | Value | MUI mapping |
|---|---|---|
| Ink | `#0f2b2d` | `palette.primary.dark`, app bar |
| Accent | `#d96c3f` | `palette.secondary.main`, CTA gradient start |
| Accent strong | `#bc5328` | `palette.secondary.dark`, eyebrow text |
| Mint | `#8db8a6` | `palette.success.light`, training chips |
| Text main / muted | `#132325` / `#5e6a62` | `text.primary` / `text.secondary` |
| Panel | `rgba(255,252,247,0.82)` | `Paper` + `backdrop-filter: blur(18px)` |
| Success / Info | `#1d6b4d` / `#3a60a0` | Confirmed-passed / waitlist states |
| Body / display font | Space Grotesk / Source Serif 4 600 | `fontFamily` / `h1…h3` |
| Radius | 1rem panels, 999px pills | `shape.borderRadius: 16` + pill button variant |

Fonts are self-hosted via `@fontsource`, so the app has no third-party runtime dependency.

### 8.2 Routing

```
/                                   Public impact page (sign-in at /login)
/register  /admin/login  /impact
/attendance/:token                  Volunteer attendance form   (link token)
/report/:token                      Coordinator event report    (link token)

/app                                VolunteerLayout
   dashboard · events · events/:id · calendar · consent
   trainings · trainings/:id · certificates · feedback · profile

/admin                              AdminLayout
   dashboard · volunteers
   programs · programs/new · programs/:id · programs/:id/edit
   programs/:id/activities/new · activities/:id · activities/:id/edit
   activities/:id/events/new · events/:id/edit
   calendar · trainings · trainings/new · trainings/:id/edit
   trainings/:id/assessments · field-execution
   recognition · recognition/certificates · recognition/feedback
   metrics · reports · reports/scheduled
```

### 8.3 State management

| Kind | Where |
|---|---|
| Server data | TanStack Query, keyed `['programs', filters]`, `['event', id]`, … |
| Auth session | `AuthContext` over an in-memory access token + `httpOnly` refresh cookie |
| Form state | React Hook Form |
| Filter/sort | URL search params, so admin views are shareable |
| Ephemeral UI | Local state; a `SnackbarProvider` replaces the prototype `toast()` |

Enroll, withdraw and waitlist use optimistic updates with rollback.

### 8.4 Shared components

`PageShell`, `FilterBar`, `StatusPill`, `StatTile`, `SlotBar`, `TrainingChip`, `EmailPreview`,
`ConfirmDialog`, `EmptyState`, `AttemptPips`, `StarRating`, `NpsScale`, `ImageDropzone`,
`CertificateCard`, `CalendarGrid`, `QuizQuestion`, `DocumentList`, `OccurrenceList`.

`EmailPreview` shows the operator exactly what will be sent before sending. The API exposes
`POST /…/preview` endpoints that render the real Handlebars template with real data, so the
preview cannot drift from the sent message — which is precisely why templates stay in the API
rather than moving into n8n (§12).

### 8.5 Accessibility

WCAG 2.1 AA. Charts carry a screen-reader table; star rating and NPS are radio groups; quiz
options expose `aria-pressed`; modals trap and restore focus; the calendar is keyboard
navigable; colour is never the sole carrier of meaning.

---

## 9. Data architecture

Full schema in `database/migrations/`; entity reference in `03-data-model.md`; departures from
the v1 model in `06-gap-analysis.md`.

### 9.1 Shape at a glance — 36 tables as designed (37 live: reference_values, V011)

| Group | Tables |
|---|---|
| Identity | `users`, `refresh_tokens`, `access_tokens`, `audit_logs` |
| People | `volunteers`, `organizations`, `coordinators`, `volunteer_consents` |
| **Hierarchy** | **`programs`, `activities`, `events`**, `announcements` |
| Training | `trainings`, `training_materials`, `training_questions`, `training_options`, `program_trainings`, `activity_trainings` |
| Assessment | `training_attempts`, `training_attempt_answers`, `training_attempt_resets` |
| Scheduling | `event_enrollments`, `waitlist_entries` |
| Field | `attendance_dispatches`, `attendance_records`, `event_reports`, `event_photos` |
| Recognition | `certificates`, `feedback_submissions`, `feedback_issues`, `feedback_improvements`, `feedback_option_catalog` |
| Ops | `email_logs`, `scheduled_reports`, `report_runs`, `app_settings` |

### 9.2 Views and functions

| Object | Purpose |
|---|---|
| `v_event_capacity` | Enrolled / waitlisted / spots left / enrollable per occurrence |
| `v_valid_training_passes` | The one definition of "currently holds this training" |
| `v_volunteer_compliance` | Consent + mandatory trainings current |
| `v_event_required_trainings` | The union gate: programme trainings + activity trainings |
| `v_event_attendance` | Attended vs enrolled, hours, beneficiaries, attendance % |
| `v_program_participation` | Per volunteer per programme — the certificate source |
| `v_volunteer_report_summary` | One row per volunteer; backs the Reports table |
| `v_dashboard_kpis` | KPI tiles |
| `fn_is_event_enrollable()` | The three-level discontinuation cascade |
| `fn_event_prereqs_met()` | BR-05 enrollment gate |
| `fn_volunteer_missing_trainings()` | What to name in the "Training Required" state |
| `fn_volunteer_conflicts()` | BR-11 overlap via the generated `time_range` |
| `fn_promote_waitlist()` | BR-10 promotion and renumbering |
| `fn_recompute_volunteer_phase()` | BR-14 lifecycle |

Conflict detection uses a stored generated `events.time_range TSRANGE` with a GiST index, so
overlap is an index-backed `&&` rather than the prototype's O(n²) minute arithmetic.

---

## 10. Business rules catalog

| ID | Rule | Enforced by |
|---|---|---|
| **BR-01** | A CSR volunteer must reference an organization; an Individual may optionally reference one as an affiliation (revised 2026-09-01, V017). | `volunteers_csr_org_chk` |
| **BR-02** | No training content is served until consent is complete. | `v_volunteer_compliance`, service guard |
| **BR-03** | Mandatory compliance trainings are capped at 3 attempts and expire after 12 months. | `trainings_mandatory_chk`, `TrainingsService` |
| **BR-04** | Activity trainings stay locked until all three compliance trainings show a current pass. | `v_volunteer_compliance`, UI lock bar |
| **BR-05** | Enrollment requires every training linked to the occurrence's **programme and activity** to be passed and unexpired. | `fn_event_prereqs_met()` |
| **BR-06** | `spots_left` is always derived, never stored. | `v_event_capacity` |
| **BR-07** | Cancelling an occurrence notifies every enrolled and waitlisted volunteer and blocks further enrollment. | `EventsService.cancel` + queued mail |
| **BR-08** | CSR volunteers receive `corporate` certificates naming the sponsoring organization. | `CertificatesService`, `certificates.cert_type` |
| **BR-09** | One feedback submission per volunteer per **occurrence**. | `feedback_submissions_uq` |
| **BR-10** | A volunteer may only join a waitlist when the occurrence is at capacity. Position 1 is auto-promoted when a seat frees. | `fn_promote_waitlist()` + trigger |
| **BR-11** | Enrolling into a time-overlapping occurrence warns the volunteer, who may override. The override is recorded. | `fn_volunteer_conflicts()`, `conflict_acknowledged` |
| **BR-12** | Adding a document to a mandatory training prompts reset-or-keep. Resets are audited and never delete history. | `is_superseded`, `training_attempt_resets` |
| **BR-13** | An attendance or report link is single-purpose, expires (7 days) and is consumed on submission. | `access_tokens`, `LinkTokenGuard` |
| **BR-14** | Volunteer phase is derived: no consent → Onboarding; consent but incomplete compliance → In Training; fully compliant → Active. | `fn_recompute_volunteer_phase()` |
| **BR-15** | An absent volunteer must supply a reason; a present volunteer must supply hours. | Two check constraints |
| **BR-16** | Only photos flagged public and feedback explicitly published may appear on the public page. | `is_public`, `is_published_testimonial` |
| **BR-17** | **Discontinuing a programme or activity blocks new enrollment on every occurrence beneath it, without cancelling anything or deleting history.** | `fn_is_event_enrollable()` |
| **BR-18** | **A certificate covers a volunteer's whole participation in a programme: hours summed across every occurrence attended.** | `v_program_participation`, `certificates_uq` |

---

## 11. Security design

### 11.1 Authentication

- Passwords hashed with **argon2id** (64 MB, 3 iterations, parallelism 4).
- **Access token**: JWT, 15 minutes, `Authorization` header, held in memory only.
- **Refresh token**: opaque 256-bit value, SHA-256 hashed at rest, `httpOnly; Secure;
  SameSite=Strict` cookie, rotated on every use. Reuse of a rotated token revokes the family.
- **Lockout**: 5 failed attempts locks the account for 15 minutes.
- **No 2FA in v2.0.** The admin login form has no OTP field.

### 11.2 Link tokens — the coordinator door

- Token = 32 random bytes, base64url; only its SHA-256 hash is stored.
- The row records purpose, subject email, target occurrence, expiry and consumption time.
- `LinkTokenGuard` validates purpose, expiry and consumption, then attaches a principal scoped
  to exactly one occurrence.
- Consumption is idempotent within a grace window so a double-submit does not lose data.
- Throttled to 10 verification attempts per minute per IP.

This is the highest-risk surface: an unauthenticated URL that writes data. Mitigations are the
unguessable token, the single purpose, the single target row, the expiry, and an audit entry on
every use.

### 11.3 Webhook security

The API↔n8n boundary is authenticated in **both** directions with
`HMAC-SHA256(VMS_WEBHOOK_SECRET, JSON.stringify(body))` in `X-VMS-Signature`, compared with a
timing-safe equality check. The inbound status callback is the one that matters: without
verification, anyone who could reach the API could mark mail as delivered and suppress a retry.

### 11.4 Data protection

| Concern | Control |
|---|---|
| PII at rest | Volunteer contact details, DOB and consent in Postgres; disk encryption at the volume level |
| PII in transit | TLS 1.2+ at the proxy; HSTS in production |
| PII in logs | Pino redaction; email bodies live in `email_logs`, never stdout |
| Children's data | The system stores **no beneficiary identities** — only aggregate counts in `event_reports`. A deliberate boundary that must stay |
| Uploads | MIME sniffing + extension allowlist; EXIF stripped via Sharp; served through signed 5-minute URLs |
| Retention | Consent and attendance 7 years; refresh tokens purged 30 days post-expiry; `email_logs` bodies truncated at 12 months; evidence images 3 years |
| Deletion | Erasure anonymises `volunteers`/`users` in place, keeping attendance and certificate rows tombstoned |

### 11.5 Application hardening

Helmet with a strict CSP; CORS restricted to the configured origin; CSRF defeated by
`SameSite=Strict` plus a Bearer-only API; parameterised queries throughout; React escaping plus
DOMPurify on the email-preview panes.

---

## 12. Notifications: n8n orchestration

**Every outbound email is delivered by n8n. The API never opens an SMTP connection.**

### 12.1 Division of responsibility

| Concern | Owner | Why |
|---|---|---|
| Deciding a message is due | API | It is a business event |
| Recording the intent | API — `email_logs` | Must be transactional with the cause |
| Rendering subject + HTML | **API** (Handlebars) | Keeps the admin preview byte-identical to the send |
| Delivery, retry, branching | **n8n** | Ops can change it without a deploy |
| Recording the outcome | API, via signed callback | `email_logs` stays the audit trail |

### 12.2 The pipeline

```
1. API   write email_logs row (status = queued), in the same transaction as the cause
2. API   enqueue a BullMQ job carrying only the log id
3. Worker  load row → render Handlebars → POST n8n webhook, HMAC-signed
           status = dispatched
4. n8n   verify HMAC → fetch attachment if any → send via SMTP → build signed callback
5. API   POST /webhooks/n8n/email-status → status = sent | failed, with provider message id
           and the n8n execution id for tracing
```

**Why keep an outbox when n8n has its own retries.** The row is written in the same transaction
as the enrollment or the cancellation that caused it. If n8n is unreachable, the row sits at
`queued` and a sweep retries the handoff. Without it, an n8n outage during an event cancellation
would silently drop notifications to every registrant — the failure mode that matters most.

**Attachments** (certificates, report exports) are passed as a **short-lived signed URL** that
n8n fetches, never as base64 in the webhook body. A bulk certificate run would otherwise push
megabytes through the webhook.

### 12.3 Template catalog

| Key | Trigger | Recipients |
|---|---|---|
| `welcome_verify` | Signup | Volunteer |
| `password_reset` | Reset request | User |
| `registration_confirmed` | Enrollment confirmed | Volunteer |
| `training_required` | Enrollment with outstanding prerequisites | Volunteer |
| `program_announcement` | Admin announce / resend | All opted-in volunteers (bulk) |
| `event_cancelled` | BR-07 | Every enrolled and waitlisted volunteer |
| `activity_discontinued` | BR-17 | Volunteers with upcoming enrollments beneath it |
| `waitlist_promoted` | BR-10 promotion | Promoted volunteer |
| `attendance_volunteer` | Dispatch | Enrolled volunteers, one signed link each |
| `attendance_coordinator` | Dispatch | Event coordinator, one signed link |
| `attendance_reminder` | 24 h after dispatch if unsubmitted | Volunteer / coordinator |
| `certificate_issued` | Issue or bulk issue | Volunteer, PDF attached |
| `feedback_request` | 24 h after an occurrence completes | Attending volunteers |
| `scheduled_report` | Cron | Configured recipients, file attached |
| `compliance_expiring` | 30 days before `expiry_date` | Volunteer |

Bulk sends fan out one `email_logs` row and one n8n call per recipient rather than a single BCC,
so per-recipient delivery state is real and the audit trail is honest.

### 12.4 The sample mailbox

**Mailpit** at `http://localhost:8026` is the validation surface. It accepts every message and
delivers nothing onward, so the real send path can be exercised without mailing volunteers.
Its `GET /api/v1/messages` endpoint is what the E2E suite asserts against — *"cancelling this
occurrence produced exactly N messages, one per registrant"* becomes a real test rather than a
hopeful log line.

Moving to production changes exactly one thing: the SMTP credential inside n8n points at a real
relay instead of Mailpit. No application code changes.

Full contract, setup steps and a copy-paste smoke test are in `n8n/README.md`.

---

## 13. File storage and document generation

### 13.1 Storage abstraction

`StorageService` exposes `put`, `get`, `signedUrl`, `delete` over a driver — `LocalDiskDriver`
(a Docker volume, the default) and `S3Driver` for later. Paths are namespaced:
`training-materials/{trainingId}/…`, `evidence/{eventId}/…`, `certificates/{certificateId}.pdf`,
`reports/{runId}.{ext}`. Downloads go through `GET /files/:id`, which authorizes then redirects
to a signed 5-minute URL.

### 13.2 Certificates

Two Handlebars templates carrying the prototype's design; the corporate variant names the
sponsoring organization. Rendering runs in the worker: Handlebars → HTML → Puppeteer → A4
landscape PDF → storage → `certificates.file_path`. The `certificate_number` is printed for
verification, and because a certificate now covers a whole programme, `events_attended`,
`period_start` and `period_end` are printed with the hours so the figure is auditable.

Bulk issue enqueues one job per certificate and reports progress; the admin screen polls a job
group rather than blocking.

### 13.3 Report exports

PDF reuses the Puppeteer pipeline; Excel uses ExcelJS streaming; CSV uses `fast-csv`. All three
read from the same paginated query so the formats cannot disagree. Exports over 5,000 rows are
queued and delivered by email.

---

## 14. Background jobs and scheduling

| Queue | Job | Cadence |
|---|---|---|
| `email` | Render and hand one message to n8n | On demand |
| `email` | **`outbox-sweep`** — retry rows stuck at `queued`/`dispatched` | Every 2 minutes |
| `pdf` | Certificate render | On demand |
| `report` | Ad-hoc or scheduled export | On demand + cron |
| `maintenance` | `compliance-expiry-sweep` | Daily 02:00 IST |
| `maintenance` | `attendance-reminder-sweep` | Daily 09:00 IST |
| `maintenance` | `feedback-request-sweep` | Daily 10:00 IST |
| `maintenance` | `token-cleanup` | Daily 03:00 IST |
| `maintenance` | `event-status-sweep` — move past `upcoming` occurrences to `completed` | Hourly |
| `report` | `scheduled-report-dispatch` | Every 5 minutes |

Scheduled reports store frequency + send time + timezone rather than a cron expression, so the
next run is computable, displayable and correct across IST. All maintenance jobs are idempotent.

---

## 15. Reporting and analytics

### 15.1 Dashboard

One request — `GET /analytics/dashboard?period=&programId=&city=` — returns the KPI block and
every chart series. Filters are real SQL predicates; the prototype's pre-baked per-filter
datasets cannot survive live data.

| Chart | Source |
|---|---|
| Volunteers by gender / category / phase | `volunteers` |
| Programme and occurrence status | `programs`, `events` |
| Volunteer growth | `volunteers.created_at` by month |
| Monthly volunteer hours | `attendance_records.hours_contributed` by month |
| Beneficiaries impacted | `event_reports.beneficiaries_reached` by month |
| Attendance: enrolled vs attended | `v_event_attendance` rolled up to programme |
| Feedback rating distribution | `feedback_submissions.overall_rating` |
| Training completion rate | `v_valid_training_passes` over eligible volunteers |

### 15.2 Performance

At target scale these run in tens of milliseconds against the V00* indexes. Past roughly 100k
attendance rows, the daily maintenance window materialises `mv_dashboard_daily` — a deliberate
"later, if measured" step.

---

## 16. Non-functional requirements

| Attribute | Target |
|---|---|
| Concurrent users | 200 (150 volunteer, 50 admin) |
| Data volume (year 3) | 5,000 volunteers · 50 programmes · 300 activities · 3,000 occurrences · 100,000 attendance rows |
| API latency | p95 < 300 ms reads, < 800 ms writes (excludes queued PDF/export) |
| Dashboard load | < 2 s to first chart |
| Email delivery | 95% dispatched to n8n within 30 s of the triggering action |
| Availability | 99.5% during 08:00–22:00 IST |
| RPO / RTO | 24 h / 4 h (5 min RPO with WAL archiving) |
| Browsers | Last 2 versions of Chrome, Edge, Firefox, Safari |
| Responsive | 360 px – 1920 px; the attendance form is mobile-first |
| Accessibility | WCAG 2.1 AA |
| Bundle size | < 300 KB gzipped initial |

---

## 17. Environments and deployment

| Environment | Data | Mail |
|---|---|---|
| Local | `SEED_DEMO_DATA=true` | n8n → Mailpit |
| CI | Ephemeral (Testcontainers) | n8n stubbed; Mailpit asserted against |
| UAT | Anonymised copy | n8n → Mailpit, or a real relay to a test domain |
| Production | Live | n8n → real SMTP relay |

Production differs in four ways: `BUILD_TARGET=production`, `SEED_DEMO_DATA=false`, n8n's SMTP
credential points at the real relay, and `adminer`/`mailpit` are absent. Keeping the topology
otherwise identical means a UAT failure is reproducible locally.

Deployment is `git pull && docker compose --profile app up -d --build`, with migrations applied
by an init container that exits before `api` starts. Rollback is a redeploy of the previous
image tag; migrations are additive and forward-only, so the previous version keeps working.

**n8n deployment notes.** Keep `N8N_ENCRYPTION_KEY` stable per environment — changing it makes
stored credentials unreadable. Never expose port 5678 publicly. Export any workflow change back
into `n8n/workflows/` so a rebuilt instance is reproducible.

---

## 18. Observability, backup and recovery

**Health**: `GET /health` and `/health/ready` (DB, Redis, n8n reachability).

**Metrics**: `/metrics` in Prometheus format — request duration by route, queue depth and
outcomes, **email dispatch success rate and outbox backlog**, DB pool saturation.

**Alerts worth wiring first**: outbox backlog above 50 for 5 minutes, email failure rate above
10%, n8n webhook unreachable, any failed migration, disk above 85%.

**Backups**: nightly `pg_dump --format=custom` off-host, 30 daily + 12 monthly. The n8n database
is backed up alongside — it holds workflow definitions and credentials. Uploads volume synced
nightly. **The restore is rehearsed quarterly**; runbook in `docs/runbooks/restore.md`.

---

## 19. Testing strategy

| Level | Tool | Target | What it protects |
|---|---|---|---|
| Unit (API) | Jest | 80% services | Rule branches, especially BR-05, BR-10, BR-11, BR-17 |
| Integration | Jest + Testcontainers | Repositories and DB functions | `fn_promote_waitlist` under concurrent withdrawal; the discontinuation cascade |
| Contract | Supertest vs OpenAPI | Every endpoint | Response drift |
| **Email** | Playwright + **Mailpit API** | Every template | That the message was actually delivered, to whom, with what subject |
| Unit (Web) | Vitest + RTL | 70% components | Locked / full / waitlisted / conflicting / discontinued states |
| E2E | Playwright | 13 journeys | Below |
| Migration | CI | Every migration | Clean apply to empty and production-shaped databases |
| Load | k6 | Announcement blast, dashboard, enroll storm | The three things that break first |
| Security | npm audit, Trivy, ZAP | Per release | Dependency and container CVEs |

**The thirteen E2E journeys**: signup→consent→compliance→enroll; enroll into a full
occurrence→waitlist→someone withdraws→auto-promotion; conflicting slot→warn→override; exhaust
three attempts→blocked→admin reset→retake; admin creates programme→activity→two
occurrences→announces; cancel an occurrence→all registrants mailed *(asserted in Mailpit)*;
**discontinue a programme→its future occurrences stop accepting enrollment→history intact**;
dispatch attendance→volunteer submits via link→coordinator submits report; issue a per-programme
certificate→volunteer downloads the PDF; bulk-issue; submit feedback→appears in analytics;
scheduled report fires→email arrives; public page shows only published content.

---

## 20. Decisions log and open risks

### 20.1 Decisions taken

| # | Question | Decision | Date |
|---|---|---|---|
| Q1 | Is an admin volunteer directory in scope? | **Yes** — built in Phase 2 | 2026-08-18 |
| Q2 | Programme/activity/event modelling | **Program → Activity → Event**, with discontinuation at programme and activity level. §2 | 2026-08-18 |
| Q3 | Controlled skills vocabulary? | **No** — free text for v2.0; normalised skills is a fast-follow | 2026-08-18 |
| Q4 | `vol_again` option set | **Definitely / Probably / Not sure / Unlikely** (the prototype's set) | 2026-08-18 |
| Q5 | Who publishes a testimonial? | **Admin-only, explicit flag.** Recommend adding a consent checkbox to the feedback form | 2026-08-18 |
| Q6 | Evidence image retention | **3 years**, then deleted with report metadata retained | 2026-08-18 |
| Q7 | Coordinator roster access | **No roster access** in v2.0 | 2026-08-18 |
| Q8 | Admin 2FA | **Not built in v2.0** | 2026-08-18 |
| A | Certificate grain | **Per programme**, hours summed across occurrences attended (BR-18) | 2026-08-18 |
| B | Feedback grain | **Per event occurrence** | 2026-08-18 |
| C | Enrollment grain | **Per event occurrence only**; no programme-level registration table | 2026-08-18 |
| D | n8n template ownership | **API renders, n8n delivers** — preserves preview fidelity | 2026-08-18 |

### 20.2 Risks

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | Waitlist promotion races under concurrent withdrawals. | High | `fn_promote_waitlist` row-locks the event; integration test drives concurrent withdrawals. |
| R2 | Puppeteer bloats the worker image and can leak Chromium processes. | Medium | Pooled single browser, page per job, hard timeout, memory limit, restart policy. |
| R3 | **n8n becomes a single point of failure for all notification.** | **High** | The outbox means nothing is lost, only delayed; `outbox-sweep` retries; alert on backlog. Accepted: while n8n is down, no mail goes out. |
| R4 | **n8n workflow edited in the UI and never exported** — the repo copy silently diverges. | Medium | Workflows are version-controlled; a Phase 8 check diffs the live workflow against the file. Cultural, not technical. |
| R5 | Signed attendance links forwarded or leaked. | Medium | Single purpose, single target, 7-day expiry, consumption marking, audit on use. |
| R6 | Compliance expiry silently deactivates a volunteer mid-programme. | Medium | 30-day warning; expiry checked at enrollment, not on event day, so nobody is locked out on the day. |
| R7 | **The Program/Activity/Event rename confuses anyone reading the prototype alongside the build.** | Medium | §2.1 mapping table; the prototype is a design reference only, never a spec for naming. |
| R8 | Free-text `skills` prevents real volunteer-to-activity matching. | Low now | Flagged; normalised skills is a fast-follow. |

### 20.3 Still open

| # | Question | Working assumption |
|---|---|---|
| O1 | When a programme is discontinued, should its already-scheduled future occurrences be auto-cancelled, or left for the admin to cancel individually? | **Left to the admin.** Discontinuation blocks new enrollment; cancelling is a separate, explicit act because it emails people. |
| O2 | Can one activity's occurrences have different coordinators? | **Yes** — coordinator is per occurrence, with an optional programme default. |
| O3 | Should a certificate be re-issuable after further participation in the same programme? | **Yes**, as a reissue: hours recomputed, `period_end` extended, `resend_count` incremented. Confirm this is what Parinaam wants. |

---

## Companion documents

| Document | Contents |
|---|---|
| `02-implementation-plan.md` | Nine phases, deliverables, acceptance criteria |
| `03-data-model.md` | Entity-by-entity reference |
| `04-api-specification.md` | REST endpoint catalog |
| `05-screen-inventory.md` | Prototype screens mapped to routes, endpoints and phases |
| `06-gap-analysis.md` | Prototype vs v1 model: gaps, deviations, decisions |
| `../n8n/README.md` | Email orchestration contract, setup, smoke test |
