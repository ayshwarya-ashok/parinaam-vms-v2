-- =============================================================================
-- V027 — Custom certificates (Round 48).
--
-- Staff (admin and field coordinator) can issue a certificate of appreciation
-- whose body paragraph is written by them instead of computed from program
-- participation. Same official artwork, same numbering sequence, same storage
-- and email pipeline; only the appreciation text differs.
--
-- Shape: kind = 'program' is the existing BR-18 certificate (one per volunteer
-- per program, figures computed). kind = 'custom' carries the staff-written
-- text, has no program, and a volunteer may hold any number of them —
-- the UNIQUE (volunteer_id, program_id) does not bind rows whose program_id
-- is NULL.
-- =============================================================================

ALTER TABLE certificates ALTER COLUMN program_id DROP NOT NULL;

ALTER TABLE certificates ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'program';
ALTER TABLE certificates ADD COLUMN custom_text VARCHAR(600);

ALTER TABLE certificates ADD CONSTRAINT certificates_kind_chk
  CHECK (kind IN ('program', 'custom'));

-- A program certificate must name its program and carries no custom text;
-- a custom certificate is the reverse.
ALTER TABLE certificates ADD CONSTRAINT certificates_custom_chk
  CHECK (
    (kind = 'program' AND program_id IS NOT NULL AND custom_text IS NULL)
    OR
    (kind = 'custom' AND program_id IS NULL AND custom_text IS NOT NULL)
  );

COMMENT ON COLUMN certificates.kind IS
  'program = computed from participation (BR-18); custom = staff-written appreciation text (Round 48)';
COMMENT ON COLUMN certificates.custom_text IS
  'The staff-written body paragraph of a custom certificate — rendered in place of the template''s fixed appreciation text';
