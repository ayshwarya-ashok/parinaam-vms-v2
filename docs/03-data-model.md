# Data Model Reference — v2

| | |
|---|---|
| **Version** | 2.1 |
| **Date** | 2026-08-18 |
| **Engine** | PostgreSQL 16 |
| **DDL** | `database/migrations/V001`–`V009` — those files are the source of truth; this document explains them. |
| **Predecessor** | `VMS_database_model.md` v1.0. Departures catalogued in `06-gap-analysis.md`. |

---

## 0. The central structure

```
programs            (no dates)      "Community Health Camp"
   └── activities   (no dates)      "Blood Pressure Screening"
          └── events (DATED)        15 Jul 2026, 09:00, Block A, 5 slots
                                    19 Aug 2026, 09:00, Block A, 5 slots
                                          ▲
                                          └── volunteers enroll HERE
```

Everything that happens on a day — enrollment, capacity, waitlist, coordinator, attendance,
evidence, the occurrence report, feedback — attaches to `events`. Everything that describes the
*work* — name, skill, outcome, training requirements — attaches to `activities` and `programs`.

Certificates are the one deliberate exception: they attach to `programs`, because a certificate
recognises a volunteer's whole contribution to an initiative, not one morning of it.

---

## Conventions

- Primary keys are `UUID DEFAULT gen_random_uuid()`. Human-readable `code` columns carry the
  identifiers people say out loud: `PRG-2026-001`, `ACT-001`, `EVT-2026-0012`, `PAR-2026-000007`.
- Email columns are `CITEXT`.
- Timestamps are `TIMESTAMPTZ`; calendar dates and clock times are `DATE` / `TIME`.
- Tables updated in place carry `updated_at` maintained by the `set_updated_at()` trigger.
  Append-only tables (attempts, logs, announcements) do not.
- Deletes are `RESTRICT` where history must survive (coordinators on events), `CASCADE` where the
  child has no independent meaning (options under a question, activities under a programme), and
  `SET NULL` for attribution columns.

---

## 1. Identity and access

### `users`
Authentication only. **No MFA columns** — 2FA is out of scope for v2.0 (decision Q8); adding it
later is a two-column additive migration.

| Column | Notes |
|---|---|
| `email` | `CITEXT UNIQUE`, format-checked |
| `password_hash` | argon2id |
| `role` | `admin` \| `volunteer` |
| `is_active`, `email_verified_at`, `last_login_at` | Account state |
| `failed_login_count`, `locked_until` | 5 failures → 15-minute lock |

### `refresh_tokens`
Rotating sessions; only a SHA-256 hash is stored. `replaced_by` chains a rotation family so
reuse of a spent token can revoke the whole chain.

### `access_tokens`
Single-purpose links: volunteer attendance, coordinator report, password reset, email
verification. Stores the hash, purpose, target (`event_id` / `volunteer_id` / `coordinator_id`),
expiry and consumption time. **This is how coordinators, who have no accounts, submit reports.**
Note it targets an **event** — never an activity or programme — because only an occurrence
actually happens. Backs BR-13.

### `audit_logs`
`actor_id`, `action` (`program.discontinued`, `assessment.reset`, `event.cancelled`), `entity`,
`entity_id`, `before_data`, `after_data`, `ip_address`. Append-only, `BIGSERIAL`.

---

## 2. People

### `volunteers`
One-to-one with `users`. `volunteers_csr_org_chk` enforces BR-01 in the schema: a CSR volunteer
must reference an organization and an Individual must not. `phase` is **derived** — owned by
`fn_recompute_volunteer_phase()`, with `Inactive` the one value the function will not overwrite.
`email_opt_in` governs announcements only; transactional mail ignores it.

### `organizations`
CSR partners. `name` is unique because it is printed on corporate certificates.

### `coordinators`
Name, unique email (it is the address attendance links go to), mobile, `is_active`. Referenced by
`events.coordinator_id` with `ON DELETE RESTRICT`.

### `volunteer_consents`
One row per volunteer. Beyond the three booleans it records `signed_name`, `consent_version`,
`ip_address` and `user_agent` — this record may be relied upon in a POCSO or POSH matter, and a
bare boolean is weak evidence. Bumping `app_settings.consent.current_version` forces a re-sign.

---

## 3. Programs, activities and events

### `programs` — no dates

