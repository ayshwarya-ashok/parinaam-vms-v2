# Post-MVP Refinements

| | |
|---|---|
| **Scope** | Everything changed after the eight implementation phases (the MVP) were delivered |
| **Period** | 2026-08-20 → 2026-09-01 (ongoing) |
| **Driver** | Hands-on testing by the product owner across fifteen review rounds, one full-codebase audit, and the client's phased-sessions refinement (`08`/`09`) |
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
