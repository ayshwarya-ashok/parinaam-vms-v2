-- =============================================================================
-- V009  Derived views and business-rule functions
--
-- Everything the prototype computed in the browser has exactly one
-- authoritative definition here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_event_capacity — live seat count for one occurrence. BR-06.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_event_capacity AS
SELECT
  e.id                                     AS event_id,
  e.activity_id,
  a.program_id,
  e.max_slots,
  COALESCE(en.enrolled_count, 0)           AS enrolled_count,
  COALESCE(w.waitlist_count, 0)            AS waitlist_count,
  GREATEST(e.max_slots - COALESCE(en.enrolled_count, 0), 0) AS spots_left,
  (COALESCE(en.enrolled_count, 0) >= e.max_slots)           AS is_full,
  fn_is_event_enrollable(e.id)             AS is_enrollable
FROM events e
JOIN activities a ON a.id = e.activity_id
LEFT JOIN (
  SELECT event_id, COUNT(*)::int AS enrolled_count
  FROM event_enrollments
  WHERE status = 'enrolled'
  GROUP BY event_id
) en ON en.event_id = e.id
LEFT JOIN (
  SELECT event_id, COUNT(*)::int AS waitlist_count
  FROM waitlist_entries
  GROUP BY event_id
) w ON w.event_id = e.id;

-- -----------------------------------------------------------------------------
-- v_valid_training_passes — the one definition of "currently holds this training".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_valid_training_passes AS
SELECT DISTINCT ON (ta.volunteer_id, ta.training_id)
  ta.volunteer_id,
  ta.training_id,
  ta.id AS attempt_id,
  ta.score_percent,
  ta.attempted_at,
  ta.expiry_date
FROM training_attempts ta
WHERE ta.passed = TRUE
  AND ta.is_superseded = FALSE
  AND (ta.expiry_date IS NULL OR ta.expiry_date > CURRENT_DATE)
ORDER BY ta.volunteer_id, ta.training_id, ta.attempted_at DESC;

-- -----------------------------------------------------------------------------
-- v_volunteer_compliance — consent + all mandatory trainings current.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_volunteer_compliance AS
WITH mandatory AS (
  SELECT id FROM trainings WHERE is_mandatory = TRUE AND status = 'active'
),
mandatory_count AS (
  SELECT COUNT(*)::int AS total FROM mandatory
)
SELECT
  v.id AS volunteer_id,
  COALESCE(c.pocso_agreed AND c.posh_agreed AND c.nda_agreed, FALSE) AS consent_complete,
  (SELECT total FROM mandatory_count)                                AS mandatory_total,
  COALESCE(p.passed_count, 0)                                        AS mandatory_passed,
  (COALESCE(p.passed_count, 0) >= (SELECT total FROM mandatory_count))
    AND COALESCE(c.pocso_agreed AND c.posh_agreed AND c.nda_agreed, FALSE) AS is_compliant,
  p.earliest_expiry
FROM volunteers v
LEFT JOIN volunteer_consents c ON c.volunteer_id = v.id
LEFT JOIN (
  SELECT vtp.volunteer_id, COUNT(*)::int AS passed_count, MIN(vtp.expiry_date) AS earliest_expiry
  FROM v_valid_training_passes vtp
  JOIN mandatory m ON m.id = vtp.training_id
  GROUP BY vtp.volunteer_id
) p ON p.volunteer_id = v.id;

-- -----------------------------------------------------------------------------
-- v_event_required_trainings — the union gate: program trainings + activity
-- trainings, resolved down to the occurrence a volunteer actually enrolls in.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_event_required_trainings AS
SELECT DISTINCT e.id AS event_id, t.training_id, t.source
FROM events e
JOIN activities a ON a.id = e.activity_id
JOIN LATERAL (
  SELECT at.training_id, 'activity'::text AS source
    FROM activity_trainings at WHERE at.activity_id = a.id
  UNION
  SELECT pt.training_id, 'program'::text AS source
    FROM program_trainings pt WHERE pt.program_id = a.program_id
) t ON TRUE;

COMMENT ON VIEW v_event_required_trainings IS
  'BR-05 gate set. A training linked at both levels appears once per source; '
  'callers should treat training_id as the key.';