| Column | Notes |
|---|---|
| `code`, `name`, `description` | `PRG-2026-001` |
| `status` | `draft` \| `active` \| `discontinued` |
| `default_coordinator_id` | Proposed when scheduling a new occurrence |
| `discontinued_at`, `discontinued_by`, `discontinue_reason` | Kept consistent with `status` by a check constraint |

Discontinuing a programme blocks new enrollment on every occurrence beneath it (BR-17) without
deleting anything.

### `activities` — no dates

The definition of a repeatable piece of work. `status` is `active` \| `discontinued`,
independent of its programme, so a single activity can be retired while the rest of the
programme continues.

The `default_*` columns (`default_duration_hours`, `default_max_slots`, `default_location`) seed
a new occurrence; the values on the occurrence are authoritative once set. `type` is independent
of the programme so a hybrid programme can mix online and in-person work.

### `events` — the dated occurrence, and the enrollable unit

| Column | Notes |
|---|---|
| `code` | `EVT-2026-0012` |
| `activity_id` | Parent definition |
| `name` | Optional override, e.g. "August Session". NULL means display the activity name |
| `date`, `start_time`, `duration_hours` | The occurrence |
| `location`, `city` | `city` denormalised for dashboard and report filters |
| `max_slots` | Capacity. `spots_left` is **never** stored (BR-06) |
| `coordinator_id` | `NOT NULL`, `RESTRICT` — every occurrence has someone accountable |
| `status` | `draft` \| `upcoming` \| `completed` \| `cancelled` |

The column carrying the most weight:

```sql
time_range TSRANGE GENERATED ALWAYS AS (
  tsrange((date + start_time)::timestamp,
          (date + start_time)::timestamp + make_interval(mins => (duration_hours*60)::int),
          '[)')
) STORED
```

With a GiST index, BR-11 conflict detection is an index-backed `&&` overlap test rather than
pairwise minute arithmetic over every enrolled occurrence.

### `announcements`
One row per broadcast. `program_id` is required; `event_id` is optional — NULL means the
broadcast covers the whole programme, set means it announces one specific occurrence. The first
row is the announcement; later rows are resends.

---

## 4. Training and assessment

### `trainings`
`category` (compliance / activity) describes subject matter; `is_mandatory` describes gating.
They are independent, which is why the prototype has trainings categorised `compliance` that are
not mandatory.

`trainings_mandatory_chk` enforces BR-03 structurally: a mandatory training must have both a
`max_attempts` cap and an `expiry_months` window. You cannot create a mandatory training that
never expires or allows unlimited retries.

`content_version` is bumped when materials change; attempts record the version they were taken
against, which is what makes the BR-12 "reset or keep?" decision meaningful.

### `training_materials`
Real file storage: `file_path`, `mime_type`, `file_size_bytes`, `content_hash`. `file_size_text`
holds the display string ("3.2 MB") separately, so nothing computes with a formatted value.

### `training_questions` / `training_options`
`correct_option_index` lives on the question. **It is never sent to a volunteer before
submission** — scoring is server-side.

### `program_trainings` / `activity_trainings`
Two junctions, two levels. Programme-level trainings are the initiative-wide context (everyone in
Youth Mentorship does Child Safeguarding); activity-level trainings are the role gate (only
Blood Pressure Screening needs First Aid).

The gate applied at enrollment is the **union** of the two, resolved by
`v_event_required_trainings`. That is why Rahul, in the demo data, is missing `t2` for a Blood
Pressure Screening occurrence but not `t1` — he passed the programme-level Orientation and
failed the activity-level First Aid.

### `training_attempts`
Append-only, `UNIQUE (volunteer_id, training_id, attempt_number)`.

`is_superseded` is the key design choice: an admin reset marks attempts superseded rather than
deleting them. A 3-attempt cap means something only if the history behind it survives, and a
POCSO-adjacent audit that can be erased is not an audit.

### `training_attempt_answers` / `training_attempt_resets`
Per-question detail backing the answer-review pane; and who reset whose attempts, when, why, and
whether a content change triggered it.

---

## 5. Enrollment and waitlist

### `event_enrollments`
A held seat at one occurrence. `UNIQUE (volunteer_id, event_id)` plus a partial unique index on
live rows.

**Deviation D-07**: `enrollment_status` is `('enrolled','cancelled')` only. Waiting volunteers
exist **only** in `waitlist_entries` and have no row here until promoted. One fact, one place.

