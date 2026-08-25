# API Specification

| | |
|---|---|
| **Version** | 1.1 (Program → Activity → Event remodel; n8n webhooks) |
| **Base URL** | `/api/v1` |
| **Format** | JSON, except upload endpoints (`multipart/form-data`) |
| **Auth** | `Authorization: Bearer <access token>`, or a path-embedded link token for the two field forms |
| **Live reference** | Swagger UI at `/api/docs`; OpenAPI 3 at `/api/docs-json` is the machine-readable source of truth |

---

## Conventions

Collections return `{ data: [...], meta: { total, limit, offset } }`. Single resources return the
object. Errors are uniform:

```json
{
  "statusCode": 409,
  "code": "ACTIVITY_FULL",
  "message": "This session has no remaining slots.",
  "details": { "eventId": "…", "maxSlots": 3, "waitlistPosition": 2 },
  "traceId": "01J8…"
}
```

`code` is stable and the UI branches on it; `message` is human-facing and may change.

### Business error codes

| Code | Status | Raised by |
|---|---|---|
| `PREREQUISITES_NOT_MET` | 409 | Enroll — BR-05. `details.missingTrainings[]` |
| `ACTIVITY_FULL` | 409 | Enroll — BR-10. `details.waitlistPosition` |
| `SCHEDULING_CONFLICT` | 409 | Enroll — BR-11. `details.conflictingEvent` |
| `ALREADY_ENROLLED` | 409 | Enroll |
| `EVENT_NOT_ENROLLABLE` | 409 | Enroll — covers cancelled occurrence, discontinued activity, discontinued programme, past date (BR-17) |
| `CONSENT_REQUIRED` | 403 | Any training endpoint — BR-02 |
| `ATTEMPTS_EXHAUSTED` | 409 | Start attempt — BR-03 |
| `CERTIFICATION_EXPIRED` | 409 | Enroll — BR-05 |
| `FEEDBACK_ALREADY_SUBMITTED` | 409 | Submit feedback — BR-09 |
| `CONTENT_CHANGED` | 409 | Save mandatory training with new materials — BR-12 |
| `TOKEN_EXPIRED` / `TOKEN_CONSUMED` / `TOKEN_INVALID` | 401 | Link-token endpoints — BR-13 |
| `INVALID_SIGNATURE` | 401 | n8n status callback |
| `ACCOUNT_LOCKED` | 423 | Login after 5 failures |

Admin tables use `?limit=&offset=`; feeds use `?cursor=&limit=`. Filters are named after the
field; sorting is `?sort=field&order=asc|desc`; date ranges are `?from=&to=`.

---

## Auth — `/auth`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | public | Account **and** profile in one transaction — an abandoned form creates nothing. Lands as `pending` for admin review |
| POST | `/auth/check-email` | public | `{available}` — lets the form fail fast before the long part |
| POST | `/auth/login` | public | `{ email, password }` → access token + refresh cookie. **No `totp`** — 2FA is out of scope. Failures are specific: `ACCOUNT_NOT_FOUND`, `INVALID_PASSWORD`, `REGISTRATION_REJECTED` (with the reason), `ACCOUNT_DEACTIVATED`, `ACCOUNT_LOCKED` |
| POST | `/auth/refresh` | refresh cookie | Rotate; reuse revokes the family |
| POST | `/auth/logout` | bearer | Revoke the current family |
| POST | `/auth/forgot-password` | public | Always 202 |
| POST | `/auth/reset-password` | reset token | `{ token, password }` |
| GET | `/auth/me` | bearer | Principal with role and, for volunteers, compliance status |

