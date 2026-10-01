-- =============================================================================
-- V022 — human-readable volunteer codes, and a terminal "deleted" status for
-- programs and activities (client refinements, 2026-10-01).
--
-- 1. volunteers.code — a stable, speakable identifier (VOL-0001, VOL-0002, …)
--    for field use: paper lists, phone calls, cross-checking a roster. The
--    internal UUID stays the real key; the code is display identity. Existing
--    volunteers are numbered in the order they registered; a sequence makes
--    new codes concurrency-safe and the column DEFAULT means every insert
--    path (self-registration, admin create, import, seeds) gets one for free.
--    Erased volunteers keep their code — it never identified the person.
--
-- 2. programs.status / activities.status gain 'deleted' — a TERMINAL soft
--    delete: unlike 'discontinued' there is no reactivation path (enforced in
--    the API), and the delete requires a reason, stored alongside who/when.
--    History under the program or activity (sessions, hours, certificates) is
--    kept — a hard row delete would cascade through events and corrupt every
--    report. BR-17 (fn_is_event_enrollable) already requires active status on
--    both levels, so enrollment under anything deleted is blocked with no
--    function change.
-- =============================================================================

-- ── 1. Volunteer code ─────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS volunteer_code_seq;

ALTER TABLE volunteers ADD COLUMN code VARCHAR(12) UNIQUE;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM volunteers
)
UPDATE volunteers v
SET code = 'VOL-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE o.id = v.id;

SELECT setval('volunteer_code_seq', GREATEST((SELECT COUNT(*) FROM volunteers), 1));

ALTER TABLE volunteers
  ALTER COLUMN code SET DEFAULT 'VOL-' || lpad(nextval('volunteer_code_seq')::text, 4, '0'),
  ALTER COLUMN code SET NOT NULL;

-- ── 2. Deleted status for the catalog ─────────────────────────────────────────

ALTER TYPE program_status ADD VALUE IF NOT EXISTS 'deleted';
ALTER TYPE activity_status ADD VALUE IF NOT EXISTS 'deleted';

ALTER TABLE programs
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN delete_reason TEXT;

ALTER TABLE activities
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN delete_reason TEXT;
