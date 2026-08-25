# Client-Document Impact Analysis

| | |
|---|---|
| **Subject** | *Parinaam_Volunteering_Activity_Attributes.docx* (JPMC requirements reference: Exposure Visits, Read to Rise, Chote Kadam, Activity-Based Outings) checked against the VMS implementation |
| **First analysis** | 2026-08-22 (gaps G1–G12) |
| **Status update** | 2026-08-24 after the phased-sessions build (V013–V015, `docs/08`); 2026-08-25 after the client dispositioned G2/G3/G5 (`docs/07` Round 11) |
| **Shareable version** | Published as a Claude artifact ("Four Programs, One VMS") — same content |

**Verdict as of 25 Aug 2026:** the two **structural** gaps are closed — beneficiary
communities (G4) and the Chote Kadam phase model (G1) are live, with visit-level attendance,
a separate *in progress* metric, named partner leads, audited overrides with session
reversion, and admin mid-session adds. Pre-session emails (T-7/T-1) are now automated with
admin re-trigger; WhatsApp is out of scope and student data stays community-level by the
client's own decisions — so nothing awaits the client, and only small backlog items remain. All
four programmes ship as seeded demo data (S005, sessions `EVT-2026-0201…0205`).

---

## 1. Fit at a glance

| Programme | Maps to | 22 Aug | 25 Aug | Still missing |
|---|---|---|---|---|
| **Exposure Visit** (AAP) | Single-day Event; host-org employees as CSR volunteers · demo `EVT-2026-0201` | FITS | **FITS** | Bulk corporate onboarding; memento note (trivial) |
| **Read to Rise** (AAP / Goodhearts) | Quarterly series per **beneficiary community** · demo `EVT-2026-0202/0203` | PARTIAL | **FITS-** | Communities ✓, T-7/T-1 emails ✓ (with admin re-send), WhatsApp out of scope; still open: Welcome-Back re-allotment, feedback photo upload |
| **Chote Kadam** (Ujjivan) | A **phased session**: the 7-phase mentor journey, named CSR lead, visit-level hours · demo `EVT-2026-0204` | GAP | **FITS** | — (G5 delivered; pre-session emails cover the touchpoints) |
| **Activity-Based Outing** (Snow City) | Single-day Event; corporate buddies; FC = coordinator · demo `EVT-2026-0205` | PARTIAL | **FITS** | Complete per the client decision: community-level impact only, no individual beneficiary data |

## 2. What maps cleanly now

| Document requirement | Implementation |
|---|---|
| Registration + sign-up form | Atomic register, pending → approved review |
| NDA / consent / safeguarding | `volunteer_consents` (NDA + POCSO + POSH), gates enrollment |
| Welcome email | Automated via the outbox |
| Quarterly sessions **per community** | Series + **beneficiary communities** (V013): ≥1 mandatory per published session, per-community lists by status |
| **7-phase project mentorship** | **Session phases** (V014): day/date-range phases, parinaam/partner/collab ownership, named lead, both-marks collab rule, derived completion, audited override + revert |
| **Mentor hours over months** | **Visit-level attendance** (V015): one record per volunteer per phase per day; certificate hours sum across phases |
| Orientation call | Online activity type + trainings module |
| FC-led attendance | Signed links, session record, walk-ins, corrections, mid-session phase adds |
| Cancellation email | `event_cancelled`, automated |
| Thank-you + feedback next day | `feedback_request` sweeper (10:00 IST) |
| Digital certificates | Per-programme, attended hours (phases included) |
| Reporting | Dashboard with separate *in progress* metric; funder/volunteer/programme reports |
| Corporate identity | CSR category + organisations; corporate certificates |

## 3. Gap register

| # | Gap | Status (24 Aug) | Notes |
|---|---|---|---|
| G1 | Chote Kadam project & mentor journey | ✅ **Delivered** | As session phases (V014), not a separate project entity. Demo: `EVT-2026-0204` carries the document's seven phases verbatim |
| G2 | Beneficiary / student management | ✅ **Resolved by decision (25 Aug)** | Client: track only the beneficiary community impacted; individual beneficiary details are never stored. The implementation already does exactly this — closed with no build |
| G3 | WhatsApp channel | ❌ **Out of scope (client, 25 Aug)** | Email remains the only channel; revisit only if the client reopens it |
| G4 | Community master + session links | ✅ **Delivered** | V013. Returning-volunteer *re-allotment* rides on G12 |
| G5 | Pre-session emails (T-7 details + T-1 reminder) | ✅ **Delivered (25 Aug)** | `session_details`/`session_reminder` templates + daily worker sweep via the outbox → n8n pipeline, idempotent through email_logs; admin re-send buttons on the session record |
| G6 | Corporate/bulk onboarding & mid-session adds | 🟡 **Half delivered** | Phase-level adds via the walk-in gate ✓; batch company invites open |
| G7 | Volunteer photo upload with feedback | Open | Storage + signed URLs exist; form lacks upload |
| G8 | Activity taxonomy | Open — partly mooted | The shapes are now expressible via phases/series |
| G9 | Tangible-gift recognition note | Open (trivial) | |
| G10 | Sponsor pack (photos + thank-you) | Open | |
| G11 | Goodhearts annual calendar export | Open | |
| G12 | Welcome-Back + community re-allotment | Open — now unblocked | Communities exist to re-allot into |

## 4. Decisions

- **Answered (24 Aug), all implemented:** named partner lead per phase (Q1); visit-level
  attendance with cross-phase certificate hours (Q2); enrollment closes at in-progress, admin
  phase-adds allowed (Q3); only completed counts as conducted (Q4); phase knock-back reverts
  the session, audited (Q5).
- **Dispositioned (25 Aug):** G2 — community-level impact only, no individual beneficiary
  PII (already how the system works). G3 — WhatsApp out of scope for now; email is the
  channel of record. G5 — built, with admin re-trigger from the UI.

## 5. What's next

No item now awaits a client decision. The remaining backlog, all unblocked:
G12 Welcome-Back + community re-allotment, G6's open half (bulk corporate invites),
G7 feedback photo upload, G10 sponsor pack, G11 calendar export, G9 memento note,
G8 taxonomy if still wanted.

---

Sources: the client document checked against migrations V001–V015, the email template
inventory, and the worker's cron sweeps. Build design record: `08-phased-sessions-and-communities.md`;
changelog: `07-post-mvp-refinements.md` Round 10.
