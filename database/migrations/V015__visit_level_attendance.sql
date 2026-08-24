-- =============================================================================
-- V015 — Visit-level attendance for phased sessions (client decision Q2,
-- 2026-08-24).
--
-- "A volunteer makes 5 visits with 2 hrs every visit during a 2-week phase —
--  there should be 5 attendance records for that phase of the session."
--
-- Classic sessions keep exactly one record per (event, volunteer) — those
-- rows have phase_id NULL and nothing about them changes. Phased visits are
-- additional rows keyed (volunteer, phase, visit_date); a visit is by
-- definition presence, so those rows are attended-only. Certificates and
-- reports SUM hours across every row, so a volunteer's total naturally spans
-- all phases of a session (Q2's certificate rule).
-- =============================================================================

ALTER TABLE attendance_records
  ADD COLUMN phase_id   UUID REFERENCES event_phases(id) ON DELETE SET NULL,
  ADD COLUMN visit_date DATE;

-- A visit row must say when, and a visit is presence by definition.
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_visit_chk CHECK (
    phase_id IS NULL OR (visit_date IS NOT NULL AND attended = TRUE)
  );

-- One-per-session becomes two shapes: classic rows keep their uniqueness,
-- visit rows are unique per (volunteer, phase, day).
ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_uq;
CREATE UNIQUE INDEX attendance_records_session_uq
  ON attendance_records (event_id, volunteer_id) WHERE phase_id IS NULL;
CREATE UNIQUE INDEX attendance_records_visit_uq
  ON attendance_records (volunteer_id, phase_id, visit_date) WHERE phase_id IS NOT NULL;
CREATE INDEX idx_attendance_records_phase ON attendance_records (phase_id)
  WHERE phase_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Views: with multiple rows per volunteer per event, every "how many
-- volunteers / sessions" count must be DISTINCT; every hours figure stays a
-- plain SUM (that is the point — hours accumulate across visits and phases).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_program_participation AS
SELECT
  a.program_id,
  ar.volunteer_id,
  COUNT(DISTINCT ar.event_id) FILTER (WHERE ar.attended)::int           AS events_attended,
  COALESCE(SUM(ar.hours_contributed) FILTER (WHERE ar.attended), 0)     AS total_hours,
  MIN(e.date) FILTER (WHERE ar.attended)                                AS first_attended_on,
  MAX(e.date) FILTER (WHERE ar.attended)                                AS last_attended_on
FROM attendance_records ar
JOIN events e ON e.id = ar.event_id
JOIN activities a ON a.id = e.activity_id
GROUP BY a.program_id, ar.volunteer_id;

COMMENT ON VIEW v_program_participation IS
  'Per volunteer per program. Drives certificates (BR-18). Hours sum every attended record — visit rows included — so phased-session totals span all phases; session counts are DISTINCT events.';

CREATE OR REPLACE VIEW v_event_attendance AS
SELECT
  e.id                              AS event_id,
  e.activity_id,
  a.program_id,
  COALESCE(en.enrolled_count, 0)    AS enrolled_count,
  COALESCE(r.submitted_count, 0)    AS submitted_count,
  COALESCE(r.attended_count, 0)     AS attended_count,
  COALESCE(r.total_hours, 0)        AS total_hours,
  COALESCE(rep.beneficiaries_reached, 0) AS beneficiaries_reached,
  CASE WHEN COALESCE(en.enrolled_count, 0) = 0 THEN 0
       ELSE ROUND(100.0 * COALESCE(r.attended_count, 0) / en.enrolled_count, 1)
  END                               AS attendance_pct
FROM events e
JOIN activities a ON a.id = e.activity_id
LEFT JOIN (
  SELECT event_id, COUNT(*)::int AS enrolled_count
  FROM event_enrollments WHERE status = 'enrolled'
  GROUP BY event_id
) en ON en.event_id = e.id
LEFT JOIN (
  SELECT event_id,
         COUNT(DISTINCT volunteer_id)::int                        AS submitted_count,
         COUNT(DISTINCT volunteer_id) FILTER (WHERE attended)::int AS attended_count,
         COALESCE(SUM(hours_contributed) FILTER (WHERE attended), 0) AS total_hours
  FROM attendance_records
  GROUP BY event_id
) r ON r.event_id = e.id
LEFT JOIN event_reports rep ON rep.event_id = e.id;

CREATE OR REPLACE VIEW v_volunteer_report_summary AS
SELECT
  v.id                                  AS volunteer_id,
  v.first_name || ' ' || v.last_name    AS volunteer_name,
  u.email,
  v.city                                AS location,
  v.category,
  v.phase,
  COALESCE(pp.program_count, 0)         AS programs_joined,
  COALESCE(en.event_count, 0)           AS events_enrolled,
  COALESCE(att.total_hours, 0)          AS total_hours,
  COALESCE(att.attendance_pct, 0)       AS attendance_pct,
  COALESCE(tr.trainings_passed, 0)      AS trainings_passed,
  fb.avg_rating,
  COALESCE(cert.certificates_issued, 0) AS certificates_issued
FROM volunteers v
JOIN users u ON u.id = v.user_id
LEFT JOIN (
  SELECT volunteer_id, COUNT(DISTINCT program_id)::int AS program_count
  FROM v_program_participation GROUP BY volunteer_id
) pp ON pp.volunteer_id = v.id
LEFT JOIN (
  SELECT volunteer_id, COUNT(*)::int AS event_count
  FROM event_enrollments WHERE status = 'enrolled' GROUP BY volunteer_id
) en ON en.volunteer_id = v.id
LEFT JOIN (
  SELECT volunteer_id,
         COALESCE(SUM(hours_contributed) FILTER (WHERE attended), 0) AS total_hours,
         ROUND(100.0 * COUNT(DISTINCT event_id) FILTER (WHERE attended)
               / NULLIF(COUNT(DISTINCT event_id), 0), 0)             AS attendance_pct
  FROM attendance_records GROUP BY volunteer_id
) att ON att.volunteer_id = v.id
LEFT JOIN (
  SELECT volunteer_id, COUNT(*)::int AS trainings_passed
  FROM v_valid_training_passes GROUP BY volunteer_id
) tr ON tr.volunteer_id = v.id
LEFT JOIN (
  SELECT volunteer_id, ROUND(AVG(overall_rating), 1) AS avg_rating
  FROM feedback_submissions GROUP BY volunteer_id
) fb ON fb.volunteer_id = v.id
LEFT JOIN (
  SELECT volunteer_id, COUNT(*)::int AS certificates_issued
  FROM certificates WHERE issued = TRUE GROUP BY volunteer_id
) cert ON cert.volunteer_id = v.id
-- Erasure leaves an anonymised husk; a report row for it informs nobody.
WHERE u.email NOT LIKE '%@erased.invalid';
