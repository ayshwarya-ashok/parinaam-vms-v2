# Client-Document Impact Analysis

| | |
|---|---|
| **Subject** | *Parinaam_Volunteering_Activity_Attributes.docx* (JPMC requirements reference: Exposure Visits, Read to Rise, Chote Kadam, Activity-Based Outings) checked against the VMS implementation |
| **First analysis** | 2026-08-22 (gaps G1–G12) |
| **Status update** | 2026-08-24, after the phased-sessions build (V013–V015, `docs/08`) |
| **Shareable version** | Published as a Claude artifact ("Four Programs, One VMS") — same content |

**Verdict as of 24 Aug 2026:** the two **structural** gaps are closed — beneficiary
communities (G4) and the Chote Kadam phase model (G1) are live, with visit-level attendance,
a separate *in progress* metric, named partner leads, audited overrides with session
reversion, and admin mid-session adds. What remains is the **communication layer** (pre-session
emails, WhatsApp, Welcome-Back) plus two client scope decisions (student data, WhatsApp). All
four programmes ship as seeded demo data (S005, sessions `EVT-2026-0201…0205`).

---

## 1. Fit at a glance

| Programme | Maps to | 22 Aug | 24 Aug | Still missing |
|---|---|---|---|---|
| **Exposure Visit** (AAP) | Single-day Event; host-org employees as CSR volunteers · demo `EVT-2026-0201` | FITS | **FITS** | Bulk corporate onboarding; memento note (trivial) |
| **Read to Rise** (AAP / Goodhearts) | Quarterly series per **beneficiary community** · demo `EVT-2026-0202/0203` | PARTIAL | **PARTIAL+** | Communities ✓; still open: T-7/T-1 emails, WhatsApp, Welcome-Back re-allotment, feedback photo upload |
| **Chote Kadam** (Ujjivan) | A **phased session**: the 7-phase mentor journey, named CSR lead, visit-level hours · demo `EVT-2026-0204` | GAP | **FITS** | — (recognition-email automation is the generic G5 item) |
| **Activity-Based Outing** (Snow City) | Single-day Event; corporate buddies; FC = coordinator · demo `EVT-2026-0205` | PARTIAL | **PARTIAL** | Volunteer side complete; the student side stays a scope decision (G2) |

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
| G2 | Beneficiary / student management | ⏳ **Open — client decision** | Child PII (parent consent, headcounts, buddy pairing) deliberately outside the system until the client decides |
| G3 | WhatsApp channel | ⏳ **Open — client decision** | Business API = Meta verification, template approval, per-message cost, opt-in tracking |
| G4 | Community master + session links | ✅ **Delivered** | V013. Returning-volunteer *re-allotment* rides on G12 |
| G5 | Pre-session emails (T-7 details + T-1 reminder) | 🔜 **Open — next best increment** | Templates + one sweep on existing rails; nothing blocks it |
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
- **Still pending:** G2 — does the VMS hold student data (child PII, retention obligations),
  or stay volunteer-only? G3 — WhatsApp in scope, or do email reminders satisfy the
  touchpoint table?

## 5. What's next

1. **Ready now:** G5 pre-session sweeps, G12 Welcome-Back + re-allotment, G9 memento field,
   G7 feedback photos.
2. **Then:** G6's open half (bulk invites), G10/G11 exports, G8 if still wanted.
3. **Awaiting the client:** G2, G3.

---

Sources: the client document checked against migrations V001–V015, the email template
inventory, and the worker's cron sweeps. Build design record: `08-phased-sessions-and-communities.md`;
changelog: `07-post-mvp-refinements.md` Round 10.