## Volunteers — `/volunteers`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/volunteers` | bearer | Complete registration |
| GET / PATCH | `/volunteers/me` | volunteer | Own profile |
| GET | `/volunteers/me/compliance` | volunteer | From `v_volunteer_compliance` |
| GET / POST | `/volunteers/me/consent` | volunteer | Read / sign. IP and user-agent captured server-side; recomputes phase |
| GET | `/volunteers` | admin | Directory: `?q=&phase=&category=&city=&organizationId=` |
| GET / PATCH | `/volunteers/:id` | admin | Full profile (everything given at sign-up); `{isActive}` activates / inactivates the account |
| POST | `/volunteers/:id/approve` | admin | Approve a registration; the account stays active |
| POST | `/volunteers/:id/reject` | admin | Reject with a **required** reason; deactivates the account |
| POST | `/volunteers` | volunteer | Complete a profile on an account orphaned by the old two-step signup |
| GET | `/reference-values` | none | Option lists (LANGUAGE, AREA_OF_INTEREST, AVAILABILITY) the registration form renders from |
| GET | `/events/:id/session-record` | admin | Occurrence + enrolment roster with volunteer-logged attendance + coordinator report |
| POST | `/events/:id/complete` | admin | Mark a past `upcoming` session `completed` — the explicit claim dashboards count as *conducted* |
| POST | `/events/:id/attendance` | admin | Log/upsert attendance. Requires the volunteer to be enrolled, or `walkIn: true` for an active approved volunteer; present requires hours |

`/organizations` and `/coordinators` are standard admin CRUD. Coordinator `DELETE` deactivates
rather than deletes, because events reference coordinators with `ON DELETE RESTRICT`.

---

## Programs — `/programs`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/programs` | bearer | `?q=&status=&city=`. Each row carries activity count, upcoming occurrence count and next occurrence date |
| POST | `/programs` | admin | Create. `{ name, description, defaultCoordinatorId, trainingIds[] }` |
| GET | `/programs/:id` | bearer | Detail with activities; each activity carries its occurrence counts |
| PATCH | `/programs/:id` | admin | Update |
| POST | `/programs/:id/publish` | admin | `draft → active` |
| POST | `/programs/:id/discontinue` | admin | `{ reason }`. BR-17 — blocks enrollment on every occurrence beneath it, audits, notifies volunteers with upcoming enrollments. **Does not cancel occurrences** |
| POST | `/programs/:id/reactivate` | admin | Back to `active` |
| PUT | `/programs/:id/trainings` | admin | Replace programme-level training links |
| GET | `/programs/:id/activities` | bearer | Activities with occurrence summaries |
| POST | `/programs/:id/announcement/preview` | admin | Renders the real template → `{ subject, html, recipientCount }` |
| POST | `/programs/:id/announcement` | admin | Sends; records an `announcements` row |
| GET | `/programs/:id/announcements` | admin | Broadcast history |
| GET | `/programs/:id/participation` | admin | From `v_program_participation` — who attended what, and for how long |

## Activities — `/activities`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/programs/:programId/activities` | admin | Create a definition |
| GET | `/activities/:id` | bearer | Detail with defaults, training links and occurrence list |
| PATCH | `/activities/:id` | admin | Update |
| POST | `/activities/:id/discontinue` | admin | `{ reason }`. BR-17 at activity level |
| POST | `/activities/:id/reactivate` | admin | Back to `active` |
| PUT | `/activities/:id/trainings` | admin | Replace activity-level training links |
| GET | `/activities/:id/events` | bearer | Occurrences of this activity, `?from=&to=&status=` |

## Events (occurrences) — `/events`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/events` | bearer | Browse: `?q=&programId=&activityId=&type=&city=&from=&to=&enrollState=all\|open\|waitlist\|enrolled&sort=date\|time\|venue\|slots&scope=open`. For a volunteer each row carries `capacity`, `myState`, `prerequisitesMet`, `missingTrainings[]`, `conflict` |
| GET | `/events/calendar` | bearer | `?month=YYYY-MM`. Grouped by date; for volunteers, `hasConflict` per day |
| POST | `/activities/:activityId/events` | admin | Schedule one occurrence. Unspecified fields fall back to the activity's `default_*` values |
| POST | `/activities/:activityId/events/series` | admin | **Schedule a series.** `{ startDate, endDate, pattern: 'weekly'\|'monthly', dayOfWeek?, times[], … }` → the created occurrences |
| GET | `/events/:id` | bearer | Detail with capacity, programme and activity context, trainings, coordinator, roster (roster admin-only) |
| PATCH | `/events/:id` | admin | Update |
| POST | `/events/:id/publish` | admin | `draft → upcoming` |
| POST | `/events/:id/cancel` | admin | `{ reason }`. BR-07 — cancels, blocks enrollment, queues notification to every enrolled and waitlisted volunteer, audits |
| GET | `/events/:id/enrollments` | admin | Enrolled volunteers with skills and status |

