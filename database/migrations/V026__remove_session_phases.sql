-- =============================================================================
-- V026 — REMOVE the session-phases concept entirely (client decision,
-- 2026-10-04). Reverses V014 (event_phases + phase-derived session status) and
-- V015's visit-level attendance shape.
--
-- The model returns to the original single lifecycle: volunteers enroll
-- directly in a session, attendance is ONE record per volunteer per session,
-- and completion is the explicit "Mark completed" action. There is no phase,
-- no phase responsibility, and no partner lead.
--
-- Hours are NOT lost: every visit row logged under a phase is folded into a
-- single attendance record per (session, volunteer) whose hours are the SUM of
-- its visits — exactly what certificates and reports were already reading.
-- The volunteer-lifecycle phase (Onboarding / In Training / …) is a different
-- concept and is untouched. The event_status value 'inprogress' remains a
-- valid enum member; sessions holding it complete via "Mark completed".
-- =============================================================================

-- 1. Fold visit hours into an existing one-row-per-session record, if any.
UPDATE attendance_records ar
SET hours_contributed = COALESCE(ar.hours_contributed, 0) + v.hrs
FROM (
  SELECT event_id, volunteer_id, SUM(hours_contributed) AS hrs
  FROM attendance_records WHERE phase_id IS NOT NULL
  GROUP BY event_id, volunteer_id
) v
WHERE ar.event_id = v.event_id AND ar.volunteer_id = v.volunteer_id
  AND ar.phase_id IS NULL;

DELETE FROM attendance_records ar
WHERE ar.phase_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM attendance_records s
    WHERE s.event_id = ar.event_id AND s.volunteer_id = ar.volunteer_id
      AND s.phase_id IS NULL
  );

-- 2. Where only visit rows exist, keep the earliest as the summary row with
--    the summed hours, delete the rest.
WITH g AS (
  SELECT event_id, volunteer_id, SUM(hours_contributed) AS hrs,
         (ARRAY_AGG(id ORDER BY recorded_at, id))[1] AS keep_id
  FROM attendance_records WHERE phase_id IS NOT NULL
  GROUP BY event_id, volunteer_id
)
UPDATE attendance_records ar SET hours_contributed = g.hrs
FROM g WHERE ar.id = g.keep_id;

DELETE FROM attendance_records ar
USING (
  SELECT event_id, volunteer_id,
         (ARRAY_AGG(id ORDER BY recorded_at, id))[1] AS keep_id
  FROM attendance_records WHERE phase_id IS NOT NULL
  GROUP BY event_id, volunteer_id
) g
WHERE ar.event_id = g.event_id AND ar.volunteer_id = g.volunteer_id
  AND ar.phase_id IS NOT NULL AND ar.id <> g.keep_id;

-- 3. Restore the one-record-per-session shape.
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_visit_chk;
DROP INDEX IF EXISTS attendance_records_session_uq;
DROP INDEX IF EXISTS attendance_records_visit_uq;
DROP INDEX IF EXISTS idx_attendance_records_phase;
ALTER TABLE attendance_records
  DROP COLUMN IF EXISTS phase_id,
  DROP COLUMN IF EXISTS visit_date;
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_uq UNIQUE (event_id, volunteer_id);

-- 4. Remove the phase machinery itself.
DROP FUNCTION IF EXISTS fn_recompute_event_phase_status(UUID);
DROP TABLE IF EXISTS event_phases;
DROP TYPE IF EXISTS phase_status;
DROP TYPE IF EXISTS phase_responsibility;
