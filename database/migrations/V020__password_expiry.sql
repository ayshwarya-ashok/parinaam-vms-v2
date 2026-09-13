-- =============================================================================
-- V020 — password lifecycle (client refinement, 2026-09-13).
--
-- Volunteer and field-coordinator passwords expire 120 days after they were
-- last set; admin passwords never expire. The AGE lives here; the POLICY
-- (who expires, forcing a change on the next login) lives in the API — the
-- expiry moment is computed, never stored, so changing the policy is a code
-- change, not a data migration.
--
--   • password_changed_at — when the credential was last set. Backfills to
--     now() so nobody is instantly expired by the migration itself; the clock
--     starts today.
--   • must_change_password — set when an admin resets a password on someone's
--     behalf; the owner is forced to choose their own on next login. Cleared
--     by the change-password endpoint.
-- =============================================================================

ALTER TABLE users
  ADD COLUMN password_changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN must_change_password BOOLEAN     NOT NULL DEFAULT false;

COMMENT ON COLUMN users.password_changed_at IS
  'When the password was last set. Volunteers/field coordinators expire 120 days later (policy in the API); admins never.';
COMMENT ON COLUMN users.must_change_password IS
  'True after an admin reset the password on this user''s behalf — the owner must set their own on next login.';