-- -----------------------------------------------------------------------------
-- fn_event_prereqs_met — BR-05, checked before every enrollment.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_event_prereqs_met(p_volunteer_id UUID, p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE((SELECT is_compliant FROM v_volunteer_compliance
               WHERE volunteer_id = p_volunteer_id), FALSE)
    AND NOT EXISTS (
      SELECT 1
      FROM v_event_required_trainings req
      WHERE req.event_id = p_event_id
        AND NOT EXISTS (
          SELECT 1 FROM v_valid_training_passes vtp
          WHERE vtp.volunteer_id = p_volunteer_id
            AND vtp.training_id  = req.training_id
        )
    );
$$;

COMMENT ON FUNCTION fn_event_prereqs_met IS
  'BR-05. TRUE when the volunteer may be inserted into event_enrollments.';

-- -----------------------------------------------------------------------------
-- fn_volunteer_missing_trainings — what to show in the "Training Required" state.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_volunteer_missing_trainings(p_volunteer_id UUID, p_event_id UUID)
RETURNS TABLE (training_id UUID, code VARCHAR, name VARCHAR, is_mandatory BOOLEAN)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT t.id, t.code, t.name, t.is_mandatory
  FROM v_event_required_trainings req
  JOIN trainings t ON t.id = req.training_id
  WHERE req.event_id = p_event_id
    AND NOT EXISTS (
      SELECT 1 FROM v_valid_training_passes vtp
      WHERE vtp.volunteer_id = p_volunteer_id AND vtp.training_id = t.id
    )
  UNION
  SELECT t.id, t.code, t.name, t.is_mandatory
  FROM trainings t
  WHERE t.is_mandatory = TRUE AND t.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM v_valid_training_passes vtp
      WHERE vtp.volunteer_id = p_volunteer_id AND vtp.training_id = t.id
    );
$$;

-- -----------------------------------------------------------------------------
-- fn_volunteer_conflicts — BR-11 overlap against live enrollments.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_volunteer_conflicts(p_volunteer_id UUID, p_event_id UUID)
RETURNS TABLE (
  conflicting_event_id UUID,
  conflicting_name     VARCHAR,
  conflicting_date     DATE,
  conflicting_start    TIME
)
LANGUAGE sql
STABLE
AS $$
  SELECT other.id,
         COALESCE(other.name, oa.name),
         other.date,
         other.start_time
  FROM events target
  JOIN event_enrollments en
    ON en.volunteer_id = p_volunteer_id
   AND en.status = 'enrolled'
  JOIN events other     ON other.id = en.event_id AND other.id <> target.id
  JOIN activities oa    ON oa.id = other.activity_id
  WHERE target.id = p_event_id
    AND other.time_range && target.time_range;
$$;