---

## Enrollment

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/events/:id/enroll` | volunteer | `{ acknowledgeConflict?, acceptWaitlist?, skills? }`. The seven-step transaction. Returns the enrollment, or `{ waitlistPosition }` |
| DELETE | `/events/:id/enroll` | volunteer | Withdraw. Triggers promotion (BR-10); returns `{ promoted: n }` |
| POST / DELETE | `/events/:id/waitlist` | volunteer | Explicit join / leave; positions renumber |
| POST | `/enrollments/batch` | volunteer | Confirm Participation across several occurrences in one transaction; returns per-occurrence results so partial success is visible |
| GET | `/enrollments/me` | volunteer | Own enrollments and waitlist entries |

---

## Trainings — `/trainings`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET / POST | `/trainings` | admin | `?q=&category=&status=&mode=`; create |
| GET | `/trainings/:id` | bearer | Detail. For volunteers the response omits `correctOptionIndex` |
| PATCH | `/trainings/:id` | admin | Update. Returns `CONTENT_CHANGED` when materials grew on a mandatory training and no `resetDecision` was supplied (BR-12) |
| POST | `/trainings/:id/status` | admin | Activate / deactivate |
| POST / DELETE | `/trainings/:id/materials[/:materialId]` | admin | Upload (bumps `content_version`) / remove |
| PUT | `/trainings/:id/questions` | admin | Replace the question set atomically |
| GET | `/trainings/me` | volunteer | Two-section feed with attempt state, lock state and validity (BR-04) |
| POST | `/trainings/:id/attempts` | volunteer | Start. Validates BR-02, BR-03. Questions **without** answers |
| POST | `/trainings/:id/attempts/:attemptId/submit` | volunteer | Scores server-side; stores attempt and answers; sets `expiry_date`; recomputes phase; returns the review |
| GET | `/trainings/:id/assessments` | admin | `?status=all\|passed\|failed\|exhausted` |
| POST | `/trainings/:id/assessments/:volunteerId/reset` | admin | `{ reason }`. Supersedes attempts, audits (BR-12) |

---

## Attendance and field execution

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/attendance/dispatches` | admin | Field execution table: `?q=&programId=&eventId=&sendStatus=all\|pending\|sent` |
| POST | `/attendance/dispatches/:eventId/preview` | admin | `{ target: 'volunteer'\|'coordinator' }` → rendered subject and HTML |
| POST | `/attendance/dispatches/:eventId/send` | admin | `{ target: 'volunteer'\|'coordinator'\|'both' }`. Issues one link token per recipient, queues the messages |
| GET / POST | `/attendance/link/:token` | link token | Form context / submission (`attended`, times, notes, absence reason, `images[]` max 2). BR-15 |
| GET / POST | `/reports/link/:token` | link token | Coordinator occurrence report |
| GET | `/events/:id/attendance` | admin | All records for an occurrence |
| PATCH | `/attendance/:id` | admin | Correct a record; sets `source='admin'`, audits |
| GET | `/events/:id/report` | admin | The coordinator report, if submitted |
| GET / PATCH | `/events/:id/photos`, `/photos/:id` | admin | Evidence and gallery; set `caption`, `is_public`, `sort_order` |

---

