# Screen Inventory — Prototype to Implementation

Every screen and modal in `VMS_prototype_v2.html`, mapped to its route, module, endpoints and
delivery phase.

> **Read this first.** The Program → Activity → Event remodel renames screens. The prototype's
> "Events & Activities" admin area becomes "Programs → Activities → Occurrences", and the
> prototype's volunteer "Browse Activities" becomes "Browse Events" (occurrences). See
> `01-design-document.md` §2.1 for the mapping.

**Legend** · Module: M1 Identity · M2 Programmes · M3 Scheduling · M4 Training · M5 Field ·
M6 Recognition & Insight

---

## Screens

| # | Prototype id | Screen (v2 name) | Route | Role | Module | Phase | Primary endpoints |
|---|---|---|---|---|---|:--:|---|
| 1 | `screen-landing` | Landing — login / signup | `/` | public | M1 | P1 | `POST /auth/login`, `POST /auth/check-email` |
| 2 | `screen-registration` | Volunteer registration | `/register` | volunteer | M1 | P1 | `POST /volunteers`, `GET /organizations` |
| 3 | `screen-volunteer` | Volunteer dashboard | `/app/dashboard` | volunteer | M3 | P3 | `GET /events?scope=open`, `POST /enrollments/batch` |
| 4 | `screen-admin-login` | Admin login *(no OTP field)* | `/admin/login` | public | M1 | P1 | `POST /auth/login` |
| 5 | `screen-admin-dashboard` | Admin hub | `/admin/dashboard` | admin | M2 | P2 | `GET /analytics/summary` |
| 6 | `screen-events-list` | **Programs list** | `/admin/programs` | admin | M2 | P2 | `GET /programs` |
| 7 | `screen-event-detail` | **Program detail** | `/admin/programs/:id` | admin | M2 | P2 | `GET /programs/:id`, `GET /programs/:id/activities` |
| 8 | `screen-add-event` | **Add / edit program** | `/admin/programs/new`, `/admin/programs/:id/edit` | admin | M2 | P2 | `POST /programs`, `PATCH /programs/:id`, `PUT /programs/:id/trainings` |
| 9 | `screen-add-activity` | **Add / edit activity** | `/admin/programs/:id/activities/new`, `/admin/activities/:id/edit` | admin | M2 | P2 | `POST /programs/:id/activities`, `PATCH /activities/:id` |
| 9b | *(new)* | **Schedule / edit occurrence** | `/admin/activities/:id/events/new`, `/admin/events/:id/edit` | admin | M2 | P2 | `POST /activities/:id/events`, `POST /activities/:id/events/series` |
| 10 | `screen-field-execution` | Field execution & attendance | `/admin/field-execution` | admin | M5 | P5 | `GET /attendance/dispatches` |
| 11 | `screen-vol-attendance` | Volunteer attendance form | `/attendance/:token` | link token | M5 | P5 | `GET/POST /attendance/link/:token` |
| 12 | `screen-coord-attendance` | **Coordinator occurrence report** | `/report/:token` | link token | M5 | P5 | `GET/POST /reports/link/:token` |
| 13 | `screen-calendar` | Calendar (role-aware) | `/app/calendar`, `/admin/calendar` | both | M3 | P3 | `GET /events/calendar?month=` |
| 14 | `screen-activities-list` | **Browse events (occurrences)** | `/app/events` | volunteer | M3 | P3 | `GET /events?…` |
| 15 | `screen-activity-detail` | **Event detail** | `/app/events/:id` | volunteer | M3 | P3 | `GET /events/:id`, `POST /events/:id/enroll` |
| 16 | `screen-consent` | Compliance agreement | `/app/consent` | volunteer | M1 | P1 | `GET/POST /volunteers/me/consent` |
| 17 | `screen-admin-assessments` | Volunteer assessments | `/admin/trainings/:id/assessments` | admin | M4 | P4 | `GET /trainings/:id/assessments`, `POST …/reset` |
| 18 | `screen-training-list` | Trainings list | `/admin/trainings` | admin | M4 | P4 | `GET /trainings` |
| 19 | `screen-add-training` | Add / edit training | `/admin/trainings/new`, `/admin/trainings/:id/edit` | admin | M4 | P4 | `POST /trainings`, `POST …/materials`, `PUT …/questions` |
| 20 | `screen-vol-trainings` | My trainings | `/app/trainings` | volunteer | M4 | P4 | `GET /trainings/me` |
| 21 | `screen-training-view` | Training view — materials + quiz | `/app/trainings/:id` | volunteer | M4 | P4 | `GET /trainings/:id`, `POST …/attempts`, `POST …/submit` |
| 22 | `screen-recognition-admin` | Recognition hub | `/admin/recognition` | admin | M6 | P6 | — (navigation) |
| 23 | `screen-certificates-admin` | Certificates *(per programme)* | `/admin/recognition/certificates` | admin | M6 | P6 | `GET /certificates`, `POST /certificates/:id/issue`, `POST /certificates/issue-bulk` |
| 24 | `screen-feedback-admin` | Feedback responses | `/admin/recognition/feedback` | admin | M6 | P6 | `GET /feedback`, `GET /feedback/analytics` |
| 25 | `screen-vol-certs` | My certificates | `/app/certificates` | volunteer | M6 | P6 | `GET /certificates/me`, `GET /files/:id` |
| 26 | `screen-feedback-form` | Feedback form *(per occurrence)* | `/app/feedback` | volunteer | M6 | P6 | `GET /feedback/options`, `POST /feedback` |
| 27 | `screen-dashboard` | Metrics dashboard | `/admin/metrics` | admin | M6 | P7 | `GET /analytics/dashboard` |
| 28 | `screen-reports` | Reports | `/admin/reports` | admin | M6 | P7 | `GET /reports/volunteers`, `POST /reports/export` |
| 29 | `screen-auto-reports` | Automated reports | `/admin/reports/scheduled` | admin | M6 | P7 | `GET/POST/PATCH/DELETE /reports/scheduled` |
| 30 | `screen-impact-page` | Public impact page | `/impact` | public | M6 | P8 | `GET /public/impact` |

