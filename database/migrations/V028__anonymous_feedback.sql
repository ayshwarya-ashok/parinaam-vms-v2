-- =============================================================================
-- V028 — Anonymous public feedback (Round 53).
--
-- A standing, shareable form (web route /share-feedback, linked from the
-- public impact page and shareable over email) lets ANYONE submit feedback
-- with no login and no identity captured. Rows land in feedback_submissions
-- so the staff Feedback screen reviews everything in one place.
--
-- Shape: is_anonymous = TRUE rows carry no volunteer and no event; the
-- optional about_label holds the submitter's own words on what the feedback
-- concerns. Signed-in (BR-09) rows are unchanged, and the existing
-- UNIQUE (volunteer_id, event_id) never binds anonymous rows (NULLs are
-- distinct), so the public form accepts any number of submissions.
-- =============================================================================

ALTER TABLE feedback_submissions ALTER COLUMN volunteer_id DROP NOT NULL;
ALTER TABLE feedback_submissions ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE feedback_submissions
  ADD COLUMN is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE feedback_submissions
  ADD COLUMN about_label VARCHAR(255);

-- A submission either names its volunteer and session (BR-09) or is fully
-- anonymous — never half of each.
ALTER TABLE feedback_submissions ADD CONSTRAINT feedback_anonymous_chk
  CHECK (
    (is_anonymous AND volunteer_id IS NULL AND event_id IS NULL)
    OR
    (NOT is_anonymous AND volunteer_id IS NOT NULL AND event_id IS NOT NULL)
  );

COMMENT ON COLUMN feedback_submissions.is_anonymous IS
  'TRUE = submitted through the public /share-feedback form — no volunteer, no event, no identity captured (Round 53)';
COMMENT ON COLUMN feedback_submissions.about_label IS
  'Anonymous submissions only: the submitter''s own words on which session/program/topic the feedback concerns';
