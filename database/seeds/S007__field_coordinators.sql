-- =============================================================================
-- S007  Field coordinator demo accounts — demo/UAT only.
--
-- Two of the seeded coordinators (S002's coordinators table — the people the
-- occurrence-report emails go to) get LOGIN accounts with the V019
-- field_coordinator role, so the role is demoable out of the box:
--
--   priya@parinaam.org    Priya Menon   — default coordinator on most programmes
--   vikram@parinaam.org   Vikram Singh
--
-- Standard demo password: Parinaam@123. They sign in at /admin/login and get
-- the coordinator's cut of the admin shell (no Reports, no Trainings;
-- read-only Programs / Communities / Volunteers; full Field Execution,
-- Recognition and Metrics). No volunteer profile — the "no account without a
-- profile" rule binds volunteers only, same as admins. Idempotent.
-- =============================================================================

INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000022', 'priya@parinaam.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'field_coordinator', now()),
  ('00000000-0000-0000-0000-000000000023', 'vikram@parinaam.org', crypt('Parinaam@123', gen_salt('bf', 10)), 'field_coordinator', now())
ON CONFLICT (email) DO NOTHING;
