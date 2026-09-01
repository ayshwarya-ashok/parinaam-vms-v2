-- =============================================================================
-- S006  Individual volunteers who represent an organization — demo/UAT only.
--
-- V017 relaxed BR-01: an Individual volunteer MAY reference an organization as
-- an affiliation (a person volunteering on their own initiative while
-- representing their employer). Until this seed, the demo data had no such
-- volunteer, so the scenario the client asked for could not be shown.
--
-- Four affiliated Individuals across three organizations:
--   • Kavya Hegde      — Individual @ TechCorp India Pvt. Ltd. (the EXISTING
--                        CSR org: contrast her with csr@techcorp.in, who is
--                        category CSR at the same company)
--                        (named Divya Shetty in the first cut; renamed because
--                        the import template's sample rows already put a
--                        Divya Shetty in most demo databases)
--   • Manish Agarwal   — Individual @ Infosys BPM (new org)
--   • Shruti Kulkarni  — Individual @ Infosys BPM
--   • Farhan Sait      — Individual @ Wipro Cares (new org)
--
-- All log in with the standard demo password:  Parinaam@123
-- Approved (reviewed by the admin — the V011 attributability CHECK requires
-- reviewed_at on approved rows), compliance read, so they are visible in the
-- directory and enrollable straight away. Idempotent — safe to re-run.
-- =============================================================================

INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000018', 'kavya@techcorp.in',    crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000019', 'manish@infosysbpm.in', crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000020', 'shruti@infosysbpm.in', crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000021', 'farhan@wiprocares.in', crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now())
ON CONFLICT (email) DO NOTHING;

-- The app's resolve-or-create path (import / admin add) may have created these
-- organizations already, under generated ids — so this seed must NOT assume its
-- fixed ids and resolves every organization BY NAME below.
INSERT INTO organizations (id, name, email, phone, contact_person) VALUES
  ('00000000-0000-0000-0002-000000000002', 'Infosys BPM',  'connect@infosysbpm.in', '+91 80 4100 2000', 'Nandini Prasad'),
  ('00000000-0000-0000-0002-000000000003', 'Wipro Cares',  'hello@wiprocares.in',   '+91 80 4200 3000', 'Joseph Mathew')
ON CONFLICT (name) DO NOTHING;

INSERT INTO volunteers (id, user_id, first_name, last_name, gender, date_of_birth, city, state, phone,
                        category, organization_id, phase, skills, compliance_read,
                        registration_status, reviewed_by, reviewed_at)
SELECT r.id::uuid, r.user_id::uuid, r.first_name, r.last_name, r.gender::gender_type, r.dob::date,
       r.city, r.state, r.phone, 'Individual'::volunteer_category,
       (SELECT o.id FROM organizations o WHERE o.name = r.org_name),
       r.phase::volunteer_phase, r.skills, TRUE,
       'approved'::registration_status, '00000000-0000-0000-0000-000000000001'::uuid, now()
FROM (VALUES
  ('00000000-0000-0000-0001-000000000018','00000000-0000-0000-0000-000000000018','Kavya','Hegde','Female','1993-08-21','Bengaluru','Karnataka','9820011017','TechCorp India Pvt. Ltd.','Active','Teaching, Communication'),
  ('00000000-0000-0000-0001-000000000019','00000000-0000-0000-0000-000000000019','Manish','Agarwal','Male','1991-04-14','Bengaluru','Karnataka','9820011018','Infosys BPM','In Training','IT, Mentoring'),
  ('00000000-0000-0000-0001-000000000020','00000000-0000-0000-0000-000000000020','Shruti','Kulkarni','Female','1996-12-03','Pune','Maharashtra','9820011019','Infosys BPM','In Training','HR, Career Guidance'),
  ('00000000-0000-0000-0001-000000000021','00000000-0000-0000-0000-000000000021','Farhan','Sait','Male','1989-09-27','Bengaluru','Karnataka','9820011020','Wipro Cares','Active','Logistics, Management')
) AS r (id, user_id, first_name, last_name, gender, dob, city, state, phone, org_name, phase, skills)
ON CONFLICT (user_id) DO NOTHING;
