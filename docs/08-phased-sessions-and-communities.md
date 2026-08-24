# Phased Sessions & Beneficiary Communities

| | |
|---|---|
| **Scope** | The client refinement of 2026-08-24: multi-phase sessions, phase ownership and completion, beneficiary communities |
| **Source** | *Parinaam_Volunteering_Activity_Attributes.docx* (JPMC requirements reference, four flagship programmes) + the client's answers to five design questions |
| **Commits** | `e4ed32c` · `96ec3ab` · `3431516` · `87b8831` (code) · `6317966` (docs) |
| **Migrations** | V013 (communities) · V014 (phases + `inprogress`) · V015 (visit-level attendance) |
| **Changelog entry** | `07-post-mvp-refinements.md`, Round 10 |

This document is the design record for the largest post-MVP change: what the client asked
for, the decisions that shaped the schema, how each piece works, and how the four programmes
in the client's document now map onto the system.

---

## 1. The refinement, in the client's words

> 1 program can have n activities under it. Each activity can have n occurrences i.e.
> sessions. Each session can be a **single-phase or multi-phase** activity. Each phase is
> targeted to complete on a day, or within a duration having start and end date. Each phase
> is completed either by **only the Parinaam team**, or by a **partner/host in collaboration
> with Parinaam**. Whosoever is responsible marks the completion; the Admin can **override**
> the status (upcoming / inprogress / completed). If both teams are responsible, **both
> responses decide** the completion. **Completion of all phases marks the completion of the
> session.** One session is connected to a **Beneficiary Community** — admin-created, and
> mandatory (at least one). Admin can view a community's sessions by upcoming / inprogress /
> completed.

## 2. Decisions of record (the five questions)

| # | Question | Client's decision | Where it landed |
|---|---|---|---|
| Q1 | Who marks the partner side? | A **named lead** per phase, never "anyone enrolled" | `event_phases.partner_lead_volunteer_id`; `POST /phases/:id/partner-complete` guarded with `PHASE_NOT_YOURS` |
| Q2 | Attendance on multi-day phases? | **One record per visit** (volunteer + phase + day); certificates carry the summed hours across all phases | V015: partial unique indexes; views SUM hours, count DISTINCT sessions |
| Q3 | Enrollment window? | Closed at `inprogress`; admin may still **add any active volunteer to a phase** | `fn_is_event_enrollable` already requires `upcoming`; visits accept the walk-in gate (`walkIn` flag → active + approved check) |
| Q4 | Does inprogress count as conducted? | **No** — separate metric | KPIs, summary, program cards, community counts all carry `inprogress` separately; only `completed` is conducted |
| Q5 | Phase knocked back after auto-complete? | **Session reverts**, audited | `fn_recompute_event_phase_status` downgrades; `session.reverted` audit row |

## 3. How it works

### Beneficiary communities (V013)
Admin-managed master data (`/admin/communities`): name, city, description, active/archived.
**Archive, never delete** — session links are history. Every session that goes live must serve
≥1 community; the rule is enforced in the service (a cross-table CHECK cannot express it) at
three gates: create-as-upcoming, publish, and any edit that would empty the links
(`COMMUNITY_REQUIRED`; linking archived/unknown ids is `COMMUNITY_INVALID`). The community
detail page lists its sessions filtered by status. Pre-V013 sessions were backfilled to a
seeded default ("Bengaluru (General)") so history stays valid.

### Phases and the derived lifecycle (V014)
`event_phases`: a name, a **day or date range** (`end_date = start_date` for single-day),
ownership (`parinaam` | `partner` | `collab`), an optional named partner lead, two completion
marks (`parinaam_marked_*`, `partner_marked_*`), and audited override columns.

The session's status is **derived** — `fn_recompute_event_phase_status` is its only writer:

```
all phases completed  → completed   (automatic; the manual action refuses with PHASED_SESSION)
any phase past upcoming → inprogress  (enrollment closes here — Q3)
all phases upcoming    → upcoming
zero phases            → untouched   (classic single-day lifecycle, exactly as before)
```

Marking rules: a `parinaam` phase completes on the admin's mark; a `partner` phase on the
named lead's mark (`PHASE_NOT_YOURS` for everyone else — including the admin, whose tool is
the override); a `collab` phase needs **both** marks and shows `Parinaam ✓ · Partner …` until
then. The admin **override** requires a reason, wins over the marks, clears both marks when
overriding back to `upcoming`, and is written to `audit_logs`; if it knocks a completed
session back, a `session.reverted` row is written too (Q5).

### Visit-level attendance (V015)
`attendance_records` now has two shapes, enforced by partial unique indexes:

| Shape | Key | Meaning |
|---|---|---|
| Classic | `(event, volunteer)` where `phase_id IS NULL` | One row per session — unchanged |
| Visit | `(volunteer, phase, visit_date)` | One row per visit; always presence, hours required, date inside the phase window |

