-- =============================================================================
-- V019 — the field coordinator role (client refinement, 2026-09-09).
--
-- A third user role for Parinaam's on-the-ground staff. Field coordinators
-- run sessions, not the catalog: they hold the ADMIN capability on field
-- execution, recognition and metrics; READ-ONLY views of programs,
-- communities and the volunteer directory; and no reports or trainings.
-- The grants live in the API's @Roles decorators (see
-- docs/07-post-mvp-refinements.md Round 21 for the exact matrix) — this
-- migration only teaches the enum the new value.
--
-- NOTE: ALTER TYPE ... ADD VALUE must not create rows using the new value in
-- the same transaction — the example users live in seed S007, which runs
-- separately.
-- =============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'field_coordinator';