## Certificates — `/certificates` *(per programme)*

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/certificates` | admin | `?q=&programId=&issued=all\|yes\|no` |
| POST | `/programs/:id/certificates/generate` | admin | Create candidates from `v_program_participation`: one per volunteer with attendance, hours summed across occurrences, `cert_type` from category (BR-08, BR-18) |
| POST | `/certificates/:id/issue` | admin | Render, store, email. Honours `Idempotency-Key` |
| POST | `/certificates/:id/resend` | admin | Re-email; increments `resend_count` |
| POST | `/certificates/:id/reissue` | admin | Recompute hours after further participation; extends `period_end` |
| POST | `/certificates/issue-bulk` | admin | `{ certificateIds[] }` → `{ jobGroupId }` |
| GET | `/certificates/jobs/:jobGroupId` | admin | Bulk progress |
| GET | `/certificates/me` | volunteer | Own issued certificates |
| GET | `/certificates/:id/download` | bearer | 302 to a signed 5-minute URL |

## Feedback — `/feedback` *(per occurrence)*

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/feedback/options` | volunteer | Active issue and improvement tags |
| GET | `/feedback/eligible-events` | volunteer | Attended occurrences without a submission (BR-09) |
| POST | `/feedback` | volunteer | Submission with tag arrays |
| GET | `/feedback/me` | volunteer | Own submissions |
| GET | `/feedback` | admin | `?programId=&eventId=&rating=&from=&to=` |
| GET | `/feedback/analytics` | admin | Counts, average rating, average NPS, would-return, ranked issue and improvement tags |
| PATCH | `/feedback/:id/publish` | admin | `{ isPublished }` — BR-16 |

---

## Analytics, reports, public

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/analytics/summary` | admin | Admin hub tile counts |
| GET | `/analytics/dashboard` | admin | `?period=all\|month\|quarter\|year\|custom&from=&to=&programId=&city=`. One payload: KPIs + all chart series; `custom` takes inclusive ISO dates |
| GET | `/reports/volunteers` | admin | From `v_volunteer_report_summary` |
| POST | `/reports/export` | admin | `{ reportType, format, filters }`. <5,000 rows streams; above, returns `{ runId }` and emails |
| GET | `/reports/runs/:runId` | admin | Export status and download link |
| GET/POST/PATCH/DELETE | `/reports/scheduled[/:id]` | admin | Schedule CRUD; `next_run_at` computed in the report's timezone |
| POST | `/reports/scheduled/:id/run-now` | admin | Fire immediately without altering the schedule |
| GET | `/public/impact` | none | Headline stats, impact numbers, public gallery, published testimonials. Cached, rate-limited, no personal data beyond a first name and last initial |

## Webhooks, files, ops

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/webhooks/n8n/email-status` | **HMAC signature** | n8n reports delivery outcome. `{ emailLogId, status, providerMessageId?, n8nExecutionId, errorMessage? }`. Verified with `X-VMS-Signature` against `VMS_WEBHOOK_SECRET`; rejects with `INVALID_SIGNATURE` |
| GET | `/files/:id` | bearer or link token | Authorize, then 302 to a signed URL |
| GET | `/health`, `/health/ready` | none | Liveness; DB, Redis and **n8n** readiness |
| GET | `/metrics` | internal | Prometheus, including outbox backlog and email success rate |
| GET | `/admin/email-logs` | admin | Dispatch audit: `?status=&templateKey=&recipientEmail=&from=&to=` |
| POST | `/admin/email-logs/:id/retry` | admin | Re-hand a failed message to n8n |
| GET | `/admin/audit-logs` | admin | `?entity=&entityId=&actorId=&from=&to=` |

---

## Worked example — enrolling in an occurrence

```http
POST /api/v1/events/00000000-0000-0000-0008-000000000012/enroll
Authorization: Bearer <access token>
Content-Type: application/json

{ "acknowledgeConflict": false, "acceptWaitlist": false }
```

Success:

