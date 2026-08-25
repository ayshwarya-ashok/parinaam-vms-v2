-- =============================================================================
-- V016 — Item-4 close-out (client direction, 2026-08-25).
--
-- Three small schema touches behind the remaining backlog features:
--   • certificates.memento_note — the Exposure Visit "tangible gift" record
--     (memento, sapling, …) noted at issue time and mentioned in the email.
--   • photo_source gains 'volunteer_feedback' — volunteers may attach session
--     photos to their feedback (client doc, Read to Rise phase 6).
--   • event_photos.feedback_id — links such a photo to the feedback submission
--     that carried it.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block; psql -f
-- runs each statement in its own transaction, so this file is safe under the
-- standard runner. Never wrap it in BEGIN/COMMIT.
-- =============================================================================

ALTER TYPE photo_source ADD VALUE IF NOT EXISTS 'volunteer_feedback';

ALTER TABLE certificates ADD COLUMN memento_note VARCHAR(255);
COMMENT ON COLUMN certificates.memento_note IS
  'Optional tangible-gift note recorded at issue time (e.g. "sapling", "memento box"). Process stays offline; this is the record of it.';

ALTER TABLE event_photos ADD COLUMN feedback_id UUID
  REFERENCES feedback_submissions(id) ON DELETE SET NULL;
CREATE INDEX idx_event_photos_feedback ON event_photos (feedback_id)
  WHERE feedback_id IS NOT NULL;
