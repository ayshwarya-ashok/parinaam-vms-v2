# Post-MVP Refinements

| | |
|---|---|
| **Scope** | Everything changed after the eight implementation phases (the MVP) were delivered |
| **Period** | 2026-08-20 → 2026-10-05 (ongoing) |
| **Driver** | Hands-on testing by the product owner across fifty-eight review rounds, one full-codebase audit, and the client's phased-sessions refinement (`08`/`09`) |
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

## Interlude — Completed sessions, everywhere  (`b31fabf`, `1c9951c`, 2026-08-24)

Three small asks between the brand round and the big client refinement:

- **Program cards count completed sessions** beside upcoming (one `FILTER` added to the
  existing aggregate — no extra query).
- **Volunteers got a Completed view**: an Upcoming | Completed toggle on Browse Sessions,
  newest-first, with a "My sessions" filter; completed cards show the volunteer's own outcome
  ("✓ You attended — 3h" / absent / enrolled-no-record) instead of enroll buttons. The browse
  read model gained `scope=completed` plus per-caller attendance aggregates.
- **The session-record breadcrumb** gained the activity link (Field Execution → Program →
  Activity → Session record) — the payload already carried the ids; the page wasn't using them.
- Demo sessions with arrived dates were created under Green Bengaluru so the **"✓ Mark
  completed"** action is visible without waiting for a real date to pass.

## Round 10 — Communities, phases and visit-level attendance  (`e4ed32c`, `96ec3ab`, `3431516`, `87b8831`)

The largest post-MVP change: a client refinement (2026-08-24) reshaping what a "session" can
be. Delivered as four independently verified increments, one migration each (V013–V015).
Full design record: `08-phased-sessions-and-communities.md`.

**⚖ Product decisions (client's answers to the five design questions):**
1. Partner-side phase completion is marked by a **named lead**, never "anyone enrolled".
2. Phased sessions record attendance **per visit** — one record per volunteer per phase per
   day; certificate hours are the sum across all phases of the session.
3. Enrollment closes when a session goes `inprogress`; the admin can still add any active
   volunteer to a phase (the walk-in gate, reused).
4. Only `completed` counts as "conducted"; `inprogress` is a **separate** metric everywhere.
5. Knocking a completed phase back **reverts the session**, with an audit-log entry.

**What was built:**
- **Beneficiary communities** (V013): admin-managed master data; every published session must
  serve ≥1 (`COMMUNITY_REQUIRED` on create-as-upcoming / publish / emptying edits). Archive,
  never delete. Community pages list sessions by status; existing sessions were backfilled to
  a seeded default.
- **Session phases** (V014): `event_status` gained `inprogress`; `event_phases` carries
  ownership (`parinaam`/`partner`/`collab`), a day or date range, two completion marks, and
  audited override columns. `fn_recompute_event_phase_status` is the only writer of a phased
  session's status: all phases complete → completed (automatic — the manual action refuses
  phased sessions with `PHASED_SESSION`); any started → inprogress. **Sessions with zero
  phases keep the classic single-day lifecycle untouched.**
- **Visit-level attendance** (V015): `attendance_records` splits into two shapes — classic
  rows (one per event+volunteer) and visit rows (unique per volunteer+phase+day, presence
  only). The one-per-session UNIQUE became two partial indexes; the V012 views were rewritten
  with DISTINCT session counts while hours stay plain SUMs, so a 5-visit × 2h volunteer
  carries 10h into certificates, reports and the Impact page.
- **The trust surface**: volunteers gained their first write on session state —
  `POST /phases/:id/partner-complete`, guarded to the named lead (`PHASE_NOT_YOURS`
  otherwise). The volunteer dashboard lists open phase-lead responsibilities; session detail
  shows the phase board.

Verified live end-to-end across a 3-phase demo session (Lakefront Sapling Drive under Green
Bengaluru): auto-complete on the last mark, revert cascade with `session.reverted` audit row,
every guard code, view arithmetic, and a classic-session regression. The authz matrix grew to
**69 endpoints × 3 roles = 207 checks**.

---

## Round 11 — Pre-session emails, and three gaps dispositioned  (2026-08-25)

The client answered the remaining open items from the gap register (`09-client-doc-impact-analysis.md`):

- **⚖ decision — G2 (student data): resolved by scope.** The VMS tracks only the
  **beneficiary community** impacted by an activity; individual beneficiary details (parent
  consent, headcounts, emergency contacts, buddy pairing) are deliberately never stored.
  The current implementation already does exactly this — closed with no build.
- **⚖ decision — G3 (WhatsApp): out of scope for now.** Email remains the only channel.
- **G5 (pre-session emails): built.** Two new templates on the existing outbox → n8n → SMTP
  pipeline: `session_details` (T-7 — venue, time, coordinator contact, what the session is,
  "materials are provided by the FC" per the client doc) and `session_reminder` (T-1). A
  daily worker sweep (09:30 IST) queues them idempotently through `email_logs` — the details
  window is 1–7 days out so late-scheduled sessions still get one, and late enrollees are
  caught by the next run. **Admins can re-send either email on demand** from the session
  record ("✉ Send details / reminder email", with sent counts); manual sends bypass the
  dedupe on purpose. Verified live end-to-end: 2 queued → n8n → Mailpit → `sent`, dedupe
  excludes exactly the sent pairs, completed/cancelled sessions refuse (`NOT_UPCOMING`).
  Authz matrix: **70 endpoints × 3 roles = 210 checks**.
- Remaining backlog (email machinery now ready for them): Welcome-Back + community
  re-allotment, bulk corporate invites, feedback photo upload, sponsor pack, calendar
  export, memento note.
- Also in this round: the **last two "← Back" buttons** were removed (volunteer session
  detail, consent page) — stragglers from the Round 1 breadcrumb convention.

---

## Round 12 — Item-4 close-out  (`68906ee`, 2026-08-25)

The last of the gap register, built per the client's direction (all emails via the outbox →
n8n pipeline, all admin re-triggerable from the UI):

- **⚖ decision — Welcome-Back trigger.** Fires on the **inactive → active transition**
  (event-driven, not quarterly). The email re-allots the returning volunteer by showing their
  previous community's upcoming sessions; the directory row has a re-send button. (G12)
- **Bulk corporate invites** — "Invite volunteers" on the directory: up to 50 addresses,
  optional sponsoring organization and note; already-registered addresses are skipped and
  reported back; audited. (G6's open half)
- **Feedback photos** (V016) — volunteers attach up to two session photos to their own
  feedback; EXIF stripped like attendance evidence, private until published,
  `source = volunteer_feedback`, ownership guarded. (G7)
- **Sponsor pack** — "Send sponsor pack" on a completed session record: one email with the
  session's outcomes and 7-day signed links to up to six photos; refuses non-completed
  sessions. (G10)
- **Annual calendar export** — report type `calendar`: every non-cancelled session of the
  year with programme, activity, communities and enrolment; one-click Excel on the Reports
  page. (G11)
- **Memento note** (V016) — optional tangible-gift note at certificate issue, stored on the
  row and mentioned in the certificate email. (G9)

Authz matrix: **74 endpoints × 3 roles = 222 checks**. With this round the client-document
gap register (`09`) is fully dispositioned: every item delivered or explicitly out of scope.

---

## Round 13 — The brand palette applied  (`c556889`, 2026-08-25)

The app's colors had come from the HTML prototype (terracotta/cream); the logo's actual
brand family is blue/teal/yellow/slate. `10-brand-palette.md` derived the full palette from
`parinaam-logo.svg` (WCAG-checked shades, slate-tinted neutrals, semantic set), and this
round applied it everywhere the old values lived — theme tokens, 58 hardcoded page hexes
(including rgba shadow/glow composites), the email templates' header/footer/gradient
buttons, and the certificate PDF constants.

- **⚖ decision** — **toast styling is exempt**: the neutral grey "No changes to save" toast
  and the notistack success/error variants keep their pre-palette colors.
- Verified: both apps typecheck, zero old hexes remain outside the palette doc, a rendered
  email preview carries the brand blue with no terracotta, and the stack stayed healthy
  through Caddy (teammates on the funnel URL saw the rebrand live).

---

## Aside — the Caddy front door and sharing  (`b20a7a0`…`1accd0f`, 2026-08-25/26)

Not a product round, but it changed how every environment is reached: **Caddy became the
single origin** (`caddy/Caddyfile`, one port) for web + `/api/*` + `/mailpit/*`, and
`VITE_API_BASE_URL` became the relative `/api/v1` — the app now works unchanged behind
localhost, a tailnet name, a tunnel, or a future VM domain. The stack was then shared with
the client team via **Tailscale Funnel** (public HTTPS URL, nothing installed on their side).
The front door later moved from :8080 to **:8090** after the legacy stack's nocodb container
won a port race following a Docker restart. Full record: `runbooks/share-local-stack.md`.

Sequel (`d72af45`, 2026-09-04): the sharing runbook's one revert step — pointing
`PUBLIC_WEB_URL` back to localhost when the funnel goes off — was missed, so certificate
links in Mailpit led to the dead funnel URL. Reverted, and two latent bugs fixed with it:
the **worker never received `PUBLIC_WEB_URL` at all** (its sweep emails — pre-session,
reminders, feedback — fell back to `http://localhost:5173`, a port nothing listens on),
and both fallback defaults pointed at Vite ports. Everything now defaults to the front
door `http://localhost:8090`, and the worker carries the same variable as the api.

## Round 14 — Admin-side volunteer creation  (2026-08-26)

Two additions to the Volunteers page:

- **Bulk XLSX import** — "⬆ Import XLSX" with a downloadable reference template
  (`GET /volunteers/import-template`: the exact header row, two worked sample rows, and a
  Read-me sheet). **Only the starred columns are mandatory** (email, first/last name, gender,
  DOB, city, state, 10-digit phone — the app-wide identity rule); skills/occupation/password
  are optional. Row-by-row validation with reasons reported back (bad gender, bad phone,
  bad date, already registered) — one bad row never sinks the file; ≤200 rows; +91/0 phone
  prefixes normalised; gender matched case-insensitively.
- **⚖ decision** — the template carries **no password column**: every imported volunteer
  starts with the initial `Parinaam@123`, the import modal says so as a disclaimer, and the
  Read-me sheet tells admins to have volunteers change it after first login.
- **Change password shipped** to make that instruction real (none existed):
  `POST /auth/change-password` (current password required — a stolen access token alone
  cannot rotate the credential; all refresh tokens revoked so other devices re-login) and a
  Change-password card on the profile page. `passwordHash` is `select: false` on the entity —
  the lookup must `addSelect` it, same as login (caught live when the correct current
  password was rejected).
- **Add one volunteer** — "＋ Add volunteer" dialog with the same mandatory-fields-only rule
  and optional initial password. `EMAIL_TAKEN` on duplicates.

Both create the volunteer **approved** (the admin is the reviewer — `reviewed_by/at` set,
satisfying the V011 attributability CHECK), but consent still gates enrollment on first
login. Audited as `volunteer.imported` / `volunteer.admin_created`. Verified live: mixed
4-row import → 1 created + 3 skipped with correct reasons, imported volunteer logs in with
the default password, duplicate add 409s. Authz matrix: **77 endpoints × 3 roles = 231
checks**.

---

## Round 15 — /register became a shareable standalone page  (2026-09-01)

The registration page was built as step 2 of the landing flow: it expected email+password
handed over via router state, and a cold deep link redirected to /login — which defeated the
Parinaam team sharing the link with volunteers directly. Now a visitor with no session and no
hand-over gets a self-contained form: an inline **Your account** section (email, password,
confirm) on top of the profile fields, submitted as the same one atomic registration that
lands **pending review**. The landing-page hand-over and the legacy orphan-completion paths
are unchanged. Share `https://<host>/register` — no login, no prior step.

---

## Round 16 — Category everywhere, and Individuals with an employer  (2026-09-01)

Three asks: the Add-volunteer dialog should ask for the category (Individual/CSR), the
import template should carry it, and a **new scenario** — a person volunteering on their
own initiative while representing their company (Individual category, affiliated to an
organization).

That last one was *forbidden*, twice over: `assertCategoryRules` silently stripped the
organization from every Individual, and the schema's `volunteers_csr_org_chk` rejected the
row even when the service didn't (**V017** relaxes it — the constraint keeps its name, BR-01
is now one-sided: CSR **must** reference an organization, Individual **may**).