`skills` records what the volunteer brings to this occurrence. `conflict_acknowledged` records
that they chose "Enroll Anyway" past a BR-11 warning. `promoted_from_waitlist` marks automatic
promotions.

**There is no programme-level registration table** (decision C). Participation in a programme is
derived from the occurrences a volunteer joined — `v_program_participation` does that.

### `waitlist_entries`
The ordered queue. `position` is 1-based, `UNIQUE (event_id, position)` **deferrable** — deferred
because promotion renumbers a block of rows in one transaction and would otherwise trip the
constraint mid-update.

---

## 6. Field execution

### `attendance_dispatches`
One row per occurrence holding both email flags, both timestamps and both send counts. This
answers "has this occurrence been dispatched, and to whom?" in one read — `email_logs` alone
cannot express "sent to volunteers but not yet the coordinator".

### `attendance_records`
One row per volunteer per occurrence. Two constraints encode BR-15:

```sql
-- absent needs a reason (unless an admin or coordinator recorded it)
CHECK ((attended AND absence_reason IS NULL)
    OR (NOT attended AND (absence_reason IS NOT NULL OR source <> 'self')))
-- present needs hours
CHECK (attended = FALSE OR hours_contributed IS NOT NULL)
```

The second matters more than it looks: an attendance row with no hours silently contributes zero
to the hours KPI and to certificate totals.

### `event_reports`
The coordinator's occurrence report — one per occurrence. Status (completed / partial /
postponed / cancelled), actual timings, volunteers present, beneficiaries reached, and three
narrative fields. **The sole origin of the beneficiary count** on the dashboard and the public
impact page.

### `event_photos`
Both evidence and gallery. `source` distinguishes admin uploads from coordinator-report and
volunteer-attendance evidence; `is_public` defaults to false and gates the public gallery
(BR-16).

---

## 7. Recognition and feedback

### `certificates` — per programme (BR-18)

`UNIQUE (volunteer_id, program_id)`. Hours are summed across every occurrence attended within
the programme, from `v_program_participation`.

| Column | Why |
|---|---|
| `certificate_number` | Unique, printed, verifiable |
| `hours` | Sum across occurrences |
| `events_attended` | Snapshot of how many occurrences the hours came from — printed, so the figure is auditable |
| `period_start`, `period_end` | First and last occurrence attended, so a reissue after further participation is distinguishable from the original |
| `cert_type`, `organization_id` | BR-08; the sponsor is carried so the corporate template needs no join at render time |

### `feedback_submissions` — per occurrence
`UNIQUE (volunteer_id, event_id)` enforces BR-09 at the database level, not just in the form.
Feedback is per occurrence so "poor time management" points at one morning a coordinator can act
on, rather than at a year-long programme.

`vol_again` uses the prototype's four options — Definitely, Probably, Not sure, Unlikely.
`is_published_testimonial` gates the public page (BR-16).

### `feedback_issues` / `feedback_improvements` / `feedback_option_catalog`
Child tables store the label text so a later rename or retirement does not rewrite history; the
catalog is the admin-editable vocabulary the form renders from.

---

## 8. Operations

### `email_logs` — the transactional outbox
Every message, written **before** it is sent, in the same transaction as the thing that caused
it. `status` moves `queued → dispatched → sent | failed | bounced`.

n8n-specific columns: `n8n_workflow`, `n8n_execution_id` (trace a message straight into the n8n
UI), `dispatched_at`, `provider_message_id`. Foreign keys to programme, activity, event,
volunteer and coordinator make "everything we ever sent about this programme" one query.

### `scheduled_reports` / `report_runs`
Schedules are stored as frequency + send time + timezone rather than cron expressions, so the
next run is computable, displayable and correct across IST. Every execution writes a run row with
status, row count, file path and error.

### `app_settings`
Key/JSONB configuration an admin can change without a deploy: org name and addresses, consent
version, attempt cap and expiry defaults, link TTL, upload limits, the
`features.enforceTrainingPrerequisites` flag that Phase 3 ships `false` and Phase 4 flips, and
the n8n workflow name and master notification switch.

---

## 9. Views and functions