```json
{
  "id": "…",
  "eventId": "00000000-0000-0000-0008-000000000012",
  "status": "enrolled",
  "context": {
    "program":  { "id": "…", "code": "PRG-2026-001", "name": "Community Health Camp" },
    "activity": { "id": "…", "code": "ACT-001", "name": "Blood Pressure Screening" },
    "event":    { "code": "EVT-2026-0012", "name": "August Session",
                  "date": "2026-08-19", "startTime": "09:00" }
  },
  "capacity": { "enrolled": 1, "maxSlots": 5, "spotsLeft": 4, "waitlisted": 0 }
}
```

The `context` block exists because a volunteer looking at one occurrence needs to know which
activity and programme it belongs to — under the remodel that is no longer implied by the
occurrence's own name.

Prerequisites not met (BR-05), for the seeded Rahul case:

```json
{
  "statusCode": 409,
  "code": "PREREQUISITES_NOT_MET",
  "message": "Complete the required trainings before enrolling.",
  "details": {
    "missingTrainings": [
      { "code": "tc1", "name": "POCSO Compliance", "isMandatory": true,  "source": "compliance" },
      { "code": "tc2", "name": "POSH Compliance",  "isMandatory": true,  "source": "compliance" },
      { "code": "t2",  "name": "First Aid",        "isMandatory": false, "source": "activity" }
    ]
  },
  "traceId": "01J8…"
}
```

Note `t1` (Orientation, linked at **programme** level) is absent — Rahul has passed it. The gate
is the union of both levels, and the response names only what is actually outstanding.

Scheduling conflict (BR-11) and capacity (BR-10) follow the same shape, carrying
`details.conflictingEvent` and `details.waitlistPosition` respectively; the client re-sends with
`acknowledgeConflict: true` or `acceptWaitlist: true` after the user confirms in the modal.


---

## Post-MVP additions (Rounds 10–11 — see 08-phased-sessions-and-communities.md)

**Beneficiary communities** *(admin)* — `GET/POST /communities`, `GET/PATCH /communities/:id`
(archive via `status`), `GET /communities/:id/sessions?status=`. Every published session must
carry ≥1 community: `communityIds[]` on event create/series/update; `COMMUNITY_REQUIRED` /
`COMMUNITY_INVALID` guard create-as-upcoming, publish, and emptying edits.

**Session phases** *(admin)* — `GET/POST /events/:id/phases`, `PATCH/DELETE /phases/:id`,
`POST /phases/:id/start`, `POST /phases/:id/complete` (Parinaam side; partner-owned phases
answer `PHASE_NOT_YOURS`), `POST /phases/:id/override` (`{status, reason}` — audited; may
revert a completed session, writing `session.reverted`). Manual `POST /events/:id/complete`
refuses phased sessions (`PHASED_SESSION`). *(volunteer)* — `GET /phases/mine` (open
phase-lead responsibilities) and `POST /phases/:id/partner-complete` (named lead only).

**Visit-level attendance** *(admin)* — `POST /phases/:id/visits`
(`{volunteerId, visitDate, hoursContributed, walkIn?}`; date must sit inside the phase
window — `VISIT_INVALID`; unenrolled volunteers need the explicit `walkIn` flag) and
`DELETE /attendance/visits/:recordId`. The volunteer browse (`GET /events`) gained
`scope=completed` plus aggregated `myAttendance`/`myHours` per session.

**Pre-session emails** *(admin)* — `POST /events/:id/pre-session-email`
(`{type: 'details' | 'reminder'}`): re-sends to every enrolled volunteer on demand; the
automated T-7/T-1 sends run as a daily worker sweep, idempotent through `email_logs`.
Refuses completed/cancelled sessions (`NOT_UPCOMING`).

New stable error codes: `COMMUNITY_REQUIRED`, `COMMUNITY_INVALID`, `NAME_TAKEN`,
`PHASED_SESSION`, `PHASE_NOT_YOURS`, `PHASE_ALREADY_MARKED`, `PHASE_LOCKED`,
`VISIT_INVALID`. Authorization matrix: **70 endpoints × 3 roles = 210 checks**.