Q2's example works literally: 5 visits × 2h in a two-week phase = 5 rows = 10 hours on the
certificate. The V012 reporting views were rewritten so **session counts are DISTINCT while
hours stay plain SUMs** — the whole point is that hours accumulate across visits and phases.
Everything that joins attendance one-per-volunteer (the roster, the browse read model) was
scoped or aggregated so visit rows never fan rows out.

### The volunteer's side
Volunteers see the phase board on session detail (ownership, dates, lead, both-marks state);
the named lead gets **"Mark my side complete"** and a dashboard list of open phase
responsibilities (`GET /phases/mine`). This is the first place a volunteer writes session
state other than their own attendance — guarded accordingly and audited as
`phase.partner_marked`.

### New business error codes
`COMMUNITY_REQUIRED` · `COMMUNITY_INVALID` · `NAME_TAKEN` · `PHASED_SESSION` ·
`PHASE_NOT_YOURS` · `PHASE_ALREADY_MARKED` · `PHASE_LOCKED` · `VISIT_INVALID`
(catalogued in `packages/shared/src/index.ts`).

## 4. The four client programmes, live in the demo

Each scenario from the client document ships as seed data (**S005**), so every fresh install
has them; they were first created through the admin API so every business rule ran:

| Client programme | In the VMS | Demo data |
|---|---|---|
| **Exposure Visit** (AAP) | Single-day session; host-org employees volunteer as CSR guides | *Academic Adoption Program (AAP)* → *Exposure Visit* → **EVT-2026-0201** "TechCorp Workplace Exposure Visit" (10 Sept, upcoming, DJ Halli community) |
| **Read to Rise** (AAP / Goodhearts) | Quarterly sessions per community | *AAP* → *Read to Rise* → **EVT-2026-0202** Q2 (14 Aug, **completed**) and **EVT-2026-0203** Q3 (13 Nov, upcoming), both serving *DJ Halli Learning Community* |
| **Chote Kadam** (Ujjivan mentors) | One session carrying the **seven-phase mentor journey**, mixed ownership, CSR volunteer as named lead | *Chote Kadam* → *Community Infrastructure Mentorship* → **EVT-2026-0204** "Anganwadi Renovation — Hosur Road": phases 1–7 exactly as the document (Onboarding → … → Recognition), phase 1 complete, phase 2 **in progress** with a logged mentor visit (3h), session **inprogress**, serving *Hosur Road Settlement (Ujjivan)* |
| **Activity-Based Outing** (Snow City) | Single-day sponsored outing, corporate buddies | *Activity-Based Volunteering* → *Corporate Day Outing* → **EVT-2026-0205** "Snow City Outing — TechCorp" (26 Sept, upcoming) |

There is also the original walkthrough example **Lakefront Sapling Drive** (Green Bengaluru) —
a 3-phase session driven through the full lifecycle including overrides, a revert, visits, and
the partner lead's final mark auto-completing it.

## 5. Alignment with the client document — and what remains

> The full gap register with per-item status lives in `09-client-doc-impact-analysis.md`.

The refinement closes the two **structural** gaps from the original impact analysis: the
Chote Kadam phase model (G1) and beneficiary communities (G4). The remaining gaps are
**workflow/communication** items, unchanged in scope and still tracked:

| Still open | From the document | Size |
|---|---|---|
| Pre-session emails (T-7 programme details with lesson plan, T-7/T-1 reminders) | Read to Rise touchpoint table | Small — new templates + one sweep on existing rails |
| WhatsApp reminders and coordination groups | Read to Rise, Snow City | Needs a client decision (WhatsApp Business API: verification, template approval, cost) |
| Beneficiary/student records (parent consent, headcounts, emergency contacts, buddy pairing) | Snow City phases 1–2, Exposure Visit student lists | Needs a client decision — child PII with safeguarding obligations |
| Welcome-Back email + community re-allotment for returning volunteers | Read to Rise phase 2 | Small; community affinity now has a home (communities exist) |
| Bulk corporate onboarding (invite a company's employees as a batch) | Exposure Visit, Snow City | Medium |
| Volunteer photo upload with feedback | Read to Rise phase 6 | Small–medium |
| Sponsor pack (photos + thank-you) and Goodhearts annual calendar exports | Snow City, Exposure Visit | Small |
| Tangible-gift note on recognition | Exposure Visit | Trivial |

## 6. Verification

Every increment was verified against the running system before its commit: guard codes
provoked (`COMMUNITY_REQUIRED`, `COMMUNITY_INVALID`, `NAME_TAKEN`, `PHASED_SESSION`,
`PHASE_NOT_YOURS`, `PHASE_ALREADY_MARKED`, `VISIT_INVALID`, `HOURS_REQUIRED`, `NOT_ENROLLED`),
the auto-complete and revert cascades exercised with their audit rows inspected, view
arithmetic checked against hand-computed totals, the browse read model checked for fan-out,
and a classic-session regression run (roster, summary, attendance semantics unchanged).
The authorization matrix stands at **69 endpoints × 3 roles = 207 checks**, all passing.
