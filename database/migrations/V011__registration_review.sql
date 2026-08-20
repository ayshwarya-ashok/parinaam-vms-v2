-- =============================================================================
-- V011  Volunteer registration review, richer sign-up profile
--
-- Three changes, one story — the volunteer's own registration:
--
--  1. Registration is now REVIEWED. A completed profile is a request, not an
--     admission: it lands as `pending`, and an administrator approves or
--     rejects it. Rejection carries a reason, because "no" without a reason is
--     unusable by whoever answers the volunteer's follow-up email.
--
--  2. The sign-up form asks what the public registration form asks —
--     occupation, languages, areas of interest and availability. Multi-select
--     answers are stored as comma-joined CODES (not labels) so relabelling a
--     catalog entry never rewrites history.
--
--  3. reference_values is the catalog those codes come from: admin-editable
--     vocabulary, the same shape as feedback_option_catalog.
--
-- Existing volunteers predate the review step, so they are backfilled as
-- approved — they were admitted under the old rules and must not be dragged
-- back into a queue.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS registration_status registration_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT,
  ADD COLUMN IF NOT EXISTS occupation          VARCHAR(150),
  ADD COLUMN IF NOT EXISTS languages           TEXT,
  ADD COLUMN IF NOT EXISTS areas_of_interest   TEXT,
  ADD COLUMN IF NOT EXISTS availability        TEXT,
  ADD COLUMN IF NOT EXISTS availability_notes  TEXT;

-- A decision must be attributable and, when negative, explicable.
ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_review_chk;
ALTER TABLE volunteers ADD CONSTRAINT volunteers_review_chk CHECK (
  (registration_status = 'pending'  AND reviewed_at IS NULL) OR
  (registration_status = 'approved' AND reviewed_at IS NOT NULL) OR
  (registration_status = 'rejected' AND reviewed_at IS NOT NULL
                                    AND rejection_reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_volunteers_registration_status
  ON volunteers (registration_status, created_at DESC);

COMMENT ON COLUMN volunteers.registration_status IS
  'pending until an admin approves or rejects. Rejection also deactivates the account.';
COMMENT ON COLUMN volunteers.languages IS
  'Comma-joined reference_values codes (category LANGUAGE). Codes, never labels.';
COMMENT ON COLUMN volunteers.areas_of_interest IS
  'Comma-joined reference_values codes (category AREA_OF_INTEREST).';
COMMENT ON COLUMN volunteers.availability IS
  'Comma-joined reference_values codes (category AVAILABILITY). The free-text
   nuance a fixed list cannot hold lives in availability_notes.';

-- Backfill: everyone who registered before review existed was already admitted.
UPDATE volunteers
   SET registration_status = 'approved',
       reviewed_at = created_at
 WHERE reviewed_at IS NULL
   AND registration_status = 'pending';

-- -----------------------------------------------------------------------------
-- reference_values — the multi-select vocabulary the sign-up form renders from.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_values (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    VARCHAR(40)  NOT NULL,
  code        VARCHAR(40)  NOT NULL,
  label       VARCHAR(120) NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT reference_values_uq UNIQUE (category, code)
);

CREATE INDEX IF NOT EXISTS idx_reference_values_category
  ON reference_values (category, sort_order) WHERE is_active;

COMMENT ON TABLE reference_values IS
  'Admin-editable option lists. Volunteers store the code; the label may change.';