-- -----------------------------------------------------------------------------
-- fn_promote_waitlist — BR-10. Fill freed seats from the head of the queue.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_promote_waitlist(p_event_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_open     INTEGER;
  v_promoted INTEGER := 0;
  v_entry    RECORD;
BEGIN
  -- Lock the event so two concurrent withdrawals cannot both promote.
  PERFORM 1 FROM events WHERE id = p_event_id FOR UPDATE;

  SELECT spots_left INTO v_open FROM v_event_capacity WHERE event_id = p_event_id;
  IF v_open IS NULL THEN
    RETURN 0;
  END IF;

  WHILE v_open > 0 LOOP
    SELECT * INTO v_entry
    FROM waitlist_entries
    WHERE event_id = p_event_id
    ORDER BY position
    LIMIT 1
    FOR UPDATE;

    EXIT WHEN NOT FOUND;

    INSERT INTO event_enrollments (volunteer_id, event_id, status, promoted_from_waitlist)
    VALUES (v_entry.volunteer_id, p_event_id, 'enrolled', TRUE)
    ON CONFLICT (volunteer_id, event_id) DO UPDATE
      SET status = 'enrolled',
          cancelled_at = NULL,
          promoted_from_waitlist = TRUE;

    DELETE FROM waitlist_entries WHERE id = v_entry.id;

    UPDATE waitlist_entries
       SET position = position - 1
     WHERE event_id = p_event_id
       AND position > v_entry.position;

    v_promoted := v_promoted + 1;
    v_open     := v_open - 1;
  END LOOP;

  RETURN v_promoted;
END;
$$;

COMMENT ON FUNCTION fn_promote_waitlist IS
  'Returns how many volunteers were promoted. The caller queues their emails.';

CREATE OR REPLACE FUNCTION trg_fn_enrollment_cancelled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'enrolled' THEN
    PERFORM fn_promote_waitlist(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollment_cancelled_promote
  AFTER UPDATE OF status ON event_enrollments
  FOR EACH ROW EXECUTE FUNCTION trg_fn_enrollment_cancelled();

-- -----------------------------------------------------------------------------
-- fn_recompute_volunteer_phase — BR-14.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recompute_volunteer_phase(p_volunteer_id UUID)
RETURNS volunteer_phase
LANGUAGE plpgsql
AS $$
DECLARE
  v_consent   BOOLEAN;
  v_compliant BOOLEAN;
  v_phase     volunteer_phase;
BEGIN
  SELECT consent_complete, is_compliant
    INTO v_consent, v_compliant
  FROM v_volunteer_compliance
  WHERE volunteer_id = p_volunteer_id;

  IF COALESCE(v_compliant, FALSE) THEN
    v_phase := 'Active';
  ELSIF COALESCE(v_consent, FALSE) THEN
    v_phase := 'In Training';
  ELSE
    v_phase := 'Onboarding';
  END IF;

  UPDATE volunteers
     SET phase = v_phase
   WHERE id = p_volunteer_id
     AND phase <> 'Inactive'
     AND phase IS DISTINCT FROM v_phase;

  RETURN v_phase;
END;
$$;

-- -----------------------------------------------------------------------------
-- v_event_attendance — attended vs enrolled per occurrence.
-- -----------------------------------------------------------------------------
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
         COUNT(*)::int                         AS submitted_count,
         COUNT(*) FILTER (WHERE attended)::int AS attended_count,
         COALESCE(SUM(hours_contributed), 0)   AS total_hours
  FROM attendance_records
  GROUP BY event_id
) r ON r.event_id = e.id
LEFT JOIN event_reports rep ON rep.event_id = e.id;

-- -----------------------------------------------------------------------------
-- v_program_participation — per volunteer per program. Drives certificates.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_program_participation AS
SELECT
  a.program_id,
  ar.volunteer_id,
  COUNT(*) FILTER (WHERE ar.attended)::int     AS events_attended,
  COALESCE(SUM(ar.hours_contributed), 0)       AS total_hours,
  MIN(e.date) FILTER (WHERE ar.attended)       AS first_attended_on,
  MAX(e.date) FILTER (WHERE ar.attended)       AS last_attended_on
FROM attendance_records ar
JOIN events e     ON e.id = ar.event_id
JOIN activities a ON a.id = e.activity_id
GROUP BY a.program_id, ar.volunteer_id;

COMMENT ON VIEW v_program_participation IS
  'Certificate source: hours summed across every occurrence attended in a program.';

-- -----------------------------------------------------------------------------
-- v_volunteer_report_summary — one row per volunteer, backs the Reports table.
-- -----------------------------------------------------------------------------
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
         COALESCE(SUM(hours_contributed), 0) AS total_hours,
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
) cert ON cert.volunteer_id = v.id;

-- -----------------------------------------------------------------------------
-- v_dashboard_kpis — the KPI tiles on the metrics dashboard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_dashboard_kpis AS
SELECT
  (SELECT COUNT(*)::int FROM volunteers)                                        AS total_volunteers,
  (SELECT COUNT(*)::int FROM volunteers WHERE phase = 'Active')                 AS active_volunteers,
  (SELECT COUNT(*)::int FROM programs WHERE status = 'active')                  AS active_programs,
  (SELECT COUNT(*)::int FROM activities WHERE status = 'active')                AS active_activities,
  (SELECT COUNT(*)::int FROM events WHERE status = 'completed')                 AS events_conducted,
  (SELECT COUNT(*)::int FROM events WHERE status = 'upcoming')                  AS events_upcoming,
  (SELECT COALESCE(SUM(hours_contributed), 0) FROM attendance_records
     WHERE attended)                                                            AS total_hours,
  (SELECT COALESCE(SUM(beneficiaries_reached), 0) FROM event_reports)           AS total_beneficiaries,
  (SELECT COALESCE(ROUND(AVG(attendance_pct), 0), 0) FROM v_event_attendance
     WHERE enrolled_count > 0)                                                  AS avg_attendance_pct,
  (SELECT COALESCE(ROUND(AVG(overall_rating), 1), 0) FROM feedback_submissions) AS avg_feedback_rating,
  (SELECT COALESCE(ROUND(AVG(nps_score), 1), 0) FROM feedback_submissions)      AS avg_nps,
  (SELECT COUNT(*)::int FROM certificates WHERE issued)                         AS certificates_issued,
  (SELECT COUNT(*)::int FROM v_valid_training_passes)                           AS trainings_completed;
