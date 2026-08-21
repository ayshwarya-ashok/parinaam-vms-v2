-- =============================================================================
-- V012  Hours only count when the volunteer was actually there
--
-- Three views, one flaw: they counted ATTENDED sessions with a FILTER but
-- summed hours over every record, attended or not. An admin marking somebody
-- absent while a stale hours value rode along produced a certificate source
-- reading "2.75 hours across 0 sessions". Hours now carry the same
-- FILTER (WHERE attended) the session counts always had.
--
-- v_volunteer_report_summary additionally stops listing erased volunteers:
-- their rows are anonymised husks ("erased-…@erased.invalid") that mean
-- nothing in a report a funder reads.
-- =============================================================================

CREATE OR REPLACE VIEW v_program_participation AS
SELECT
  a.program_id,
  ar.volunteer_id,
  COUNT(*) FILTER (WHERE ar.attended)::int                              AS events_attended,
  COALESCE(SUM(ar.hours_contributed) FILTER (WHERE ar.attended), 0)     AS total_hours,
  MIN(e.date) FILTER (WHERE ar.attended)                                AS first_attended_on,
  MAX(e.date) FILTER (WHERE ar.attended)                                AS last_attended_on
FROM attendance_records ar
JOIN events e ON e.id = ar.event_id
JOIN activities a ON a.id = e.activity_id
GROUP BY a.program_id, ar.volunteer_id;

COMMENT ON VIEW v_program_participation IS
  'Per volunteer per program. Drives certificates (BR-18). Hours and dates count attended records only.';

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
         COUNT(*)::int                                            AS submitted_count,
         COUNT(*) FILTER (WHERE attended)::int                    AS attended_count,
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
         ROUND(100.0 * COUNT(*) FILTER (WHERE attended) / NULLIF(COUNT(*), 0), 0) AS attendance_pct
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
