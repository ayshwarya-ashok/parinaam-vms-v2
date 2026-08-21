# Post-MVP Refinements

| | |
|---|---|
| **Scope** | Everything changed after the eight implementation phases (the MVP) were delivered |
| **Period** | 2026-08-20 → 2026-08-21 |
| **Driver** | Hands-on testing by the product owner, in nine review rounds, plus one full-codebase audit |
| **Baseline** | Commit `da5fe2f` — "Phase 8: public impact page, hardening, data lifecycle, runbooks" |

The MVP was built in eight phases (see `02-implementation-plan.md`). What followed was not a
ninth phase but a different kind of work: the product owner used the system the way its real
users will, and each round of observations was fixed, verified live, and committed before the
next round began. This document records **what changed, why, and in which round** — both as a
changelog and as a record of the product decisions that were made along the way.

---

## How to read this

Each round lists its commit(s), the observations it answered, and the decisions of record.
Numbers in brackets (e.g. *[obs 14]*) are the product owner's original observation numbers,
kept so the review threads can be traced. Decisions that changed a rule established during the
MVP phases are marked **⚖ decision**.

---

## Round 1 — Volunteer training UX  (`db13842`)

*Observations 1–5: back-links, training documents, pass-aware quiz states.*

- **Breadcrumbs replaced every "← Back to X" button** app-wide. The crumb strip became
  clickable (driven by nested routes), and pages whose parent is not in their URL inject it
  dynamically (`useDynamicCrumbs` — e.g. an activity's programme). The post-quiz "Back to my
  trainings" button survived deliberately: it is an action, not navigation chrome.
- **Training materials became real documents.** The seeds referenced files that never existed;
  `scripts/generate-seed-materials.mjs` renders a genuine PDF for all 14 seed materials with
  per-document content, and "Open" streams them inline so the new tab shows the document.
  docx/pptx/mp4 placeholders became PDFs — a demo needs documents that open, not extension
  variety.
- **The quiz tab became pass-aware.** `GET /trainings/:id` gained `myStatus` for volunteers.
  - **⚖ decision** — a valid pass on a **mandatory compliance** training is final for its
    validity window: no "Start quiz", no retake; the view says *passed on \<date\> with \<n\>%,
    valid until \<date\>* and the API answers 409.
  - **⚖ decision** — **activity** trainings may be retaken, with an explicit warning that
    the **latest score is retained even if lower or failing**. Enforced by superseding all
    prior attempts in the same transaction as the new one; verified live that a failing retake
    genuinely revokes the old pass and a passing one restores it, with audit history intact.

## Round 2 — Registration review and the session record  (`84d6bff`)

*Observations 6–8: admin approval of registrations, activation, session details.*

- **Registration became atomic and reviewed.** `POST /auth/register` writes the account and the
  profile in one transaction — an abandoned form leaves **no orphan account** (the old two-step
  signup left logins that led nowhere; two such orphans were preserved and given a
  completion path via `POST /volunteers`). Registrations land as **pending**; migration V011
  added `registration_status` with `reviewed_by/at` and a required `rejection_reason`, guarded
  by a DB CHECK. Existing volunteers were backfilled as approved.
- **The sign-up form asks what the public registration form asks** — occupation, languages,
  areas of interest, availability + free-text notes. Multi-selects store **codes** from a new
  admin-editable `reference_values` catalog, so relabelling an option never rewrites anyone's
  answers. `GET /reference-values` is public because the form is.
- **⚖ decision** — the "Login enabled" switch was removed. *Approve/Reject* (the one-time
  verdict; rejection needs a reason and deactivates the account) and *Activate/Inactivate*
  (ongoing control) are separate concerns with separate buttons.
- **The session record** (`GET /events/:id/session-record`, `/admin/sessions/:id`) composes the
  occurrence, the enrolment **roster** (including volunteers who never submitted — exactly who
  an admin is chasing), each volunteer's logged attendance with its source, and the
  coordinator's report. Any row can be corrected; corrections flip `source` to `admin` and are
  audited with before/after.

## Round 3 — Honest errors, Edit Occurrence, per-state rosters  (`4a21bbf`)

*Observations 9–12: login messages, drawer size, the phantom tab, roster views.*

- **⚖ decision** — login errors say what happened: `ACCOUNT_NOT_FOUND` (with a sign-up
  nudge), `INVALID_PASSWORD`, `REGISTRATION_REJECTED` (quoting the admin's reason),
  `ACCOUNT_DEACTIVATED`. The old blanket "Invalid email or password" was protecting against
  email enumeration that the registration flow already discloses (check-email must say when an
  address is taken), so it bought no privacy while misleading exactly the people it hit.
- **Edit Occurrence was built** (it had been the last remaining stub): edits one occurrence
  only, refuses capacity below current enrolment, and warns that moving a date does **not**
  email the people committed to it.
- **Publish became explicable**: it flips `draft → upcoming`, which is what makes a session
  visible and enrollable (`fn_is_event_enrollable` requires `upcoming`). The status column now
  says *staff only / open to volunteers / hours logged* in plain words.
- **Session records adapt to the session's phase**: upcoming shows who is coming (enrolment
  date, offered skills, direct-vs-waitlist route, the waitlist in promotion order); completed
  shows attendance and logged hours per volunteer.
- Seed `S003` added one activity — *Lake Clean-up Drive* — holding every state at once:
  three completed sessions with mixed attendance sources, an upcoming session deliberately full
  with a real waitlist, and a draft for testing Publish/Edit.

## Round 4 — Ranges, sorting, navigation and toast conventions  (`6f48144`)

*Observations 13–21.*

- **Custom date range** on the metrics dashboard [13]; every date predicate gained an upper
  bound (the named periods are all "last N from today" and had none).
- **Three-state column sorting** (asc → desc → none) on all eight tables via
  `useTableSort`/`SortableCell` [14]. The third state matters: several tables arrive in an
  order the server chose deliberately (waitlist position, newest first). Empty values sort
  last in both directions.
- **Nav conventions** [15]: the PARINAAM wordmark is the first item for both roles and goes to
  that role's dashboard; the active item is filled, bolder, underlined, `aria-current`.
- **⚖ decision** — `/` became the public impact page; sign-in moved to `/login` [16].
- **Toast conventions** [17]: top-right (where the actions live); one `useToast` shape —
  success / failure / **"No changes to save"** as a distinct outcome, because a form submitted
  untouched used to flash the same green as a real edit.
- **Calendar** [18]: "Jump to date"; the legend moved above the grid.
- Certificate download naming [19] (superseded in Round 5), **sticky breadcrumbs** [20],
  and development phase labels removed from user-facing copy [21].

## Round 5 — Prototype parity and pending-state editing  (`85a62f6`)

*Observations 22–29.*

- **The impact page was rebuilt section-for-section against the prototype** [22] — hero,
  impact-number cards, field gallery, volunteer voices, feedback CTA, footer — with the
  join/admin bar lifted to the top. Every figure the prototype hard-coded became a live query
  (`/public/impact` gained attendance rate, training completions, certificates, partners,
  responses, NPS).
- Registration gained an exit [23]; **the 10-digit phone rule** arrived app-wide with
  normalisation of `+91`/spaces/dashes, enforced in API DTOs too [24].
- "No changes to save" turned neutral instead of blue [25]; **certificate files reverted to
  `<certificateNumber>.pdf`** [26] — the volunteer-UUID prefix made a 60-character name.
- The duplicate non-clickable breadcrumb was PageShell's `eyebrow` restating the crumb strip;
  removed from 30 call sites [27].
- Signed-in visitors on `/` skip the brochure [28]; **admins can correct a registration while
  it is pending** [29] — deliberately only then: after a decision, hours and certificates hang
  off the record, so edits belong to the volunteer's own profile.

## Round 6 — Truthful numbers, dismissable toasts, mandatory identity  (`d7fb30b`)

*Observations 30–32.*

- The impact page was confirmed fully DB-driven; the **login page** turned out to hold the last
  invented numbers ("120+ volunteers") and now reads the same public aggregates [30].
- The neutral toast went light-grey-on-dark-grey, and **every toast gained a dismiss ✕** [31].
- **⚖ decision** — first name, last name, gender, DOB, city, state and phone are mandatory
  wherever a volunteer record is written [32]: one shared `validateProfile()` across public
  registration, the volunteer's profile and the admin drawer (which gained gender and DOB
  editing). Server-side: registration requires the full set; updates stay partial but a field
  that *is* sent cannot be blanked.

