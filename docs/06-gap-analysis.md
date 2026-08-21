# Gap Analysis — Prototype vs v1 Data Model

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 2026-08-18 |
| **Inputs** | `VMS_prototype_v2.html`, `VMS_database_model.md` v1.0 |
| **Changes in this revision** | D-00 (the Program → Activity → Event remodel), G-19 (n8n delivery), plus the client decisions of 2026-08-18 |

> **Status (2026-08-21):** implementation is complete — all findings below were resolved
> during the eight phases or the post-MVP rounds (`07-post-mvp-refinements.md`). This
> document is retained as the design-time record.

This document reconciles the two source artefacts. It records three kinds of finding:

- **G — Gap**: the prototype demonstrates behaviour the v1 data model cannot store.
- **D — Deviation**: v2 deliberately departs from the v1 model, with a reason.
- **C — Conflict**: the two sources disagree, and a decision was made.

Everything here is already reflected in `database/migrations/`.

---

## 0. The structural remodel — D-00

**This supersedes much of what follows.** Read it first.

### v1 and the prototype

Two levels, with the lower one carrying both definition and schedule:

```
events      (dated)   "Community Health Camp", 15 Jul 2026
  └ activities (dated) "Blood Pressure Screening", 09:00, Block A, 5 slots
```

### v2, per the client decision of 2026-08-18

Three levels, with time-boundedness pushed to the bottom:

```
programs      (NOT dated)   "Community Health Camp"
  └ activities (NOT dated)  "Blood Pressure Screening"   — definition, skill, trainings
      └ events   (DATED)    15 Jul 09:00 · 19 Aug 09:00  — occurrences, capacity, attendance
```

**What this buys.** A recurring activity becomes expressible. Under v1, running Blood Pressure
Screening monthly meant duplicating the activity row twelve times, each with its own copy of the
training links, skill requirement and outcome text — and any correction had to be applied twelve
times. Under v2 the definition exists once and each run is a lightweight occurrence.

**What it costs.** An extra screen layer for admins (mitigated by the schedule-a-series helper),
and a terminology collision: "Event" now means the occurrence, the opposite of the prototype's
usage. Every document, route and table name has been updated; the mapping table lives in
`01-design-document.md` §2.1.

### Table-level consequences

| v1 / prototype | v2 | Note |
|---|---|---|
| `events` (dated container) | `programs` | Dates removed; `status` gains `discontinued` |
| `activities` (dated unit) | `activities` (undated) **+** `events` (dated) | The split |
| `activities.date/time/location/max_slots` | moved to `events` | Activity keeps `default_*` seeds |
| `event_trainings` | `program_trainings` | Same role, renamed level |
| `activity_trainings` | unchanged | Now the role/skill gate |
| `volunteer_event_registrations` | **removed** | Decision C — enrollment is per occurrence only |
| `activity_enrollments` | `event_enrollments` | Now points at the occurrence |
| `waitlist_entries.activity_id` | `.event_id` | Queues are per occurrence |
| `attendance_records.activity_id` | `.event_id` | Attendance is per occurrence |
| `activity_reports` | `event_reports` | One report per occurrence |
| `certificates.event_id` | `.program_id` | Decision A — per programme, hours summed |
| `feedback_submissions.event_id` | `.event_id` (now the occurrence) | Decision B — per occurrence |
| `event_announcements` | `announcements` | `program_id` required, `event_id` optional |
| — | `fn_is_event_enrollable()` | New: the three-level discontinuation cascade |
| — | `v_program_participation` | New: the certificate source |
| — | `v_event_required_trainings` | New: the programme ∪ activity gate |

### Why enrollment has no programme-level row

The v1 model had `volunteer_event_registrations` as an event-level aggregate governing spot
count, plus per-activity enrollments. With capacity now living on the occurrence, that aggregate
had nothing left to govern — it would have been a second place to record "this person is
involved", drifting from the enrollment rows that actually mean it. Participation is derived
instead, by `v_program_participation`. This is the same reasoning as D-07.

---

## 1. Gaps — prototype behaviour with nowhere to live in v1

### G-01 · Coordinator activity occurrence report

**Prototype** The coordinator attendance screen collects activity status (completed / partial /
postponed / cancelled), actual start and end times, volunteers present, beneficiaries reached,
highlights, challenges and additional notes.

