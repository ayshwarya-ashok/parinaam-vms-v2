-- =============================================================================
-- V018 — "As a student" registration (client refinement, 2026-09-08).
--
-- Students register as category 'Individual' — the category vocabulary stays
-- two-valued because everything downstream (corporate certificates, BR-01)
-- keys on Individual vs CSR — but a SUB-CATEGORY is tracked so the admin
-- directory can tell a student from any other individual, together with the
-- institution they picked from the predefined list (reference_values,
-- category INSTITUTION — labels are stored denormalized here so the
-- directory reads without a join and a later label edit does not rewrite
-- history).
--
-- Both columns are constrained to the shape the feature means:
--   • sub_category only exists on Individuals, and 'Student' is its only
--     value today (widen the CHECK when a second sub-category arrives).
--   • institution only exists on students.
-- =============================================================================

ALTER TABLE volunteers
  ADD COLUMN sub_category VARCHAR(30),
  ADD COLUMN institution  VARCHAR(255);

ALTER TABLE volunteers ADD CONSTRAINT volunteers_subcategory_chk CHECK (
  sub_category IS NULL OR (sub_category = 'Student' AND category = 'Individual')
);

ALTER TABLE volunteers ADD CONSTRAINT volunteers_institution_chk CHECK (
  institution IS NULL OR sub_category = 'Student'
);

COMMENT ON COLUMN volunteers.sub_category IS
  'Individual-only refinement of category. ''Student'' is the only value (2026-09-08); NULL for everyone else.';
COMMENT ON COLUMN volunteers.institution IS
  'The student''s institution — the label of a reference_values INSTITUTION row at registration time, stored denormalized.';
