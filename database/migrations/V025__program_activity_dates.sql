-- =============================================================================
-- V025 — optional "runs from / to" dates on programs and activities (client
-- refinement, 2026-10-04).
--
-- The question asked was "check whether it is needed": sessions remain the
-- source of truth for when work actually happens, but programs and activities
-- are frequently SEASONAL (a winter drive, a collection window), and a planned
-- window is useful for planning and reporting. So the dates exist, are
-- OPTIONAL, and are purely informational — they do not gate enrollment
-- (BR-17 stays driven by status and each session's own date).
-- =============================================================================

ALTER TABLE programs
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD CONSTRAINT programs_dates_chk CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  );

ALTER TABLE activities
  ADD COLUMN start_date DATE,
  ADD COLUMN end_date DATE,
  ADD CONSTRAINT activities_dates_chk CHECK (
    start_date IS NULL OR end_date IS NULL OR end_date >= start_date
  );