## Round 7 — Gallery honesty, phone search, complete seeds  (`33adafe`)

*Observations 33–35.*

- The one thing on the impact page that still *looked* mocked was the gallery: with a single
  public photo, five tiles rendered as gradient rectangles resembling photographs the system
  did not have. **Photo tiles and programme data-cards are now visibly different things** [33].
- **The volunteer directory searches phone numbers** [34]; both the stored value and the query
  reduce to their ten significant digits, so `+91 98200 11005`, `9820011005` and `11005` all
  find the same person.
- Seed `S004` completed the volunteer records the mandatory-field rule requires, fixed the
  *Maharastra* misspelling that silently split the state filter, and normalised phones to bare
  ten digits [35]. **Erased volunteers were deliberately skipped** — refilling erased fields
  would undo an exercised right.

## Round 8 — The codebase audit  (`f392cab`, `002986d`, `06559fc`)

A full audit against the live system surfaced 18 findings the manual rounds had missed; the
product owner triaged them (14 fixed, 1 explicitly accepted as-is, 3 explained and then fixed
in follow-ups). The most consequential:

- **Absent volunteers no longer contribute hours** (V012): three views summed
  `hours_contributed` over every record while counting sessions with `FILTER (WHERE attended)`
  — proven to produce a certificate source reading "2.75 hours across 0 sessions".
  The admin edit paths also zero hours on absent and clear the absence reason on present
  (before that, a DB CHECK made absent→present **permanently impossible** from the UI).