**v1 model** No table. `attendance_records` is per-volunteer only.

**Impact** High. `beneficiaries_reached` is the source of the "Beneficiaries Impacted" KPI and
the "3,800+ beneficiaries reached" figure on the public impact page. Without this table, two
headline metrics have no origin.

**Resolution** New table `activity_reports`, one row per activity, added in `V006`. The
beneficiary KPI in `v_dashboard_kpis` reads from it.

---

### G-02 · Volunteer attendance detail

**Prototype** Arrival time, departure time, free-text notes, and — when absent — a reason from a
fixed list plus optional detail.

**v1 model** `attendance_records` has only `attended`, `hours_contributed`, `notes`.

**Impact** Medium. Hours cannot be verified, and absence patterns cannot be analysed.

**Resolution** `attendance_records` gains `arrival_time`, `departure_time`, `absence_reason`
(new enum matching the prototype's six options), `absence_detail` and `source`. Two check
constraints encode BR-15: absent requires a reason, present requires hours.

---

### G-03 · Evidence image uploads

**Prototype** Both attendance forms accept up to two optional evidence images.

**v1 model** `event_photos` exists but has no link to an attendance record or a coordinator
report, and no public/private distinction.

**Impact** Medium. Evidence would be indistinguishable from gallery photos, and private field
photos could leak onto the public impact page.

**Resolution** `event_photos` gains `activity_report_id`, `attendance_record_id`, `source`
(admin_upload / coordinator_report / volunteer_attendance), `is_public`, `thumbnail_path`,
`mime_type`, `file_size_bytes`. Default `is_public = false`; publishing is an explicit admin act
(BR-16).

---

### G-04 · Attendance email dispatch state

**Prototype** The Field Execution table tracks, per activity, whether the volunteer email and
the coordinator email have been sent, when, and offers Resend.

**v1 model** `email_logs` records individual sends but cannot answer "has this activity been
dispatched?" without a fragile aggregate query, and cannot express "sent to volunteers but not
yet to the coordinator".

**Resolution** New table `attendance_dispatches`, one row per activity, holding both flags,
both timestamps and both send counts. `email_logs` remains the per-message audit trail.

---

### G-05 · Signed access links for people without accounts

**Prototype** Both attendance forms are reached from an emailed "secure link". Coordinators have
no login by design.

**v1 model** No token table. The model states coordinators are not system users but provides no
mechanism for them to act.

**Impact** High. This is the mechanism the whole field-execution module depends on.

**Resolution** New table `access_tokens` storing only a SHA-256 hash, with purpose, target
activity, subject email, expiry and consumption timestamp. Backs BR-13.

---

### G-06 · Announcement tracking

**Prototype** `ANNOUNCEMENTS[eventId] = { sentDate, resendCount }` drives the Announce/Resend
button label and the "previously sent" line.

**v1 model** Only `email_logs`.

**Resolution** New table `event_announcements`, one row per broadcast, with subject, body
snapshot, recipient count and sender. The first row is the announcement; later rows are resends.

---

### G-07 · Training material files

**Prototype** Materials are mock objects with a name, type and size. Real usage needs upload,
storage, download and change detection.

**v1 model** `training_materials` stores display metadata only — no `file_path`, no MIME type,
no hash.

**Resolution** Added `file_path`, `mime_type`, `file_size_bytes`, `content_hash`, `uploaded_by`,
`uploaded_at`. `file_size` renamed to `file_size_text` to make its display-only nature explicit.

---

### G-08 · Assessment reset and content versioning

**Prototype** Two distinct reset paths: an admin resets one volunteer's attempts from the
assessment table, and adding a document to a mandatory training prompts "reset assessments or
keep existing scores?".

**v1 model** No mechanism. Deleting `training_attempts` rows would destroy the audit trail that
makes a 3-attempt cap meaningful.

**Resolution** `training_attempts.is_superseded` (soft invalidation, history preserved),
`trainings.content_version` (bumped on material change), `training_attempts.content_version`
(what the attempt was taken against), and a new `training_attempt_resets` audit table.
`v_valid_training_passes` ignores superseded rows. Backs BR-12.

---

### G-09 · Quiz answer detail

**Prototype** After submission the volunteer sees each question with their choice marked correct
or incorrect.

**v1 model** `training_attempts` stores only the aggregate score.

**Resolution** New table `training_attempt_answers`. Also makes it possible to identify
questions that everyone fails — useful for training quality review.

---

### G-10 · Scheduled report execution history

**Prototype** Shows scheduled reports with pause/resume/remove, but no run history.

**v1 model** `scheduled_reports` has no `last_run_at`, `next_run_at`, filters or timezone, and
no execution log.

**Resolution** Added `last_run_at`, `next_run_at`, `timezone`, `filters JSONB`, `created_by`;
new `report_runs` table records every execution with status, row count, file path and error.

---

### G-11 · Admin 2FA — *closed, not built*

**Prototype** The admin login form has an optional 2FA code field.

**v1 model** `users` has no MFA columns.

**Decision (2026-08-18, Q8)** **Not built in v2.0.** The OTP field is removed from the admin
login screen and no MFA columns exist on `users`. Reinstating it later is a two-column additive
migration plus one auth endpoint — deliberately kept cheap rather than carried as dead schema.

---

### G-12 · Session and credential lifecycle

**Prototype** N/A (no real auth).

**v1 model** No refresh token storage, no lockout state, no password reset.

**Resolution** New `refresh_tokens` table with rotation and family revocation; `users` gains
`is_active`, `last_login_at`, `failed_login_count`, `locked_until`, `email_verified_at`.
Password reset uses `access_tokens` with purpose `password_reset`.

---

### G-13 · Audit trail

**Prototype** N/A.

**v1 model** None.

**Impact** Medium-high for an organisation handling POCSO/POSH obligations. "Who reset this
volunteer's compliance attempts, and when?" must be answerable.

**Resolution** New `audit_logs` table with actor, action, entity, before/after JSONB and IP.

---

### G-14 · Public impact page content control

**Prototype** Hard-coded gallery images and testimonials.

**v1 model** No flag distinguishing publishable content.

**Resolution** `event_photos.is_public` and `feedback_submissions.is_published_testimonial`,
both default false. BR-16.

---

### G-19 · Email delivery has no owner

**Prototype** Every email is a `<div class="email-preview">` — a picture of a message, never a
message. Nothing is dispatched, retried or recorded.

**v1 model** `email_logs` records recipient, subject and `sent_at`, implicitly assuming every
send succeeds. There is no queued state, no failure state, no retry count, and no notion of who
performs the send.

**Client direction (2026-08-18)** All email notification is orchestrated by **n8n**.

**Resolution** A three-part design:

1. **`email_logs` becomes a transactional outbox.** The row is written in the same transaction
   as the business event that caused it, *before* anything is sent. `status` moves
   `queued → dispatched → sent | failed | bounced`.
2. **n8n owns delivery.** The API renders the template and hands subject + HTML to a signed
   webhook; n8n verifies the HMAC, sends via SMTP, and calls back with the outcome. New columns
   `n8n_workflow`, `n8n_execution_id`, `dispatched_at`, `provider_message_id`, `error_message`,
   `attempt_count` make a message traceable from the business event into the n8n execution log.
3. **Templates stay in the API.** This preserves the prototype's genuinely good idea — the
   operator sees exactly what will be sent before sending — because the preview endpoint renders
   the same Handlebars template the send uses. Moving templates into n8n would let staff reword
   emails without a deploy, but breaks that guarantee. Recorded as decision D.

**Residual risk** n8n becomes a single point of failure for all notification (risk R3). The
outbox means nothing is *lost*, only delayed; an `outbox-sweep` job retries the handoff and the
backlog is alerted on.

---

### G-20 · No way to validate that mail actually arrives

**Prototype** N/A — nothing is sent, so nothing needs checking.

**Problem** "The log says sent" is not evidence. For an event cancellation that must reach every
registrant (BR-07), the interesting assertion is *how many messages actually arrived, and to
whom*.

**Resolution** **Mailpit** ships in the stack as a sample mailbox: it accepts every message and
delivers nothing onward. Its UI (`http://localhost:8026`) is where a human validates delivery,
and its `GET /api/v1/messages` search API is what the E2E suite asserts against. Moving to
production changes one thing — n8n's SMTP credential points at a real relay instead — with no
application code change.

MailHog was the obvious choice and was rejected: unmaintained since 2020, and it has no message
search API, so the tests would have had nothing to assert on.

---

### G-15 · Volunteer email preferences

**Prototype** The announcement email footer offers "update your preferences in your profile".

**v1 model** No opt-out field.

**Resolution** `volunteers.email_opt_in`. Announcements respect it; transactional messages
(cancellation, attendance, certificates) do not, since they are operationally necessary.

---

### G-16 · Activity type

**Prototype** The Add Activity form has an In person / Online radio, independent of the event's
type — a hybrid event can have online and in-person activities.

**v1 model** `activities` has no `type`; only `events` does.

**Resolution** `activities.type` added, defaulting to the parent event's type at creation.

---

### G-17 · Multi-day events

**Prototype** Not exercised, but the v1 model's `activities.date` note says it "may differ from
event.date for multi-day events" while `events` has only a single `date`.

**Resolution** `events.end_date` added, nullable. Activity dates are validated against
`[date, end_date]` when `end_date` is set. See open question Q2.

---

### G-18 · Event and activity draft state

**Prototype** The Add Activity form has "Save as Draft"; the events list filters by a `draft`
status.

**v1 model** `events.status` includes `draft`, but `activities` has no equivalent.

**Resolution** `activities.is_draft` added.

---

## 2. Deviations — deliberate departures from the v1 model

### D-01 · UUID primary keys throughout

**v1** Mixed: `UUID/SERIAL` for users and volunteers, `SERIAL` for events, `VARCHAR(20)` for
activities and trainings, `VARCHAR(10)` for certificates, `VARCHAR(30)` for scheduled reports.

**v2** `UUID DEFAULT gen_random_uuid()` for every table, with an optional human-readable `code`
column where the business uses one: `events.code`, `activities.code` ('a1'), `trainings.code`
('tc1'), `certificates.certificate_number`.

**Reason** Three of them. Sequential integer ids in the tokenised attendance URLs would let
anyone enumerate activities. Short string ids like `'a1'` are not generatable safely under
concurrency — the prototype used `"a-new-" + Date.now()`. And a single key type removes a whole
class of join and mapping mistakes.

**Cost** Slightly larger indexes and less readable ad-hoc SQL. The `code` columns mitigate the
second. At the projected scale the first is immaterial.

---

### D-02 · `activities.time` renamed to `start_time`, plus a generated `time_range`

`time` is a reserved-adjacent word and reads ambiguously. More importantly, v2 adds a stored
generated `TSRANGE` column with a GiST index, so BR-11 conflict detection is an index-backed
overlap operator rather than the prototype's pairwise minute arithmetic.

---

### D-03 · `attendance_records.hours_contributed` becomes conditionally required

v1 allows NULL unconditionally. v2 requires it whenever `attended = true` (BR-15), because an
attendance record with no hours cannot contribute to the hours KPI or a certificate, and
silently counts as zero.

---

### D-04 · `volunteers.category` / `organization_id` consistency is enforced

v1 describes the relationship in prose ("set when category = 'CSR'"). v2 enforces it with
`volunteers_csr_org_chk`. Prose rules drift; constraints do not.

---

### D-05 · `events.status` gains `completed`

**v1** `('upcoming','draft','cancelled')`.

**Conflict** The prototype's dashboard charts an "Event Status Breakdown" containing
**Completed** and **Planned**, and reports "12 events conducted" — neither of which the v1 enum
can represent. An event that has happened cannot stay `upcoming` forever.

**v2** `('draft','upcoming','completed','cancelled')`. An hourly sweep moves past events to
`completed`. The prototype's "Planned" is mapped onto `draft`.

---

### D-06 · `activities.is_discontinued` supplemented by `is_draft`

See G-18.

---

### D-07 · Waitlist state removed from `activity_enrollments.status`

**v1** `activity_enrollments.status ENUM('enrolled','waitlist','cancelled')` **and** a separate
ordered `waitlist_entries` table.

**Problem** The same fact in two places. A volunteer could be `status = 'waitlist'` with no
`waitlist_entries` row, or hold position 3 while their enrollment says `enrolled`. Keeping them
consistent requires dual writes in every path.

**v2** `enrollment_status ENUM('enrolled','cancelled')`. Waiting volunteers exist **only** in
`waitlist_entries`. Promotion inserts an enrollment and deletes the waitlist row inside one
transaction (`fn_promote_waitlist`). One fact, one place.

---

### D-08 · `registration_status` gains `cancelled`

v1 has `('confirmed','pending')`. When an event is cancelled or a volunteer withdraws from every
activity in an event, the registration needs a terminal state that is not "pending forever".

---

### D-09 · `feedback_submissions.vol_again` option set changed

**v1** `('Definitely','Probably','Unlikely','No')`.
**Prototype** Definitely, Probably, **Not sure**, Unlikely.

**Decision** Adopt the prototype's set. It is what users will actually see, and "Not sure" and
"No" measure different things. Recorded as open question Q4 for confirmation.

---

### D-10 · Feedback tag labels moved into a catalog table

v1 stores free strings in `feedback_issues.issue_label`. The prototype hard-codes sixteen
checkbox options. v2 adds `feedback_option_catalog` so admins can edit the options without a
deploy, while the child tables still store the label text — which keeps historical submissions
readable even if an option is later renamed or retired.

---

### D-11 · `coordinators` gains `is_active`, `created_at`, `updated_at` and a unique email

v1 has four columns and no uniqueness on email. Since the coordinator's email is the address
attendance links are sent to, duplicates are an operational hazard.

---

### D-12 · `email_logs` extended into a real dispatch record

v1 records recipient, subject and `sent_at` — implicitly assuming every send succeeds. v2 adds
`status`, `template_key`, `body_snapshot`, `provider_message_id`, `error_message`,
`attempt_count`, `queued_at`, plus `volunteer_id` and `coordinator_id` foreign keys. A queued
message now has a row before it is sent, which is what makes retry and dead-lettering possible.

---

### D-13 · Certificates gain a number, a file path and a resend count

v1 has `issued` and `issued_at`. The prototype supports Resend and shows a downloadable PDF.
v2 adds `certificate_number` (printed, unique, verifiable), `file_path`, `resend_count`,
`issued_by` and `organization_id` (denormalised for the corporate template).

---

### D-14 · `volunteer_consents` gains evidentiary fields

v1 records three booleans and a date. A consent that may be relied upon in a POCSO or POSH
matter should record what was signed and by whom, from where. v2 adds `signed_name`,
`consent_version`, `ip_address`, `user_agent`.

---

### D-15 · `volunteer_phase` gains `Inactive`

v1 has three phases. A volunteer who leaves, or whose account is deactivated, needs a state
that the phase-recomputation function will not overwrite.

---

### D-16 · `events` gains `city`

Denormalised from `location` because the dashboard and reports both filter by city (Mumbai /
Pune / Bengaluru in the prototype), and parsing a city out of a free-text venue string is not
something to do at query time.

---

## 3. Conflicts resolved

| # | Prototype says | v1 model says | Decision |
|---|---|---|---|
| C-01 | Compliance trainings are `tc1`/`tc2`/`tc3` (POCSO, POSH, NDA) with `mandatory: true`; separately, `t1`, `t3`, `t5` have `category: 'compliance'` but are not mandatory. | `is_mandatory` is "TRUE for POCSO, POSH, NDA". | Both preserved. `category` describes subject matter; `is_mandatory` describes gating. The three mandatory rows are seeded as reference data in `S001`. |
| C-02 | Volunteer registration collects name, gender, DOB, city, state and a compliance checkbox. | `volunteers` additionally has phone, category, organization_id and phase. | The registration form is extended to collect phone and category (with a conditional organization picker). `phase` remains system-derived. |
| C-03 | Signup collects a single "Full Name". | `volunteers` has `first_name` and `last_name`, both NOT NULL. | The registration step collects them separately; the signup step's single field is dropped in favour of email + password only. |
| C-04 | Certificates are issued to "TechCorp India Pvt. Ltd." as though the company were a volunteer. | Certificates reference `volunteer_id`; corporate type is derived from the volunteer's CSR category. | Corporate certificates are issued to a **CSR volunteer** and the template prints the sponsoring **organization's** name. The demo seed models this as volunteer Ravi Kulkarni of TechCorp India. |
| C-05 | `max_attempts` is a constant 3 in the UI. | `max_attempts` is a nullable per-training column. | Column retained as the authority; `app_settings.compliance.max_attempts` supplies the default for new mandatory trainings. |
| C-06 | Quiz answers are checked in the browser (`q.answer` is in the client payload). | N/A | Scoring moves entirely server-side. The start-attempt response omits correct indexes. This is a security fix, not a preference. |
| C-07 | `spotsLeft` is a stored field on the event object and drifts from the volunteer list. | BR-06: never store it. | The v1 rule wins. `v_event_capacity` and `v_activity_capacity` are the only sources. |
| C-08 | Activity id generation: `"a-new-" + Date.now()`. | `VARCHAR(20)` primary key. | Superseded by D-01. |

---

## 4. Items intentionally not carried forward

| Prototype element | Why not |
|---|---|
| `#proto-bar`, breadcrumb strip, Restart button | Prototype chrome. The breadcrumb concept survives as a router-driven component; the bar does not. |
| `sessionStorage` assessment tracker | Replaced by `training_attempts`. |
| `MOCK_VOL_ASSESSMENTS`, `DASH_DATA`, `REPORT_VOLUNTEERS`, `FIELD_ACTIVITIES` | Hard-coded fixtures. Replaced by real queries; equivalent content lives in `S002__demo_data.sql`. |
| Per-filter pre-baked dashboard datasets and `LOCATION_OVERRIDES` | Replaced by real SQL predicates. Pre-baked datasets cannot survive live data. |
| `DOC_PREVIEW_CONTENT` fake document previews | Replaced by real file serving with an in-browser PDF viewer. |
| `addMockMaterial()` random file generator | Replaced by real upload. |
| Repeated monkey-patching of `showScreen` | Replaced by the router. |
| Hard-coded gallery gradients and testimonials on the impact page | Replaced by public `event_photos` and published feedback. |

---

## 5. Client decisions of 2026-08-18

| Ref | Question | Decision |
|---|---|---|
| Q1 | Admin volunteer directory in scope? | **Yes** — Phase 2 |
| Q2 | Programme/activity/event modelling | **Program → Activity → Event**, both upper levels discontinuable. See D-00 |
| Q3 | Controlled skills vocabulary? | No — free text for v2.0 |
| Q4 | `vol_again` option set | The prototype's four options |
| Q5 | Testimonial publishing | Admin-only, explicit flag |
| Q6 | Evidence image retention | 3 years |
| Q7 | Coordinator roster access | None in v2.0 |
| Q8 | Admin 2FA | **Not built.** See G-11 |
| A | Certificate grain | **Per programme**, hours summed across occurrences (BR-18) |
| B | Feedback grain | **Per event occurrence** |
| C | Enrollment grain | **Per event occurrence only**; no programme-level registration |
| D | n8n template ownership | **API renders, n8n delivers** — preserves preview fidelity |

Three questions remain open; they are tracked in `01-design-document.md` §20.3 and none of them
blocks Phase 0 or Phase 1.

---

## 6. Summary

| Category | Count |
|---|---|
| Structural remodel | 1 (D-00 — the hierarchy) |
| Gaps closed with new tables | 10 (`event_reports`, `attendance_dispatches`, `access_tokens`, `announcements`, `training_attempt_answers`, `training_attempt_resets`, `report_runs`, `audit_logs`, `refresh_tokens`, `feedback_option_catalog`) |
| Gaps closed with new columns | 11 |
| Deliberate deviations | 17 |
| Conflicts resolved | 8 |
| Prototype elements dropped | 9 |

**Net schema**: 25 tables in v1 → **36 tables** in v2, plus 8 views and 6 business functions.

Growth is concentrated in four places the v1 model did not cover:

- **The hierarchy** — separating what the work *is* from when it *happens*.
- **Field execution** — the coordinator report, and the signed-link mechanism that lets someone
  without an account submit it.
- **Assessment integrity** — per-answer detail, content versioning, reset auditing.
- **Operational plumbing** — sessions, the email outbox and its n8n handoff, report runs, audit.

None of it is speculative: every addition traces to a specific prototype behaviour, a stated
business rule, or a client decision recorded above.