Screens added beyond the prototype:

| # | Screen | Route | Role | Module | Phase | Why |
|---|---|---|---|---|:--:|---|
| 31 | Admin volunteer directory | `/admin/volunteers` | admin | M1 | P2 | Prototype stub; confirmed in scope (Q1) |
| 32 | Volunteer profile | `/app/profile` | volunteer | M1 | P1 | Prototype had a read-only panel only |
| 9b | Schedule occurrence | see above | admin | M2 | P2 | New layer created by the remodel |

**Net: 33 screens.**

---

## What the remodel changes on screen

| Prototype screen | What it did | What it becomes |
|---|---|---|
| Events list | Cards of dated events, each listing its activities | **Programs list** — cards of undated programmes, each listing its activities and next occurrence |
| Event detail | One date, its activities, its registered volunteers | **Program detail** — activities, and per activity an occurrence list (upcoming / past) with per-occurrence capacity |
| Add activity | Name **+ date + time + location + slots** | Split: **Add activity** (name, skill, outcome, defaults) and **Schedule occurrence** (date, time, location, slots, coordinator) |
| Browse activities | Dated activity cards | **Browse events** — occurrence cards, showing which programme and activity they belong to |
| Certificates | One row per volunteer per event | One row per volunteer per **programme**, with hours summed and an occurrence count |
| Feedback form | "Which event?" listing events | "Which session?" listing **attended occurrences** |

The Schedule-occurrence screen carries a **repeat helper** — generate N occurrences from a
pattern (weekly for 6 weeks, monthly on the third Saturday). Without it, the remodel makes the
admin's job harder rather than easier, since scheduling a recurring activity would otherwise
mean filling the same form ten times.

---

## Modals

| Prototype id | Modal | Trigger | Phase |
|---|---|---|:--:|
| `email-modal` | Enrollment confirmed + training reminder preview | Confirm Participation | P3 |
| `cancel-modal` | Cancel occurrence confirmation | Cancel | P2 |
| *(new)* | **Discontinue programme / activity** | Discontinue | P2 |
| `announce-modal` | Announce / resend | Announce | P2 |
| `send-emails-modal` | Send attendance emails | Field execution row | P5 |
| `cert-modal` | Certificate issued | Issue / Resend | P6 |
| `conflict-modal` | Scheduling conflict | Enroll with overlap | P3 |
| `waitlist-modal` | Join waitlist | Enroll into a full occurrence | P3 |
| `reset-doc-modal` | Reset assessments on new document | Save mandatory training with new material | P4 |
| `vat-thankyou` / `cat-thankyou` / `fb-thankyou` | Submission confirmations | Form submit | P5, P6 |

The discontinue modal is new and needs care: it must state plainly that discontinuation **blocks
new enrollment but does not cancel scheduled occurrences and does not email anyone**, so an
admin does not assume volunteers have been told.

---

## Component reuse map

| Component | Used by screens |
|---|---|
| `FilterBar` | 3, 6, 10, 14, 17, 18, 23, 27, 28, 31 |
| `StatusPill` | 6, 7, 9b, 18, 29 |
| `StatTile` | 7, 27 |
| `SlotBar` | 14, 15 |
| `OccurrenceList` | 7, 9b, 13 |
| `TrainingChip` | 7, 8, 9, 14, 15, 20 |
| `EmailPreview` | all five email modals |
| `CalendarGrid` | 13 (both roles) |
| `AttemptPips` | 17, 21 |
| `CertificateCard` | 23 (modal), 25 |
| `DocumentList` | 19, 21 |
| `QuizQuestion` | 21 (volunteer flow, admin preview, answer review) |
| `ImageDropzone` | 11, 12, 19 |

---

## Screens by phase

| Phase | Screens | Count |
|---|---|:--:|
| P1 | 1, 2, 4, 16, 32 | 5 |
| P2 | 5, 6, 7, 8, 9, 9b, 31 | 7 |
| P3 | 3, 13, 14, 15 | 4 |
| P4 | 17, 18, 19, 20, 21 | 5 |
| P5 | 10, 11, 12 | 3 |
| P6 | 22, 23, 24, 25, 26 | 5 |
| P7 | 27, 28, 29 | 3 |
| P8 | 30 | 1 |
| | **Total** | **33** |