- **Sessions gained "Mark completed"** — an explicit admin action, offered only when the date
  has arrived. Nothing in the system had ever produced a `completed` session; every one in the
  DB had been hand-seeded, and dashboards count `completed` as *conducted*.
- **⚖ decision** — pending volunteers can explore, consent and train, but **enrolling requires
  approval** (`REGISTRATION_PENDING`, 403), with an under-review banner in the volunteer shell.
- **Raising a session's capacity now genuinely promotes the waitlist** (the DB trigger only
  ever fired on cancellations, while the edit form promised otherwise), and everyone promoted
  gets the standard email.
- **⚖ decision** — recording attendance for a non-enrolled volunteer requires an explicit
  **walk-in**: the API refuses arbitrary IDs (`NOT_ENROLLED`), walk-ins must be active
  approved volunteers, and the session record gained an "Add walk-in" picker over exactly
  that set.
- Also: `normalizePhone` no longer mangles genuine `91…`-leading numbers; the calendar computes
  dates in the local wall clock instead of UTC (the today-marker sat on yesterday until 05:30
  IST); the public "Active volunteers" figure counts approved+active only; a failing scheduled
  report advances to its next slot instead of retrying every five minutes forever; reissued
  certificates delete the file they replace; erased volunteers left reports and certificate
  candidates; the nav folds into a **hamburger drawer** on narrow screens (keeping the app bar
  one row tall, which the sticky breadcrumbs depend on); the approval email's button goes to
  `/login` instead of the brochure.
- **Accepted as-is** [audit 12]: the attendance-reminder sweep has no lower age bound, so a
  long-silent volunteer can receive one (single) reminder about an old session.

## Round 9 — Brand  (`0b96278`, `863c5c9`)

The supplied `parinaam_logo.svg` became the single source of truth for the mark:

- Three derived web assets — the original for light backgrounds, a **dark-background variant**
  (lettering whitened; the icon keeps its colours via an inline fill, since the letter "P"
  shares a CSS class with the icon's blue flame), and an icon-only **favicon** cropped purely
  by `viewBox`.
- Placed: app bar + hamburger drawer, impact hero, both sign-in pages, registration, the
  public link-form header, the browser tab, and the email header.
- **PNG renditions** (rasterised from the same SVGs with sharp at 3× display size) for the two
  surfaces SVG cannot reach: **email** (Gmail strips SVG images; the text org-name stays
  beneath for clients that block all remote images) and **certificate PDFs** (pdf-lib cannot
  render SVG). Certificates fall back to the typographic header if the asset is missing —
  a lost picture must never block a certificate.

---

## Conventions the refinements established

These emerged during the rounds and now apply app-wide; new code should follow them.

| Convention | Rule |
|---|---|
| Navigation back | Clickable breadcrumbs (sticky, under a fixed-height app bar) — never "← Back" buttons |
| Toasts | Top-right; success / failure / neutral **"No changes to save"**; every toast dismissable |
| Errors | Say what actually happened, in the user's terms, with a named `code` the UI can act on |
| Sorting | Three states (asc → desc → **none**); blanks sort last both ways |
| Validation | Shared helpers (`validateProfile`, `phoneError`) — the rule lives once; API enforces it again |
| Dates in the UI | Local wall clock, never `toISOString()` for display or "today" logic |
| Volunteer identity | Name, gender, DOB, city, state, 10-digit phone: mandatory at every write site |
| Data shown publicly | Live queries only; where content is absent, say so — never render a lookalike |
| Erased volunteers | Excluded from reports, certificates and public counts; their nulls are never backfilled |
| Brand | One source SVG; variants and PNGs derived from it, never drawn separately |

## Verification discipline

Every fix in every round was **verified against the running system before commit** — by
reproducing the bug first where one was claimed (e.g. the phantom-hours certificate source,
the impossible absent→present transition), then proving the fix, then reverting any test
mutations. The authorization matrix (`apps/api/scripts/authz-matrix.mjs`) grew with each new
endpoint and stands at **53 endpoints × 3 roles = 159 checks** at the time of writing.