| Object | Kind | Purpose |
|---|---|---|
| `v_event_capacity` | view | Enrolled, waitlisted, spots left, is-full, **is-enrollable** per occurrence |
| `v_valid_training_passes` | view | "Currently holds this training": passed, not superseded, not expired |
| `v_volunteer_compliance` | view | Consent complete + all mandatory trainings current |
| `v_event_required_trainings` | view | The union gate: programme trainings + activity trainings |
| `v_event_attendance` | view | Attended vs enrolled, hours, beneficiaries, attendance % |
| `v_program_participation` | view | Per volunteer per programme — the certificate source |
| `v_volunteer_report_summary` | view | One row per volunteer; backs the Reports table |
| `v_dashboard_kpis` | view | KPI tiles |
| `fn_is_event_enrollable(event)` | function | The three-level discontinuation cascade |
| `fn_event_prereqs_met(vol, event)` | function | BR-05 gate |
| `fn_volunteer_missing_trainings(vol, event)` | function | Names what is outstanding, for the lock state |
| `fn_volunteer_conflicts(vol, event)` | function | BR-11 overlap via the GiST index |
| `fn_promote_waitlist(event)` | function | BR-10 promotion + renumbering; row-locks the event |
| `fn_recompute_volunteer_phase(vol)` | function | BR-14 lifecycle |
| `set_updated_at()` | trigger fn | Shared `updated_at` maintenance |
| `trg_enrollment_cancelled_promote` | trigger | Fires promotion when a live seat is released |

Two of these are load-bearing in a way worth stating.

**`v_valid_training_passes`.** Every compliance question in the system — can this volunteer
enroll, what phase are they in, is their certification lapsing, what does the training completion
chart show — resolves through it. Defining "currently holds this training" exactly once is what
stops those four answers from drifting apart.

**`fn_is_event_enrollable`.** Without it, every caller would have to remember to check event
status *and* activity status *and* programme status *and* the date. One forgotten check and a
discontinued programme keeps accepting volunteers.

---

## 10. Indexing

| Table | Index | Serves |
|---|---|---|
| `programs` | `(status)` | List filters |
| `activities` | `(program_id, sort_order)`, `(status)` | Programme detail |
| `events` | `(activity_id, date)`, `(date, start_time)`, `(status, date)`, `(city)`, **GiST `(time_range)`** | Browse, calendar, conflict detection |
| `event_enrollments` | `(event_id, status)`, `(volunteer_id, status)`, partial unique on live | Capacity, my-enrollments |
| `waitlist_entries` | `(event_id, position)` | Promotion picks the head in one index seek |
| `training_attempts` | `(volunteer_id, training_id, attempted_at DESC)`, partial on valid passes | History, compliance checks |
| `attendance_records` | `(event_id, attended)`, `(volunteer_id, recorded_at DESC)` | Rollups, volunteer reports |
| `email_logs` | `(event_id)`, `(program_id)`, `(recipient_email)`, `(template_key)`, partial on pending | Audit and outbox sweeps |
| `certificates` | `(program_id, issued)`, `(volunteer_id, issued)` | Certificate table, wallet |
| `feedback_submissions` | `(event_id, submitted_at DESC)`, partial on published | Analytics, public page |
| `audit_logs` | `(entity, entity_id, created_at DESC)`, `(actor_id, created_at DESC)` | Audit queries |

`V010__performance_indexes.sql` is reserved for Phase 8, so further indexes come from load-test
measurements rather than guesswork.

---

## 11. Entity relationship summary

```
users ──1:1── volunteers ──M:1── organizations
  │               │
  │               ├──1:1── volunteer_consents
  │               ├──1:M── training_attempts ──M:1── trainings
  │               ├──1:M── event_enrollments ──M:1── events
  │               ├──1:M── waitlist_entries  ──M:1── events
  │               ├──1:M── attendance_records ─M:1── events
  │               ├──1:M── feedback_submissions ─M:1── events
  │               └──1:M── certificates ──M:1── programs
  ├──1:M── refresh_tokens
  └──1:M── audit_logs

programs ──1:M── activities ──1:M── events
    │                 │                 │
    ├──M:M── trainings│                 ├──1:1── attendance_dispatches
    │  (program_      ├──M:M── trainings├──1:1── event_reports
    │   trainings)    │  (activity_     ├──1:M── event_photos
    └──1:M── announcements   trainings) └──M:1── coordinators

trainings ──1:M── training_materials
          ──1:M── training_questions ──1:M── training_options

feedback_submissions ──1:M── feedback_issues
                     ──1:M── feedback_improvements

scheduled_reports ──1:M── report_runs
```
