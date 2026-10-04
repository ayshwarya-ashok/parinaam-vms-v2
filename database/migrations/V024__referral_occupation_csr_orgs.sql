-- =============================================================================
-- V024 — registration form growth (client refinements, 2026-10-04):
--
-- 1. volunteers.referral_source — "How did you hear about Parinaam?", optional,
--    stored as the chosen label. Options live in the admin-editable
--    reference_values catalog (REFERRAL_SOURCE).
-- 2. OCCUPATION becomes a catalog too: the forms now offer a dropdown
--    (Other → free text, stored verbatim in the existing occupation column —
--    historical free-text occupations remain valid).
-- 3. The CSR organization list the client works with is pre-seeded:
--    Odessa, PwC, Deutsche Bank, IG Group, Finastra. "Other" in the form
--    creates/links by name like the admin flows already do.
-- =============================================================================

ALTER TABLE volunteers ADD COLUMN referral_source VARCHAR(80);

INSERT INTO reference_values (category, code, label, sort_order) VALUES
  ('REFERRAL_SOURCE', 'website',            'Website',             1),
  ('REFERRAL_SOURCE', 'social_media',       'Social Media',        2),
  ('REFERRAL_SOURCE', 'friends_family',     'Friends & Family',    3),
  ('REFERRAL_SOURCE', 'corporate',          'Corporate',           4),
  ('REFERRAL_SOURCE', 'existing_volunteer', 'Existing Volunteer',  5),
  ('REFERRAL_SOURCE', 'school_college',     'School or College',   6),
  ('REFERRAL_SOURCE', 'others',             'Others',              7),
  ('OCCUPATION',      'salaried',           'Salaried / Working Professional', 1),
  ('OCCUPATION',      'retired',            'Retired',             2),
  ('OCCUPATION',      'homemaker',          'Homemaker',           3),
  ('OCCUPATION',      'business_owner',     'Business Owner / Entrepreneur', 4),
  ('OCCUPATION',      'freelancer',         'Freelancer / Consultant', 5),
  ('OCCUPATION',      'other',              'Other',               6)
ON CONFLICT (category, code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

-- The client's CSR partner organizations (idempotent by name).
INSERT INTO organizations (name, is_active)
SELECT v.name, TRUE
FROM (VALUES ('Odessa'), ('PwC'), ('Deutsche Bank'), ('IG Group'), ('Finastra')) AS v(name)
WHERE NOT EXISTS (
  SELECT 1 FROM organizations o WHERE LOWER(o.name) = LOWER(v.name)
);