- **Add volunteer** — Category select + a free-solo organization field: pick an existing
  organization or type a new name. Required for CSR (submit stays disabled without it),
  optional affiliation for Individuals.
- **Import template** — new `category (Individual/CSR)` and `organization` columns with
  Read-me rules and three sample rows (blank → Individual; CSR + org; Individual + org).
  Blank category defaults to Individual; a CSR row without an organization is skipped with
  the reason reported; anything else in the column is skipped too.
- **Organizations resolve-or-create by name** (case-insensitive) in both admin paths —
  until now `GET /organizations` was the *only* organization endpoint and the catalog could
  grow solely by seed. Creation is audited as `organization.created`. The public /register
  page still offers a picker of existing organizations only — now shown to Individuals as
  well ("Affiliated organization (optional)", with a *Not affiliated* choice), while CSR
  keeps it mandatory.
- **Volunteers see their organization, read-only** — My Profile shows a "Sponsoring
  organization" (CSR) / "Affiliated organization" (Individual) field with *"Linked by
  Parinaam — contact the admin to change it"*, and the footer line reads "Individual
  volunteer · affiliated to …". Not editable anywhere by the volunteer: the field is
  read-only, the save never sends it, and `UpdateProfileDto` doesn't accept it —
  `forbidNonWhitelisted` turns a hand-crafted `organizationId` PATCH into a 400 (verified
  live).

Verified live: template columns + Read-me lines; a 5-row mixed import → 3 created
(`individual`/`csr` matched case-insensitively, `testcorp` resolved onto the just-created
`TestCorp` — created exactly once), CSR-without-org and bad-category rows skipped with
reasons; admin-create CSR without org → `ORGANIZATION_REQUIRED`; public register rejected
CSR-without-org and accepted Individual-with-org. All test rows and organizations removed
after.

Follow-ups in the same round: seed **S006** put four affiliated Individuals into the demo
data (`kavya@techcorp.in` at the CSR org for the contrast case; Infosys BPM ×2; Wipro
Cares — organizations resolved **by name**, because the app's resolve-or-create path may
have made them first, which had in fact already happened via a template-sample import).
And the volunteer's own profile now shows the linked organization as a **disabled input**
("Linked by Parinaam — contact the admin to change it") — not editable at any layer: the
save never sends it, `UpdateProfileDto` doesn't accept it, and `forbidNonWhitelisted`
turns a hand-crafted PATCH into a 400 (verified live).

---

## Round 17 — App-bar navigation went flat  (2026-09-01)

The large-screen nav items were rounded pill buttons (translucent white capsule on the
active item). Modernised to **full-height flat tabs**: each item now spans the bar's
height with no background and no rounded corners, and the state lives entirely in a 3px
indicator on the bar's bottom edge — **brand yellow** when active, a faint white hint that
slides in (`scaleX` 0→1, 180ms, disabled under `prefers-reduced-motion`) on hover. On
review, the active state grew from the underline alone to the **whole section**: a soft
white wash over the full-height tab, brightest at its base so it reads as one piece with
the full-width yellow indicator — and the **mobile drawer** speaks the same language,
rotated: flat edge-to-edge rows, a 3px yellow indicator on the active row's left edge, the
wash brightest beside it. The **breadcrumb's current page** carries it too, translated to
the light strip: a soft ink wash over the crumb, a 2px yellow bar at its base, bold label.
The
small-screen drawer, the wordmark button and the Logout pill are unchanged — Logout is an
action, not navigation, and keeps its outline-pill shape on purpose.

---

## Round 18 — The password eye  (2026-09-07/08)

Both login forms (volunteer login/signup on the landing page, admin login) gained a
show/hide **eye** on the password field, via a shared `PasswordField` component: the
toggle `preventDefault`s mousedown so it never steals focus mid-typing, and carries a
proper aria-label. On request, the reveal became **a peek, not a mode** — the field
re-masks itself after **2 seconds** (clicking the eye again re-hides immediately; the
timer clears on unmount), so a password is never left readable on a shared or projected
screen. The other password fields (public register, Profile → Change password) can adopt
the component when next touched.

---

## Round 19 — "As a student", and the last-name gap  (2026-09-08)

Two asks:

- **"As a student" on /register.** A third radio beside "An individual" and "Through my
  employer (CSR)". A student IS category **Individual** — everything downstream keys on
  Individual vs CSR — with a tracked **sub-category** (`volunteers.sub_category`, V018) and
  an **institution** picked from an admin-curated dropdown (reference_values, category
  `INSTITUTION` — ten seeded institutions plus "Other"; no free text, and the API rejects
  labels not on the list with `INSTITUTION_REQUIRED`). Students see the institution select
  in place of the organization picker. The admin directory shows the sub-category on the
  category chip ("Individual · Student"), the detail drawer opens with "Student volunteer"
  and an Institution field. Schema CHECKs keep the shape honest: sub-category only on
  Individuals, institution only on students. Verified live: valid student lands pending
  with institution recorded; bogus/missing institution → 400; Student+CSR → `NOT_ELIGIBLE`.
- **Are last name and city mandatory on /register?** City was, at every layer. Last name
  was mandatory in the form and in `validateProfile` — but the API's DTO accepted an
  **empty string** (`@IsString` without `@IsNotEmpty`). Closed on both name fields;
  verified live (`lastName: ""` → 400).

---

## Round 20 — A sub-category column, and the list exports  (2026-09-08)

- **Sub-category in the directory.** Its own sortable column beside Category: "Student"
  for as-a-student registrations, blank for everyone else (the Round 19 chip suffix moved
  here — a column can be scanned and sorted; a chip suffix cannot).
- **List exports, admin-only** — four one-click Excel downloads on the Reports page:
  **Programmes** (the existing summary), **Activities** (programme, type, status, defaults,
  session tallies), **Volunteers** (the directory: identity, category, sub-category,
  institution, organization, phase, registration, account state — erased volunteers
  excluded, per the standing reports rule), and **Volunteer–activity** (one row per
  volunteer per enrolled activity, carrying the ACTIVITY's status plus enrolled/attended
  counts and attended-only hours, V012 rule). All three new types joined the report
  registry, so the scheduler can email them on a cadence too, and every run lands in the
  run history. Verified live: all four download with the right columns; a volunteer token
  gets 403. (Found en route: the enrollments table is `event_enrollments` — the first cut
  of the volunteer–activity query 500d.)

---

## Round 21 — The field coordinator role, CSV import, and housekeeping  (2026-09-09)

Three refinements and one observation:

- **CSV joined XLSX on the volunteer import.** The same endpoint takes both: an upload
  opening with `PK` is parsed as a workbook, anything else as RFC-4180-ish CSV (quoted
  fields, embedded commas, CRLF, Excel's UTF-8 BOM) loaded into an in-memory worksheet —
  so every existing rule (starred headers, per-row validation with reasons, the 200-row
  cap, default password) applies to both formats without a second code path. Verified
  live: a CSV with a quoted "Rao, Dr" surname imported; a bad-phone row skipped with the
  reason.
- **Demo emails moved `@example.org` → `@example.com`** — 117 references across seeds,
  READMEs, runbooks, the import-template samples and the authz script, plus the 24 live
  demo accounts (erased-volunteer addresses untouched — they are `@erased.invalid`).
- **The field coordinator role** (V019, S007). A third `user_role` for on-the-ground
  staff, sharing the admin shell (sign-in at /admin/login) with a narrower cut:
  | Area | Access |
  |---|---|
  | Field Execution (incl. session record, attendance, walk-ins, visits, phase marks/override, pre-session + sponsor emails, **mark completed**) | Full — same as admin |
  | Recognition (certificates incl. issue/reissue/download, feedback incl. publish) | Full — same as admin |
  | Metrics | Full — same as admin |
  | Programs, Communities, Calendar, Volunteers | Read-only (mutation buttons hidden; the API @Roles are the real gate) |
  | Reports, Trainings, audit log, coordinator CRUD, phase/catalog structure | None |
  Demo logins: `priya@parinaam.org` / `vikram@parinaam.org` — the seeded coordinators,
  now with accounts. The dashboard drops the Trainings/Reports cards and retitles itself.
  The **authz matrix grew a fourth column**: 78 endpoints × 4 roles = **312 checks**, all
  green on first run.
- **Observation: admin calendar clicks led to the dashboard.** The shared CalendarPage
  hardcoded the volunteer route (/app/events/:id), so the admin shell's role guard
  bounced every click. The target now follows the shell: volunteers → session detail,
  admin/coordinator → the session record.

---

## Round 22 — The staff sign-in became a sibling of the landing page  (2026-09-10)

/admin/login was a lone card floating on an empty viewport while the volunteer landing got
the full hero treatment. Rebuilt in the same language: logo + "Back office" overline, a
display headline (*Behind every session, a plan.*), supporting copy, and three LIVE figures
from the same public-impact aggregates the landing uses — programs running, volunteers to
guide, hours recorded ("no invented figures on the first screen anyone sees" applies here
too) — with the familiar glassy auth card on the right. The card now says who it is for
(administrators **and field coordinators**, since Round 21) and links volunteers to their
own door. Behavior unchanged: same endpoint, same wrong-door rejection, password eye kept.

---

## Round 23 — Profiles for every role, and the password lifecycle  (2026-09-13)

- **Every role has a profile page now.** Staff (admin and field coordinator) get
  /admin/profile — the account itself (email, role) plus the change-password card, with a
  Profile item in the shell nav; volunteers keep their richer /app/profile. The
  change-password card became ONE shared component (`ChangePasswordCard`) used by all
  three, with eye-toggles on all its fields and without the "(an import or an admin add)"
  aside [obs 4].
- **Passwords expire (V020).** Volunteer and field-coordinator passwords are valid for
  **120 days** from when they were last set; admin passwords never expire. The age is
  stored (`password_changed_at`), the policy is computed — no expiry timestamps to
  backfill when the policy changes. The owner sees the expiry date on their profile, a
  shell-wide banner from 14 days out, and both turn **red at 5 days or fewer**. An
  expired password behaves exactly like an admin reset:
- **Admin reset, forced change.** "🔑 Reset a password" on the Volunteers page (admin
  only) resets any volunteer or field coordinator to the documented default, signs out
  their other sessions, and flags `must_change_password` — the route guard then funnels
  their next login straight to the profile page until they set their own. Admin accounts
  are NOT resettable this way (`NOT_ELIGIBLE`) — one admin must not quietly take over
  another. Audited as `user.password_reset`. New endpoint in the authz matrix: **79
  endpoints × 4 roles = 316 checks**, all green.
- **Staff addresses cannot self-register** [obs 2]: `@parinaam.org` (any subdomain) is
  refused at the single registration gate (`STAFF_EMAIL`) and caught early in the signup
  form.
- **The logo is the way back** [obs 3]: both login pages' Parinaam logo now links to the
  public impact page; the "Back to the impact page" button is gone.
- Also: the coordinator's read-only Programs view had one leak — the per-activity
  "+ Schedule" button on the programme detail [obs 1]; gated.

Verified live: admin expiry null; coordinator expires +120d; reset → default password +
forced change on next login → change clears the flag and restarts the clock; resetting an
admin 403s; @parinaam.org and @sub.parinaam.org registrations 400; a coordinator wound
back 116 days reports 3 days left (the red state). Demo passwords restored after.

---

## Round 24 — Age group instead of date of birth  (2026-09-15)

- **The birth date is gone, everywhere** [obs 1]. Nothing ever computed with it beyond
  "roughly how old", so the system now captures one of six AGE GROUPS (Under 18, 18-25,
  26-35, 36-45, 46-60, 60+) instead of precise PII. V021 bucketed every existing volunteer
  from their stored DOB and then **dropped the column** and its CHECK — keeping a dead PII
  column would have defeated the point. Touched at every capture site: /register, the
  volunteer profile, the admin add dialog, the pending-registration editor, the import
  template (`age_group*` column, loose matching so "18 - 25" and an en-dash both land),
  seeds, and the erasure scrub. The erased volunteer stayed NULL, as it must.
- **The password eye reached /register** [obs 2] — the standalone account section's two
  password fields now use the shared `PasswordField` (2-second peek included).
- **Copy fixes on /register** [obs 3]: "Current city", "How would you like to help?",
  "As an individual", and the submit button is just "Submit".

Verified live: register with a bucket 201 / with "17ish" 400; template carries
`age_group*`; a CSV row typed "18 - 25" imported, "twenty" skipped with the bucket list
as the reason; admin-create with a bucket 201; the migration bucketed 28 volunteers and
left the erased one NULL. Test rows removed.

---

## Round 25 — Staff enroll volunteers on their behalf  (2026-09-15)

Admins and field coordinators can now put a volunteer on a roster themselves: the session
record (upcoming sessions) gained **＋ Enroll volunteer** — a picker of active, approved
volunteers not already on the roster. `POST /events/:id/enrollments` runs the SAME
rule-dense transaction as self-enrolment, with staff judgement standing in for the
volunteer's clicks: a full session waitlists them (position reported back), a scheduling
conflict is auto-acknowledged and recorded on the row, and the BR-05 training gate is not
enforced — the confirmation email (sent to the VOLUNTEER, not the actor) still names
anything outstanding. Pending registrations and deactivated accounts are refused. Audited
as `enrollment.staff_enrolled`.

"Updated in the respective volunteer's login and other volunteers' too" needed no extra
work by construction: the volunteer's dashboard reads their enrollments, and every
capacity figure anyone else sees is a view over the same rows (BR-06: `spots_left` is
never stored). Verified live as a FIELD COORDINATOR: enroll 201 and visible in the
volunteer's own session list, double-enroll 409, pending volunteer 400, confirmation
email sent to the volunteer. Authz matrix: **80 endpoints × 4 roles = 320 checks**, green.

---

## Round 26 — Staff unenroll volunteers too  (2026-09-15)

The mirror of Round 25: every upcoming roster row on the session record gained **Remove**
(with a confirm dialog), for admins and field coordinators. `DELETE
/events/:id/enrollments/:volunteerId` reuses the self-withdrawal transaction — so the DB
trigger promotes the waitlist head exactly as if the volunteer had withdrawn themselves,
and every other login's capacity moves because capacity is a view. Unlike a
self-withdrawal, the volunteer did not click this, so they are TOLD: a new
**enrollment_removed** email (new template — remember templates load at boot; api+worker
restarted) goes to them. Audited as `enrollment.staff_removed`.

Verified live as a field coordinator: enroll then remove on Snow City — 200, gone from
the volunteer's own login, the email sent, second remove 404. A nice accident en route:
the first attempt got "waitlisted" because the client team was enrolling into Read to
Rise through the funnel at that very moment and genuinely filled it — the capacity rules
doing their job with real concurrent users. Authz matrix: **81 endpoints × 4 roles =
324 checks**, green.

---

## Round 27 — "Program", everywhere; the filter bar learns to wrap  (2026-09-15)

- **Programme → Program** across the application: 77 occurrences in 35 files — UI labels,
  toasts, email templates (certificate, invite, feedback, session details), the certificate
  PDF text, export column headers, and Swagger summaries. Newly issued certificates and
  freshly sent emails carry the new spelling; existing PDFs and sent mail are history and
  keep theirs. (The docs corpus keeps its original prose — this rename is the product's
  voice, not the changelog's.)
- **The Metrics horizontal scrollbar** turned out to be an invisible culprit: each chart
  card renders a visually-hidden TABLE for screen readers, and its sx said `width: 1` —
  which in MUI means 100%, not 1px — while `white-space: nowrap` let the table lay out at
  its intrinsic width anyway. `clip` hid the pixels but the layout box still widened the
  page. The hiding moved to a proper 1px overflow-hidden WRAPPER (the standard
  visually-hidden pattern), and the fix was verified by driving headless Chrome over CDP:
  logged in, rendered all ten charts, measured scrollWidth === clientWidth, screenshot
  clean. (A first attempt — minWidth: 0 on the grid cells — was correct hygiene but not
  the cause; kept.)
- **Filter groups wrap now.** The FilterBar's outer bar always wrapped whole groups, but a
  single group's chips ran on one unwrappable line — with one chip per program, Metrics and
  Field Execution walked off the right edge of the screen. The group container itself is
  flex-wrapped, so the chips break to new lines with the viewport.

---

## Aside — v2 on the Parinaam VM, A/B beside v1  (2026-09-17)

The Tailscale funnel retired and v2 deployed to Parinaam's own VM (`volunteer@164.52.223.64`)
as a fully self-contained stack at `/opt/parinaam-vms-v2` — v1 untouched at
volunteer.parinaam.ai, every v2 port loopback-bound, the host (systemd) Caddy the only
public door. Waiting on one thing: the `vms.parinaam.ai` A record (Cloudflare access
pending) — `scripts/vm-go-public.sh` then adds the validated site block in two minutes.
Until then the stack is reachable over an SSH tunnel (`-L 18090:127.0.0.1:8090`).

The deployment earned its keep by exercising the FIRST FRESH BOOT since Round 1, which
found three latent seed bugs no laptop could ever hit (the local DB predates them all):
the all-NULL `slides` VALUES column typing as text and killing S002 midway; the attendance
`ON CONFLICT` targeting the pre-V015 UNIQUE that V015 split into partial indexes; and
every volunteer landing `pending` because V011's approved-backfill is a migration that
runs before seeds exist. All three fixed in the seeds, proven by a throwaway-postgres dry
run of the whole bootstrap (zero errors), and the anita.rao pending registration the README
promises is now genuinely seeded. Verified on the VM: health green (db/redis/n8n), the
**324-check authz matrix**, a real email through n8n into Mailpit, and a headless-browser
admin login through the tunnel — 21 volunteers, 1 awaiting review. Full topology and the
first-boot gotchas: `runbooks/deploy.md`.

---

## Round 28 — "Awaiting your review" on the staff dashboard  (2026-09-17)

The admin/coordinator dashboard gained a section between the KPI row and the module cards:
three amber CLICKABLE cards, each a live count of actionable backlog, each a link to where
the action happens:

| Card | Counts | Lands on |
|---|---|---|
| Registrations awaiting review (**admin only** — a coordinator cannot approve, so no card) | `registration_status = pending` | Volunteers, **pre-filtered to pending** (`?registration=pending`) |
| Sessions past their date to close | upcoming, unphased, date ≤ today | Field Execution |
| Certificates ready to issue | attended hours, no issued certificate, erased excluded | Recognition → Certificates |

Cards with a zero count disappear; all-clear shows "✓ Nothing waiting on you right now."
The counts ride the existing /analytics/summary call (one round trip, both roles already
authorized). Verified in headless Chrome: section renders for admin and coordinator with
live counts (1 / 7 / 12 on the demo data), and clicking the registrations card lands on
the directory filtered to exactly the pending row.

---

## Round 29 — Certificates became the client's official artwork  (2026-09-25)

Parinaam supplied their real Certificate of Appreciation PDFs (individual and corporate
variants — teal frame, letterspaced title, Mallika Ghosh's signature, the Goodhearts
mark). Instead of redrawing an approximation, the renderer now loads the client's PDF AS
the page and overlays only the dynamic text: the recipient's name auto-sized onto the
presentation line, one quiet caption with the system facts (certificate number, `via
<organization>` on the corporate variant, program, sessions, hours — the figures the
stale-reissue logic compares), and the issue date on the date line. Pixel-fidelity is by
construction. Per-template overlay coordinates were measured by rendering a ruler grid
onto each PDF (the corporate layout sits ~10pt higher — its body runs four lines). The
legacy drawn certificate remains as the fallback when template assets are missing.

All seven issued demo certificates were reissued so their stored PDFs carry the official
artwork; a reissued corporate certificate was downloaded and visually verified. The VM
needs nothing reissued (no certificates issued there yet) — new issues use the new
renderer after the code sync.

---

## Round 30 — Certificate preview in the app  (2026-09-30)

Both certificate surfaces gained 👁 **Preview**: the volunteer wallet and the admin
certificates table open the PDF inline (a shared `CertificatePreviewDialog` — the blob
renders in the browser's own viewer, never leaving the page) with **Download** right in
the dialog, so seeing what was issued no longer means a detour through the downloads
folder. The download helper was refactored into `fetchCertificateBlob` used by both
paths; blob URLs are revoked on close. Verified in headless Chrome as a volunteer:
dialog opens, viewer carries a blob: source, Download enabled, screenshot showing the
official-artwork certificate rendered in-app. On review, the viewer's own toolbar was
suppressed (`#toolbar=0&navpanes=0`) so the dialog's Download button is the single way
out — and the zoomed preview exposed faint tips of the painted-out template label, so the
white-out band grew a couple of points and all seven certificates were reissued once more.

---

## Round 31 — Withdraw, then come back  (2026-09-30)

Reported as a confusing message ("The request conflicts with an existing record or a
business rule" on double-enrolling), diagnosed as a functional bug: the enrollment unique
key spans ALL statuses, and withdrawal keeps the row as 'cancelled' — so a volunteer who
withdrew could NEVER re-join that session; the insert hit the constraint and the generic
409 leaked out (the friendly ALREADY_ENROLLED check only looks at live rows, correctly).
The demo data even held evidence of a team member hitting exactly this. Re-enrolling now
REVIVES the cancelled row — status back to enrolled, cancelled_at cleared, enrolled_at
reset to the re-enrollment moment (a raw update: it is a create-date column TypeORM
refuses to touch), waitlist-promotion flag and skills refreshed. Verified live through
the whole cycle: enroll → friendly ALREADY_ENROLLED on the dup → withdraw → re-enroll
201 → friendly dup again. Staff enroll/unenroll share the same code paths, so they
inherit the fix.

---

## Round 32 — Finding the volunteer, not scrolling for them  (2026-09-30)

The staff "Enroll a volunteer" dialog offered the whole approved directory as a plain
select — scroll until the name goes by, capped at the first hundred rows. Replaced with a
shared type-ahead picker (`VolunteerPicker`): the search runs SERVER-side against the
same matching the directory uses (name, email or phone digits), debounced 300 ms, capped
at 20 suggestions, with everyone already on the roster hidden — enrolling a person twice
is never what the staff member means. Option rows carry the full identity (bold name,
email, category chip) instead of one crammed line, and the empty states explain
themselves: "Type a name, email or phone number…" before a query, and a note that
roster members are hidden when a search finds nobody. The walk-in dialog shared the old
select, so it got the same picker; the lazy hundred-row candidates query is gone
entirely. Browser-verified end to end: "kav" narrows to Kavya Hegde alone, "kiran"
(Kiran Rao is already enrolled) shows the roster-hidden empty state, and selecting the
match enables Enroll.

---

## Round 33 — A dead-end button on past-dated sessions  (2026-10-01)

Enrolling a volunteer into the 26 September Coat Collection Point session (date passed,
but never marked completed, so still "upcoming") walked the staff member all the way
through the picker and then refused with the generic "This session is not open for
enrollment." Two fixes. The session record no longer offers the dead end: once the date
passes, "＋ Enroll volunteer" disappears, the Status tile flips to **Closed — date has
passed** (it said "Open — accepting enrolments", contradicting reality), and an info
banner spells out the actual path — mark the session completed, then record anyone who
attended unenrolled as a walk-in. And for any route that still reaches the server gate
(a stale tab, a program paused mid-dialog), `EVENT_NOT_ENROLLABLE` now names which BR-17
leg failed instead of the catch-all: "This session's date has already passed…", "This
session is completed/cancelled…", or "Enrollment is paused because the activity/program
is on-hold/…". Browser-verified on both sides of the line: the past session shows the
banner, the Closed tile, Mark completed and no enroll button; a future session still
offers Enroll as before.

---

## Round 34 — An October worth testing in  (2026-10-01)

The three flagship programs had almost nothing on the calendar for the month the client
team is actually testing in: AAP's next session was mid-November, Chote Kadam's only
event was September's Hosur Road renovation, and Activity-Based Volunteering had nothing
upcoming at all. Seed `S008` adds seven enrollable October 2026 sessions — two Read to
Rise circles and an Infosys BPM exposure visit (AAP), an anganwadi repainting and a
school library setup (Chote Kadam), and two corporate day outings (ABV) — all future-
dated 'upcoming' with a beneficiary-community link each (the V013 rule), codes continuing
the seed block (`EVT-2026-0206…0212`, clear of the app's count-based generator). Applied
to the running local and VM databases and verified through the volunteer browse API:
every one lists as enrollable.

---

## Round 35 — The rest of the calendar  (2026-10-01)

Round 34 filled October for the flagship programs; the other five active programs still
had empty months. Seed `S009` adds fifteen enrollable sessions across October and
November 2026 — four health-camp sessions (BP screenings, nutrition counselling, first
aid), three Digital Literacy Zoom batches, three Youth Mentorship sessions, three Green
Bengaluru drives (tree plantation, nursery setup, lake clean-up), and two Winter Coat
Drive collection days. Two wrinkles of record: Environment Awareness got nothing on
purpose (the program is still draft, so BR-17 would never open its sessions), and Winter
Coat Drive was created through the UI with random UUIDs — it exists only in databases
where someone made it — so its two sessions resolve the activity BY NAME and silently
insert nothing where the program is absent (the VM today). Codes `EVT-2026-0213…0227`;
every session carries a community link. Verified through the volunteer browse API:
twenty-three enrollable sessions now span October–November.

---

## Round 36 — Volunteer codes, staff editing, catalog deletes, India dropdowns  (2026-10-01)

Seven refinements in one round, mostly identity and lifecycle (migration `V022`):

- **Human-readable volunteer code.** `volunteers.code` (`VOL-0001`, …) — sequence-backed DB
  DEFAULT so every insert path (self-registration, admin create, import, seeds) gets one;
  existing volunteers numbered in registration order. Shown as the first (sortable) column
  of the directory, in the detail drawer's overline, and on the volunteer's own profile
  ("quote it when a coordinator asks who you are"). The UUID stays the real key.
- **Edit details at any lifecycle stage.** The pending-only gate on
  `PATCH /volunteers/:id/registration` is gone and the endpoint opened to field
  coordinators; the drawer's "✎ Edit details" moved out of the pending panel and shows for
  every volunteer, every status. Each edit still audited with before/after.
- **Registered date, visible and filterable.** A sortable "Registered" column replaced the
  subtitle date; new directory filters: Account (active/inactive, server-side on
  `users.is_active`) and an inclusive registered-between date range.
- **Add Volunteer asks less, validates more.** Organization appears ONLY when category is
  CSR (where it stays mandatory); Individuals aren't asked. The phone field now runs the
  shared 10-digit validation before the button enables.
- **Delete a volunteer (admin).** A per-row Delete action wired to the existing
  data-lifecycle erasure: identity (name, email, phone, sign-in) permanently stripped,
  contributed aggregates kept — the dialog says exactly that and points to Inactivate for
  the softer intent. Erased rows don't offer Delete again.
- **Program and activity deletion (admin only).** `DELETE /programs/:id` and
  `DELETE /activities/:id` — a terminal soft delete under a hard-delete contract: status
  becomes **deleted** (new enum value), reason mandatory, who/when recorded, activities
  under a deleted program cascade. No reactivation path; every further mutation answers
  `CATALOG_DELETED` 409. The dialog demands the record's name typed back plus a reason.
  Chosen over a row delete deliberately: `events.activity_id` cascades, so a real DELETE
  would silently destroy sessions, hours and certificates under it. BR-17 blocks
  enrollment with no function change. Authz matrix grew to 83 endpoints / 332 checks
  (two new rows; the registration-edit row's fc verdict flipped to allowed).
- **State → City dropdowns (India).** `india-locations.ts` hardcodes 36 states/UTs with
  curated city lists; the shared `StateCityFields` renders two type-to-filter
  autocompletes — city unlocked after state, "Others" always last, choosing it reveals a
  free-text field whose value is stored. Used on /register and Add Volunteer.

Browser-verified end to end: Karnataka filters on "karn", its cities unlock, Others shows
the free-text field; the profile shows VOL-0001; the directory shows the new columns,
filters and per-row Delete; the program delete dialog gates on name + reason.

---

## Round 37 — Field execution columns, manual attendance parity, the help questions  (2026-10-01)

Fixes on Round 36 plus three refinements (migration `V023`):

- **Volunteer code is searchable.** The directory's one search box now also matches
  `v.code` — typing `VOL-0012` finds the person (the phone-digit fallback may add
  coincidental rows whose numbers contain the same digits; the code match itself is exact).
- **The pencil leans forward.** Every ✎ across the app became ✏️ (nine call sites).
- **Delete modal: "Keep program" → "Cancel"** (and "Keep activity" likewise).
- **Deleting an activity now deletes its future.** Not-yet-completed sessions under a
  deleted activity (or a deleted program, via the cascade) are CANCELLED with the reason
  on record — deliberately without emails; the explicit per-session cancel remains the
  flow that notifies people — and scheduling anything new under a deleted activity
  answers `CATALOG_DELETED` 409. Completed sessions stay untouched for reporting.
- **Field Execution grew real columns.** Program, Activity and Session are separate
  sortable columns; Program and Activity are filter groups (the activity list narrows to
  the chosen program), and the search box matches all three. The dispatch endpoint now
  returns the activity.
- **Manual attendance captures what the emailed form captures.** The staff Log/Correct
  dialog now takes arrival and departure times (hours derived with the same math as the
  volunteer form; the plain hours field remains the fallback for records where only a
  total is known) and, for an absence, the optional detail alongside the reason. The
  OverrideDto/AdminRecordDto accept `arrivalTime`/`departureTime`/`absenceDetail`;
  flipping to absent still zeroes hours and clears times. The quick "Add walk-in" keeps
  its hours-only shape; photos remain exclusive to the volunteer's own emailed form.
- **"How would you like to help?" on /register and Add Volunteer.** `V023` reshapes the
  catalogs: AREA_OF_INTEREST → the eight requested options (checkboxes now, not chips);
  AVAILABILITY → Weekly / Monthly / Quarterly / Occasionally / Other as a SINGLE radio
  choice — "Other" opens a free-text field whose words are stored verbatim; the notes
  textarea is relabelled ("Anything else you would like us to know?" / "…worth
  recording?"). Retired options are deactivated, never deleted — stored answers still
  resolve. Add Volunteer gains the whole section (admin-create DTO + service wired);
  state and city were already mandatory in both flows via `validateProfile`.

Verified: API-level (code search, dispatch activity, 2.5 h computed from 10:00–12:30,
absence reason+detail round-trip, cascade-cancel + schedule refusal on a scratch
activity, admin-create storing areas/frequency/notes) and in the browser (register
checkboxes/radios/Other field, Field Execution filtering 49 rows → 3 Chote Kadam rows,
the Correct dialog's time and absence-detail fields). Scratch data cleaned up after.

---

## Round 38 — /register stops asking Individuals for an organization  (2026-10-01)

The same rule Add Volunteer adopted in Round 36, applied to the public form: the
organization select now appears ONLY when "Through my employer (CSR)" is chosen (where it
stays mandatory); "As an individual" is simply not asked, and switching away from CSR
clears any organization already picked so it is never submitted silently. The V017
individual-affiliation capability is untouched — staff can still record an affiliation
from the admin side. Browser-verified across all three category switches.

---

## Round 39 — Excel-style column funnels  (2026-10-01)

The chip-button filter rows gave way to per-column funnels: every sortable table now
carries a funnel icon beside the sort control, opening a multi-select checkbox dropdown
of the column's DISTINCT values — derived from the data, never hardcoded — with a Clear
action, the funnel tinted while active, and blanks filterable as "—". Built once in the
shared `SortableCell` (+ `useColumnFilters` hook) and applied across the app:

- **Field Execution** — Program, Activity, Volunteer email, Coordinator email, Report.
- **Volunteer Directory** — Category, Sub-category, Registration, Account. This table is
  server-paginated, so the funnels drive the API (the filter params now accept comma
  lists and `IN (…)` server-side) and their option lists come from new `meta.facets` —
  the distinct values the WHOLE directory holds, not just the visible page. The
  dashboard's "awaiting review" deep-link and button now set the Registration funnel.
- **Issue Certificates** — Program and Certificate (Issued/Pending) funnels; bulk issue
  arms when the Program funnel holds exactly one program.
- **Reports** — the combined "Category / phase" column split in two, each funneled; the
  volunteer exports mirror a single-value funnel selection (the export API takes one
  value — a multi-selection exports the broader set). The runs table gained funnels on
  Report, Format, Status and Source.
- **Assessments** — the status chips became the Status column's funnel (Passed / Not
  passed / Attempts exhausted), with all rows loaded and filtered client-side.
- **Activity detail** — Coordinator and Status funnels on the sessions table.
- **Session record roster** — Attended and Logged-by funnels.
- **Scheduled reports** — Cadence and Status funnels.

Card-style pages keep the filter bar but lose their hardcoded lists: **Trainings** and
**Programs** now derive category/status options from the loaded data (filtering moved
client-side so retired values disappear and new ones appear by themselves). Already-
dynamic lists (Feedback and Metrics program/city) and semantic toggles (rating buckets,
time periods, archived-view, the volunteer Browse view) stay as they are — they are
buckets and view modes, not value lists.

Verified in the browser: Field Execution's Program funnel lists all nine programs from
data, two ticks narrow 49 rows to 8 across exactly those programs, Clear restores all;
the directory's Registration funnel multi-selects pending+rejected server-side (3 rows).

---

## Round 40 — Tables fit the screen  (2026-10-01)

The nine-column tables (directory, field execution) needed a horizontal scroll on a
laptop. Fixed by UNIFORM COMPACTION, never by confining a column (the first cut wrapped
the action buttons onto two lines inside a capped Actions cell — reverted on review):
the theme's `MuiTableCell` override tightens every cell's padding (MUI's 16px gutters →
7px), in-table action buttons went one size down (0.72rem, slimmer pills) while keeping
their full labels on a single line, column headers may wrap to a second line so a long
header ("Coordinator email") never dictates its column's width, and the sent-badges
drop the year the Date column already shows. Verified by measurement, not eyeballing:
a headless sweep across every table-bearing page — directory, field execution, reports
(both tables), scheduled reports, certificates, assessments, activity sessions,
session-record roster — reports `scrollWidth === clientWidth` (zero overflow) on every
table at BOTH 1366×768 and 1280×800.

Addendum, same day: the directory's Sub-category column was removed to buy the Actions
column more room — a student volunteer now shows "Student" as the Category chip's label
(Student is Individual plus a sub-category, so one chip carries both), and the detail
drawer keeps the full breakdown.

---

## Round 41 — Live search without the flicker  (2026-10-02)

Typing in any table's search box used to re-run the query per keystroke, and React Query
drops to "no data" while a new key loads — so the table blanked and re-rendered with
every letter. Two-part fix, applied to every searchable list for both roles (directory,
field execution, certificates, reports, trainings, programs, and the volunteer's Browse
sessions): a shared `useDebouncedValue` hook lets the input stay instant while the query
only fires once typing pauses (300 ms), and `placeholderData: (prev) => prev` on the list
queries keeps the previous rows on screen while the next result loads. Measured, not
assumed: typing "kavya" at human speed fires exactly ONE /volunteers request for five
keystrokes, and a 60 ms row-count sampler never once saw an empty table — 25 rows step
directly to the single match.

---

## Round 42 — Deletion reaches the volunteers  (2026-10-02)

Rounds 36–37 made catalog deletes terminal for staff; this round carries the consequence
through to everyone else:

- **No dead scheduling buttons.** The program page's per-activity "+ Schedule" disappears
  when that activity (or the program) is deleted — the 409 behind it stops being
  reachable from the UI at all.
- **Phases die with their session.** Every phase mutation — edit, remove, start, both
  completion marks, and even the override that legitimately reopens ordinary
  cancellations — now refuses with `CATALOG_DELETED` when the owning session was
  cancelled by a catalog delete. (Ordinary cancellations keep their reopen path.)
- **Enrolled volunteers see it.** `/enrollments/me` carries `event_deleted`; the
  dashboard gains a "No longer happening" section listing deleted/cancelled enrollments
  struck through with a red chip, counted in neither "upcoming sessions" nor "hours
  committed" — the calendar was already free of cancelled sessions, so their schedule is
  genuinely released. Phase partner-leads keep seeing their phase on the dashboard,
  struck through as **deleted** with "nothing more is needed from you".
- **Unenrolled volunteers see it too.** The volunteer session detail used to 404 for any
  cancelled session (its lookup went through a scope that excluded them); a new
  detail-only scope finds them, the page shows a plain banner — "This session was deleted
  by Parinaam…" (or the cancellation reason) — with a deleted status pill, and the browse
  payload now carries `cancelReason`/`isDeleted` for any view that needs the distinction.
- **Found along the way:** the PRG/ACT/EVT code generators used row COUNTs, which collide
  with surviving codes the moment any row is deleted — new program creation was actually
  broken on the local stack. All three now take MAX(existing numeric suffix) + 1.

Verified on a scratch program end to end: activity delete cascaded (1 session cancelled
with the reason on record), admin phase-start and the partner-lead's own completion both
answered CATALOG_DELETED, Kavya's session detail returned 200/cancelled/isDeleted instead
of 404, her `/enrollments/me` and `/phases/mine` both carried the deleted flag, December's
calendar had no trace of it, and the dashboard screenshot shows the struck-through phase
and the "No longer happening" card. Scratch data removed after.

---

## Round 43 — Pagination, a real program picker, and tooltips everywhere  (2026-10-04)

- **Pagination** came to the two remaining long tables — Issue Certificates and Field
  Execution — 25 rows per page, controls above the table per the house convention,
  client-side over the filtered rows, snapping back to page one when the search or a
  funnel changes.
- **The feedback Program filter became a true multi-select dropdown.** It was already
  dynamic (fed by the live program catalog); now several programs can be ticked at once,
  "All programs" heads the list and clears the selection, and the submissions filter
  client-side on `program_id`. The analytics tiles follow the selection when it is a
  single program and show the whole picture otherwise (their endpoint takes one program).
- **Tooltips on the action buttons, app-wide, both roles.** Every consequential button
  now explains itself on hover in one precise sentence — what happens, who gets emailed,
  and whether it can be undone. Covered: the volunteer directory (add/import/invite/
  reset, approve/reject/welcome-back/inactivate/activate/delete, edit details), field
  execution (record, send/resend), the session record (mark completed, enroll, sponsor
  pack, pre-session emails, walk-in, unenroll, log/correct), program and activity pages
  (edit, publish, announce, discontinue/reactivate, add activity, schedule, delete),
  certificates (issue, bulk issue, PDF, preview, resend, reissue), reports (every
  export), trainings (add, assessments, edit, inactivate), feedback (publish/retract
  testimonial), and the volunteer's own enroll/withdraw/waitlist and certificate buttons.

Browser-verified: Field Execution pages 49 rows as 1–25 / 26–49, certificates shows its
pagination, hovering "✉ Send emails" renders its exact tooltip, and ticking one program
in the feedback dropdown narrows five cards to that program's one.

Addendum (3d): every table cell app-wide is now LEFT-aligned — all 44 right/center
alignment props across the eight table pages removed (numeric columns, action columns and
the empty-state rows included), so the eye tracks one consistent edge down every column.

---

## Round 44 — The registration form, round two  (2026-10-04)

Migration `V024`; the public form and Add Volunteer move in lockstep.

- **A real thank-you.** Submitting /register now lands on a dedicated screen with the
  client's exact message — "Thank you for registering. Our team will review your details
  and get in touch with you. We thank you for being a Goodheart." — plus two actions:
  "Go to my dashboard" (the account is signed in and pending review) and **"Register
  someone else"**, which signs the fresh session out and reloads a clean /register — the
  household-sharing-one-device case.
- **"Volunteering as" moved up** to be the second question, right after Your account —
  the answer shapes what the rest of the form asks.
- **"Through my employer (CSR)" → "Through my organization (CSR)"**, and the organization
  select became the client's partner list — Odessa, PwC, Deutsche Bank, IG Group,
  Finastra (pre-seeded by V024) — plus **Other**, which opens a free-text field. The form
  now sends the organization by NAME; the API resolves it case-insensitively and creates
  unknown names (audited), on both the register and legacy profile-completion paths. Add
  Volunteer's autocomplete leads with the same five.
- **"City" reads "Current city"** in both flows (one label change in the shared
  `StateCityFields`).
- **Occupation became a dropdown** (optional): Salaried / Working Professional, Retired,
  Homemaker, Business Owner / Entrepreneur, Freelancer / Consultant, Other — "Other"
  reveals "Please specify your occupation", and whatever is typed is stored verbatim in
  the existing column, so historical free-text occupations stay valid. Options live in
  the reference catalog (OCCUPATION).
- **"How did you hear about Parinaam?"** (optional) — Website, Social Media, Friends &
  Family, Corporate, Existing Volunteer, School or College, Others — new
  `volunteers.referral_source`, catalog-driven (REFERRAL_SOURCE), asked in both flows and
  shown in the admin drawer as "Heard about us via".
- **Activate now overrides the registration verdict.** Reactivating a rejected (or
  pending) account sets its registration to approved, records the admin as reviewer,
  clears the rejection reason, and writes a `volunteer.registration_overridden` audit
  entry — an account that can sign in is an account the foundation has accepted. (No
  approval email is sent on this path; the explicit Approve button remains the flow that
  notifies.)

Verified end to end: an API registration stored referral/occupation/PwC link; a FULL
browser registration (CSR → Deutsche Bank, occupation Other → "Beekeeper", referral
Friends & Family, Karnataka → Bengaluru) landed on the thank-you screen with the exact
message, "Register someone else" produced a clean signed-out form, and the row carried
every answer; reject-then-Activate flipped a volunteer to approved with the reason
cleared. Test registrants removed after.

---

## Round 45 — Catalog form hardening, planned windows, mobile audit  (2026-10-04)

- **Programs and activities gained an optional planned window** (`V025`:
  `start_date`/`end_date` on both, DB CHECK end ≥ start). The "is it needed?" question
  was answered deliberately: sessions stay the source of truth for when work happens,
  but programs/activities are often seasonal (a winter drive, a collection window), so
  the dates exist as OPTIONAL, purely informational fields — they never gate enrollment.
  Shown as "🗓 Planned window" on the program page and a date chip on the activity page.
- **Description became mandatory** on both Add Program and Add Activity (create requires
  it; an edit cannot empty it; existing null descriptions remain untouched), and
  **location became mandatory on Add Activity** — every session needs somewhere to happen
  by default. Enforced in the forms and again in the API DTOs.
- **Mobile responsiveness audited, not assumed:** a headless sweep at 390×844 across
  fourteen pages — /register, the impact page, six volunteer pages (dashboard, browse,
  calendar, trainings, certificates, profile) and six admin pages (dashboard, directory,
  field execution, programs, metrics, session record) — measured ZERO body-level
  horizontal overflow on every one. The hamburger drawer nav is present throughout,
  header actions wrap into pill rows, and wide tables scroll within their own container
  (the accepted mobile pattern). No fixes were needed — the Round 40 compaction and the
  app's grid layouts already hold at phone width.

Verified via API too: program create without a description → 400, end-before-start →
"The end date is before the start date.", a valid window round-trips, and activity
create without a location → "Location is required".

---

## Round 46 — Walk-in times, and the coordinator report from the admin side  (2026-10-04)

Completing 8c — manual capture now matches the emailed forms on every path:

- **Walk-ins record arrival and departure times** (the hours are derived with the same
  math as the volunteer's emailed form and shown live in the dialog), replacing the bare
  hours number. The backend had accepted times since Round 37; the dialog caught up.
- **Staff can file — and override — the Field Coordinator Report.** A new
  `POST /events/:id/report` (admin + field coordinator; authz matrix now 84 endpoints /
  336 checks) carries the exact field set of the emailed link: session status
  (Completed / Partially completed / Postponed / Cancelled), actual start/end, volunteers
  present and beneficiaries reached (both required), highlights / challenges / notes, and
  up to two evidence photos (EXIF/GPS stripped by the same pipeline — `storeEvidence` was
  refactored to take an eventId so both the token path and the staff path share it). The
  session record gains a "📋 Submit report" button that becomes "✏️ Override report" when
  one exists, opening prefilled with the current report and a plain "submitting again
  replaces it" warning. The report stays attributed to the session's coordinator; who
  filed or overrode it is in the audit trail (`report.staff_submitted` /
  `report.staff_overridden`).

Verified: staff submit + override round-tripped on July Drive via API (the seeded report
was restored afterwards), the authz matrix passes with the new row, and the browser shows
the walk-in time fields with the derived-hours note and the prefilled override dialog.

---

## Round 47 — The session-phases concept, removed entirely  (2026-10-04)

A product reversal, by client decision: **there are no session phases**. No phase
responsibility, no partner leads, no visit-level attendance — every volunteer enrolls
directly in a session, attendance is one record per volunteer per session, and a session
closes through the explicit "Mark completed" action. (The volunteer-lifecycle phase —
Onboarding / In Training / Active / Inactive — is a different concept and is untouched,
as are beneficiary communities.)

- **V026** drops `event_phases`, `fn_recompute_event_phase_status`, the `phase_status` /
  `phase_responsibility` enums, and the `phase_id` / `visit_date` columns on
  `attendance_records`, restoring the full `UNIQUE (event_id, volunteer_id)`. **No hours
  are lost**: each volunteer's visit rows are folded into a single per-session record
  whose hours are the sum of their visits — exactly what certificates and reports were
  already reading (the Chote Kadam mentor's 3 h survive as one plain record).
- **API**: the nine `/phases/*` routes, `/phases/mine`, partner-complete, and the two
  visit endpoints are gone (404), along with `PhasesService`, the `EventPhase` entity,
  the phase DTOs, and every `phase_id` predicate. The session record, admin event
  detail, and volunteer session detail no longer carry `phases`/`visits`; the dashboard
  "sessions to close" count no longer excludes phased sessions. "Mark completed" also
  accepts the legacy `inprogress` status, so sessions stranded in it close normally —
  the enum value stays for history.
- **Web**: `PhasesPanel` deleted; the session record's Phases section, the volunteer
  dashboard's "My phase responsibilities", the session detail's phase cards and
  "Mark my side complete", and the activity table's n/n-phases counter are all gone.
  "Mark completed" now also appears on `inprogress` sessions whose date has passed.
- **Seeds**: S005 no longer plants the seven-phase mentor journey — it seeds the same
  single attendance record V026 produces on a migrated database; S002's attendance
  conflict target returns to the plain `(event_id, volunteer_id)`.
- The authz matrix shed the nine phase/visit rows: **73 endpoints × 4 roles = 292
  checks**, all passing. `docs/08`/`docs/09` carry superseded banners.

Verified: fresh-boot dry-run on a throwaway Postgres 16 (26 migrations incl. V026, no
phase tables/types/columns, seeds apply cleanly, mentor hours intact); API probes show
no `phases`/`visits` keys anywhere and 404s on every retired route; the formerly
seven-phase Anganwadi session was closed live via "Mark completed"; browser checks
(admin session record, activity detail, volunteer dashboard and session detail) render
phase-free with the lifecycle chip still in place.

---

## Round 48 — Custom certificates  (2026-10-05)

Staff can now thank a volunteer personally, not only per program. A new **Recognition →
Custom certificates** screen (admin **and** field coordinator) carries the whole flow:
pick the volunteer, write the text, preview the exact PDF, issue — and see everything
already issued to that volunteer, each with a real thumbnail of its document.

- **Only the appreciation paragraph is editable.** The official artwork stays fixed —
  logo, title, presentation line, signature, Goodhearts strapline, date. The editable
  band was measured off the template (baselines ≈278/260.5/243 pt, bounded by the name
  label above and the strapline below); user text is wrapped and auto-sized through
  three settings (12.5 pt / 3 lines down to 10.5 pt / 4 lines) and **refused with
  `TEXT_TOO_LONG` when it cannot fit** — the layout is never squeezed. The UI caps
  input at 75 words / 480 characters with a live counter; the renderer is the final
  authority (very wide text can fail sooner, with a clear message).
- **Preview before issue**: `POST /certificates/custom/preview` renders the exact PDF
  watermarked **PREVIEW — not issued**, consuming no number and storing nothing.
- **Issue**: `POST /certificates/custom` numbers it from the same `PAR-<year>-######`
  sequence, renders on the individual artwork, stores the PDF, and emails it with a
  dedicated `custom_certificate_issued` template (the program wording would not fit).
  A volunteer may hold any number of custom certificates; erased volunteers refuse
  with `VOLUNTEER_ERASED`.
- **Per-volunteer certificate view**: `GET /certificates/volunteer/:id` (staff) lists
  both kinds; the screen shows each with number, kind chip, excerpt or program facts,
  and View / PDF / Resend. **Thumbnails are real**: the question "can a thumbnail be
  generated?" is answered client-side — pdf.js (`pdfjs-dist`) renders page 1 of the
  authenticated PDF into a canvas, so no server-side rasterizer (Ghostscript/Chromium)
  was added to the image.
- **Schema (V027)**: `certificates.kind` (`program`|`custom`), `custom_text`,
  `program_id` now nullable, with a CHECK tying the three together. Reissue on a
  custom certificate refuses (`CUSTOM_CERTIFICATE` — nothing to recompute); resend
  works. The volunteer wallet shows custom certificates as "Personal appreciation —
  From Parinaam Foundation".
- Authz matrix: +3 staff-only rows — **76 endpoints × 4 roles = 304 checks**.
- **Fix (same round):** issued custom certificates print **no certificate number** on the
  artwork — the identifier lives in the record, the file name and the email, keeping the
  document itself clean (program certificates keep their facts caption; previews keep the
  "PREVIEW — not issued" notice). The three custom PDFs already issued were re-rendered in
  place to the new look.
- **Fix (same round):** the compose counter shows **one combined message** — only the
  binding limit (words for short-word prose, characters for long-word prose; e.g.
  "76 / 75 words — too long for the certificate"), instead of the two side-by-side
  counters that could look out of sync. Both caps still gate; only the display changed.
  (An earlier variant of this fix — gray disabled pills app-wide plus a server-side word
  cap — was applied and then reverted at the product owner's request.)
- **Fix (same round):** Adminer was unreachable after a from-scratch rebuild — the compose
  port mapping pointed host 8082 at container port 8090, but Adminer listens on 8080; the
  long-lived typo was masked by a container that predated it and surfaced when
  `down -v && up` recreated everything. Mapping corrected (local and VM).
- **Fix (same round):** the Feedback page's Programs filter printed its label on top of
  the rendered "All programs" value — a `displayEmpty` Select whose `InputLabel` stayed
  un-shrunk at the empty value. The label is now pinned `shrink` with a `notched`
  outline, so it floats on the border like every other filled field.

Verified: ruler-overlay measurement of the artwork, Ghostscript renders of an issued
PDF and a watermarked preview inspected visually; API round-trip as both admin and
field coordinator (preview 201, wide-text 400 `TEXT_TOO_LONG`, issue `PAR-2026-000014`,
list shows both kinds, reissue 409, resend 201, volunteer download 200); Mailpit
received the custom email; browser run drove the full screen — picker keystrokes,
live counter, preview dialog, confirm-and-issue toast (`PAR-2026-000015`), and four
pdf.js thumbnails with real ink; fresh-boot dry-run applied all 27 migrations cleanly.

---

## Round 49 — Data Tools: the feature-flagged reset to the client baseline  (2026-10-05)

A new **Data Tools** page for operating the demo environment — admin-only **and** behind a
feature flag, so it exists exactly where it is wanted and nowhere else.

- **Feature flag `DATA_TOOLS_ENABLED`** (env, default `false`): gates the API
  (`GET /data-tools/status`, `POST /data-tools/reset`) and the UI — the nav item appears
  only when the server says the flag is on, and the page itself explains how to enable it
  when visited with the flag off. Flipping the flag is an env change + API restart.
- **Admin only**: both endpoints are `@Roles('admin')` (matrix rows added — **78 endpoints
  × 4 roles = 312 checks**); field coordinators neither see the nav item nor pass the
  route guard; the layout's fc nav filter excludes it explicitly.
- **The reset** (one transaction, audited as `data.reset`): returns the database to the
  client baseline —
  **kept:** the client-document catalog (AAP, Chote Kadam, Activity-Based Volunteering:
  3 programs, 4 activities, 5 sessions — upserted field-by-field, so renamed / cancelled /
  soft-deleted client rows come back canonical), **10 curated volunteers** (the
  demo-interesting set: certificate holders, the CSR + affiliate pair, the consent-gate and
  pending-registration subjects), the **primary admin**, and **3 field coordinators**
  (`arjun@parinaam.org` is created when only two exist), plus trainings, coordinators,
  communities of the client set and the audit trail;
  **removed:** every other program/activity/session and volunteer, and all enrollments,
  waitlists, attendance, coordinator reports, certificates (stored PDFs deleted too),
  feedback and email logs. The CSR mentor's canonical 3 h attendance row is restored.
- **Safety**: the API demands the literal `confirm: "RESET"` (so the authz matrix's
  empty-body probe can never fire it), the page arms its button only after typing
  **RESET** (case-sensitive), and the action is **idempotent** — running it twice lands on
  the same baseline. With the flag off the reset answers `404 DATA_TOOLS_DISABLED`.

Verified: API round-trip (status, wrong confirm 400, reset → `{3,4,5,10,3,1}`, second
reset identical); SQL inspection of the kept emails, fc trio, catalog statuses and clean
residue tables; flag-off behavior (`enabled:false`, reset 404); browser run — admin sees
the nav item, the type-in gate arms only on the exact word, the summary tiles render, and
the field coordinator has no nav item and is bounced off the direct URL; the authz matrix
passes at 312. The local stack was rebuilt to the full demo dataset afterwards.

---

## Round 50 — "Reset & seed demo data": the date-anchored demo baseline  (2026-10-05)

Round 49's retain-based reset became a full **demo seeder** (product owner's request): the
button now wipes the database and plants a complete, scripted client-demo dataset whose
**session dates are computed from the current date** — run it any day and every status is
ready to show. Same guardrails as before: `DATA_TOOLS_ENABLED` flag, admin-only, typed
RESET + `confirm: "RESET"`, one transaction, audited, idempotent (deterministic ids — two
consecutive runs produce the identical baseline).

What a run seeds, anchored to "today":

- **Catalog**: AAP, Chote Kadam, Activity-Based Volunteering; four activities, with
  Corporate Day Outing **discontinued** (the BR-17 enrollment block demoable on its
  upcoming Snow City session).
- **10 sessions**: completed ×3 (T−30/−14/−7), **in progress** (T−10), **today** (the
  dispatch / mark-completed demo), **full-with-waitlist** (T+7, 2/2 enrolled + 1 waiting),
  open upcoming (T+21), **draft** (T+30), **cancelled** (T+3, with reason), and the
  blocked outing (T+14).
- **People**: the primary admin (kept, never recreated — it is the caller), 3 field
  coordinators (priya / vikram / arjun), and 8 scenario volunteers — certificate holder,
  pending-issue candidate, waitlisted custom-certificate holder, absence-on-record,
  consent-gate (Onboarding), **pending registration** (In Training), and the CSR +
  TechCorp-affiliate pair. Compliance is earned honestly: consents plus passing attempts
  on every mandatory training, then `fn_recompute_volunteer_phase` — so Active/In
  Training/Onboarding all appear for real reasons.
- **Field execution**: enrollments, a waitlist, attendance covering times-derived,
  plain present, absent-with-reason, admin-recorded and walk-in, plus a filed
  coordinator report.
- **Recognition**: feedback with ratings/NPS/tags and one **published testimonial**
  (live on the public page), and three **real certificate PDFs** rendered through the
  actual renderer — individual (deliberately made **stale** post-issue for the Reissue
  demo), corporate (naming TechCorp), and one custom (Round 48).
- **Kept from the live data**: only the training catalog and the audit trail. No emails
  are sent while seeding — every email flow stays demoable live.

The implementation lives in `data-tools.service.ts` (the API can render PDFs and call the
lifecycle function — things a SQL seed cannot), which also ends the Round 49 duplication
with S005. The first-boot SQL seeds are untouched. Three seed-time constraint lessons are
encoded: discontinued activities and cancelled events must set their timestamp columns
with the status (CHECKs), and `vol_again` is an enum (Definitely/Probably/Not sure/Unlikely).

Verified: two consecutive runs return the identical summary (3/4/10/8/3/1 + 10 enrollments,
7 attendance, 4 feedback, 3 certificates); SQL inspection of statuses and date offsets
against the IST anchor date; capacity view shows the full session (2/2 + 1 waiting) and the
discontinued block (`is_enrollable = false`); the certificates list flags the stale one and
the wallet/custom listings are right; the public page carries the testimonial; browser run
drove the renamed button end to end and checked the volunteer-facing browse (today's
session, full session, waitlist) and wallet; authz matrix 312 — unchanged and passing.

---

## Round 51 — Feedback without login: the signed-link form  (2026-10-05)

"Share my feedback" in the email used to land on the login page. It now opens a
**standalone feedback form directly — no sign-in** — the same signed-link pattern the
attendance and coordinator-report emails use (BR-13: the token IS the authentication).

- **The sweeper issues a personal token** per invitation (`access_tokens`, purpose
  `feedback` — the enum had the value reserved since V-day one, so no migration) and the
  email button carries `PUBLIC_WEB_URL/feedback/<token>`; the email says plainly that no
  sign-in is needed.
- **Public endpoints** (`@Public` + throttled, like the attendance links):
  `GET /feedback/link/:token` returns the form context — volunteer first name, session
  facts, the live tag vocabulary, and whether a submission already exists;
  `POST /feedback/link/:token` (multipart) accepts the same field set as the signed-in
  form — rating, NPS, would-volunteer-again, went-well, issue/improvement tags with
  details, comments, and up to two photos through the same EXIF-stripping pipeline.
- **Same rules as BR-09**: the token is bound to one (volunteer, session); the first
  submit consumes it; inside the grace window a resubmission **replaces** the earlier
  answers (tags re-written, same row); a submission made any other way blocks the link
  with "already submitted". Expired/invalid/consumed links get the same friendly
  failure pages as attendance.
- **The web form** (`/feedback/:token`) reuses the `LinkFormShell` — mobile-first, the
  session facts up top, stars + NPS as the only required answers.
- **Admin / field coordinator visibility needed no work by design**: link submissions
  land in the same `feedback_submissions` row set the Recognition → Feedback screen
  (both roles) and the analytics already read.
- Authz matrix: +2 rows — **80 endpoints × 4 roles = 320 checks** (the POST row is
  'allowed' for everyone by matrix semantics: body validation fires before the
  in-handler token check).

Verified end-to-end on the real pipeline: a forced sweeper run queued two invitations
(each with its own link), the worker dispatched them through n8n into Mailpit, and the
link **taken from the email body** was driven in a headless browser — form rendered with
live tag options, stars + NPS picked, submitted, thank-you page shown — with the row
visible to the field coordinator in `GET /feedback` seconds later. A forged-token API
pass additionally proved context, tag + photo storage (1 photo stored), grace-window
resubmission (`replaced: true`), and 401s on invalid tokens.

---

## Round 52 — Feedback detail drawer  (2026-10-06)

Every card on Recognition → Feedback (admin **and** field coordinator) is now **clickable**:
hovering hints at it, and a click (or Enter/Space — the cards are keyboard-reachable) opens
the full submission **read-only in a right-side drawer** — volunteer, session and program
facts, the star rating and NPS as tiles, would-volunteer-again, every tag and free-text
answer, the published state, and — new — the **photos the volunteer attached**, as
thumbnails that open full-size in a new tab.

- `GET /feedback/:id/photos` (staff only; matrix now **81 endpoints × 4 = 324 checks**)
  returns two-hour signed URLs; the list rows gained a `photo_count` (shown as a 📷 badge
  on the card).
- **One real bug found and fixed on the way**: the API signs photo URLs against its public
  host (`PUBLIC_API_URL`), but the app serves from one origin and helmet's
  `Cross-Origin-Resource-Policy: same-origin` blocks cross-origin images — the thumbnail
  rendered broken. The signature covers only path+expiry, so the web client now routes the
  same signed query through its **own `/api` base** (same origin via Caddy/Vite proxy),
  which works identically on local and the VM.
- The card's **Publish/Retract button stays independent** (`stopPropagation`) — clicking it
  never opens the drawer; the drawer itself is strictly read-only (no inputs) and points
  back at the card's button for publishing.

Verified in the browser: drawer opens from a card click with all content and a loaded
photo (screenshot), closes on the X, publish-from-card fires its toast without opening the
drawer; the photos endpoint and its signed URL were fetched end-to-end (200, image/jpeg);
the matrix passes at 324.

**Fix (same round) — "published it, but the impact page doesn't show it":** two causes
stacked. The public testimonials query quoted only `comments`, so a published submission
whose text lived in *What went well* (common on the link form) vanished silently — the
quote now **falls back to the went-well answer**, and publishing a submission with
*neither* is refused outright (`NOTHING_TO_PUBLISH`, with a clear message). And the public
payload is cached in-process for 5 minutes, which read as "publishing doesn't work" —
**publish/retract now invalidates that cache**, so the page reflects on the very next
load. Verified live: publish → quote on `/public/impact` immediately (went-well fallback,
"Deepa K."), retract → gone immediately. The drawer's overline also lost its
"— read only" suffix (product owner request).

---

## Round 53 — The anonymous feedback link  (2026-10-06)

A **standing, shareable feedback form** anyone can submit — no login, nothing identifying
stored. It lives at a stable URL (`/share-feedback`), which is exactly what makes it both
shareable over email **and** safe to hardcode behind the impact page's button (a generated
token would add nothing once the URL sits on a public page).

- **The impact page's "✏️ Submit Feedback" button** now opens the form (it used to route
  to the login page); its caption says plainly: anonymous, no sign-in, two minutes.
- **The form** (LinkFormShell styling): star rating and NPS 0–10 required; an optional
  "what is this about?" line and free comments. An info note tells recent volunteers
  their post-session email carries a personal link that ties feedback to the session.
- **Sharing over email**: Recognition → Feedback gains a **"🔗 Copy feedback link"**
  action that puts the URL on the clipboard, ready for any email or chat.
- **Schema (V028)**: `feedback_submissions.volunteer_id`/`event_id` now nullable,
  `is_anonymous` + `about_label` added, with a CHECK that a row is either fully
  attributed (BR-09) or fully anonymous — never half of each. The
  `UNIQUE (volunteer_id, event_id)` never binds anonymous rows.
- **Staff see everything in one place**: anonymous rows appear in the same Feedback
  screen (admin + field coordinator) as "Anonymous" with an Anonymous chip, the
  about-text where the session name would be, and no date; the detail drawer renders
  them read-only like any other. Analytics LEFT-JOIN so anonymous submissions count in
  the overall numbers and drop out naturally under a program filter. Publishing an
  anonymous testimonial attributes it as **"Anonymous"** on the public page.
- `POST /feedback/anonymous` is `@Public` with a tight throttle (5/min per client);
  the matrix grew to **82 endpoints × 4 roles = 328 checks**.

Verified: anonymous submit with no auth (201) and range validation (400); the staff list
shows the row as Anonymous/about-text/no-date; a browser run walked the impact page
button → form → submit → thank-you; the authz matrix passes; a fresh-boot dry-run applied
all 28 migrations cleanly.

---

## Round 54 — Admin-created volunteers get their credentials emailed, and must set their own password  (2026-10-09)

The admin "Add volunteer" flow used to leave the initial password as word-of-mouth
("blank uses Parinaam@123 — ask them to change it"). Now, **with or without a custom
initial password**:

- **The volunteer is emailed their sign-in details** the moment the account is created —
  a new `volunteer_account_created` template carrying the login email, the exact initial
  password (the admin's custom one, or the default), the sign-in button, and the plain
  statement that **the first login will ask them to set a password of their own**.
- **That statement is enforced, not aspirational**: admin-created accounts start with
  `must_change_password = true`, so the existing guard (the same one the admin
  password-reset flow uses) pins their first session to the password-change screen;
  changing it clears the flag and revokes old sessions.
- The Add-volunteer dialog's helper text and the success toast now say what actually
  happens ("their sign-in details were emailed; they must set their own password on first
  login"), and the audit row records `credentialsEmailed: true`. A failed email send
  never blocks account creation (same stance as the approve/reject mails).
- **Scope**: the single Add-volunteer path only. Self-registration is untouched (those
  volunteers choose their own password on the form — nothing to email, nothing to force),
  and the bulk Excel import keeps its advisory-only default, as before.

Verified end-to-end: created one volunteer without a password and one with a custom one —
both emails landed in Mailpit with the exact password and the first-login notice; both
accounts carry `must_change_password = true`; the no-password account then logged in with
the default, changed its password (204 → flag cleared, sessions revoked), and signed in
normally with the new one.

---

## Round 55 — Deactivation tells the volunteer  (2026-10-09)

Reactivation has always emailed the volunteer (the Welcome-Back mail, on the inactive →
active transition); deactivation was silent — the next thing a deactivated volunteer saw
was a failed login with no explanation. Now the **active → inactive transition sends an
`account_deactivated` email**: neutral wording (no reason is exposed), the assurance that
their record — hours, trainings, certificates — is kept and returns with the account, and
a way back (`admin@parinaam.org`). Like every notification, a failed send never blocks
the admin action, and only real transitions fire — toggling an already-inactive or
already-active account sends nothing.

Verified: deactivate → email in Mailpit and login refused with `ACCOUNT_DEACTIVATED`;
reactivate → Welcome-Back exactly as before; a repeat activate (no transition) sent
nothing.

---

## Round 56 — A year of silence closes the account, politely  (2026-10-09)

A new daily sweep (worker, 09:15 IST) **auto-deactivates volunteers with no activity for
over a year** and emails them about it.

- **"Activity" is deliberately broader than the letter of the rule** (no enrollment in a
  year): the anchor is the LATEST of their last enrollment, their last attendance record
  (walk-ins never enroll — deactivating someone who walked into a session last month
  would be absurd), and the account's own creation — so a volunteer who registered eleven
  months ago and never enrolled still has their full first year.
- **Scope**: approved, currently-active volunteer accounts only. Pending and rejected
  registrations have their own lifecycle; erased accounts are husks.
- **The mechanism is exactly the admin's manual toggle** (`users.is_active = false`):
  sign-in blocked, sessions die on rotation, the record keeps — and an admin reactivating
  later fires the existing Welcome-Back email, closing the loop.
- **The email** (`account_inactivity_deactivated`) is warm, not bureaucratic: "it has
  been over a year since you last joined a session", the record is kept, and the way back
  is one mail to admin@parinaam.org.
- Each deactivation is **audited** (`volunteer.auto_deactivated`, system actor, with the
  computed last-activity date), each volunteer is processed independently (one bad row
  never strands the batch), and the sweep is naturally idempotent — deactivated rows no
  longer match. Batch-limited to 100 per run.
- One SQL lesson encoded: every bare parameter inside `jsonb_build_object` needs an
  explicit cast — Postgres cannot infer its type there.

Verified with a synthetic subject (created, backdated 400 days, no enrollments): the
forced sweep deactivated exactly that account, wrote the audit row, and delivered exactly
one "We miss you" email; a second sweep did nothing; all ten real volunteers stayed
active. The subject and its artifacts were removed afterwards.

---

## Round 57 — Email validation everywhere, and cancellations that always notify  (2026-10-10)

**Item 2 — one email rule across the application.** The API already validated every email
field (`@IsEmail` on register, login, check-email, admin-create, invite, reset, sponsor
pack, coordinators) — the gaps were client-side messages and one real server hole:

- `validation.ts` gains the shared `emailError` / `emailListError` helpers (mirroring the
  API's rule, like `phoneError`), and every form with an email field now uses them:
  **register** (replacing its private inline regex), **both logins** (bad format never
  leaves the browser), the **Add-volunteer dialog** (inline error + disabled submit), the
  **invite dialog** (the multi-address list names its first bad entry), the
  **reset-password dialog**, the **sponsor-pack email**, and **scheduled-report
  recipients** (per-entry message under the comma-separated field).
- The server hole: scheduled-report **recipients** were checked only as "a string ≤ 2000
  chars" — a typo'd address sailed through and failed silently at send time. Create and
  update now validate every entry and refuse with `INVALID_EMAIL` naming the bad ones.

**Item 3 — program/activity/session cancellation always emails the enrolled.** The
per-session cancel has notified since BR-07; the catalog **delete cascade deliberately
did not** ("a catalog delete is bookkeeping", Round 36). That stance is reversed by
product decision: deleting a program or activity now immediately emails **every enrolled
and waitlisted volunteer** of each session the cascade cancels — same `event_cancelled`
template, with the admin's reason — and the audit row and API response carry the
`notified` count. A notification failure never un-deletes the catalog. (Discontinue
still cancels nothing and so notifies nobody.)

Verified: a scratch program → activity → published future session with two enrollments;
deleting the program returned `{sessionsCancelled: 1, notified: 2}` and both volunteers
received "Cancelled: … on 20 November 2026" with the reason in the body; scheduled-report
creation with a bad entry returned `INVALID_EMAIL: not-an-email` while a clean list
created (and was removed); a browser run submitted the login form with a malformed email
and got the inline message with no request leaving the page. Scratch data removed.

---

## Round 58 — The consolidated report  (2026-10-10)

Reports gains a **Consolidated** export: one row per participant per session, with the
whole hierarchy on every line — built so a single spreadsheet answers "who was attached
to what, what state is each level in, and what did it amount to".

- **Columns (17)**: program + status, activity + status, the activity's **default
  hours**, session code / name / date / status / location, volunteer name / code /
  email, **participation** (Enrolled or **Walk-in** — attendance without an enrollment),
  enrolled-on date, attended (Present/Absent), and **hours — shown only once the session
  is completed** (the product rule as specified: an in-progress session's logged hours
  stay blank until it closes).
- Rows cover enrolled volunteers plus walk-ins; erased volunteers stay out per the
  standing reports rule; ordering is program → date → session → volunteer.
- It plugs into the whole report machinery via the single registry
  (`report-query.service`): the one-click **Excel export on the Reports page** (first in
  the list-exports row), `POST /reports/export` in **all three formats**, run history,
  and the **scheduled-reports** dropdown ("Consolidated (sessions × participants)") for
  automated delivery by email.

Verified: the CSV contains the exact expected rows from the demo baseline — Ananya and
Rahul Present with 4.00 h on the completed Exposure Visit while Sanjay shows Absent with
blank hours; Kavya appears twice, once as **Walk-in** with 2.00 h on the completed story
workshop and once as Enrolled on an upcoming session with attended/hours blank; the
in-progress mentor session's hours stay blank. Excel (PK) and PDF (%PDF) render the same
17 columns.

**4a (same round, product owner's column list):** the report grew to **27 columns** —
program start/end dates and activity start/end dates (the V025 planning windows, blank
when unset), the date column renamed **Session date**, **session start and end time**
(end derived as start + duration), **Volunteers enrolled** (the session's live enrolled
count), **Beneficiary community**, **Volunteer status** (registration status, shown as
`inactive` when the account is deactivated) and **Volunteer type** (Individual/CSR), and
Hours renamed **Attendance hours**. Re-verified in CSV (all columns populated as
expected, 10:00→14:00 derived end on a 4-hour session) and generated in Excel + PDF.

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
endpoint and stands at **69 endpoints × 3 roles = 207 checks** at the time of writing.
