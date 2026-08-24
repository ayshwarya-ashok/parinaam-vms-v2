-- =============================================================================
-- S005 — The four client-document scenarios as demo data.
--
-- One worked example per programme in Parinaam_Volunteering_Activity_Attributes
-- (see docs/08-phased-sessions-and-communities.md §4):
--   1. AAP / Exposure Visit        — single-day workplace immersion (upcoming)
--   2. AAP / Read to Rise          — quarterly per community (one completed, one upcoming)
--   3. Chote Kadam                 — the SEVEN-phase mentor journey, in progress,
--                                    CSR volunteer as named partner lead, one visit logged
--   4. Activity-Based Volunteering — Snow City day outing (upcoming)
--
-- Requires V013–V015. Idempotent: every insert is ON CONFLICT DO NOTHING.
-- Codes use the 02xx range, far from both runtime-issued codes and S002/S003.
-- =============================================================================

-- ── Beneficiary communities ──────────────────────────────────────────────────
INSERT INTO beneficiary_communities (id, name, description, city, created_by) VALUES
  ('00000000-0000-0000-0009-000000000002', 'DJ Halli Learning Community',
   'Underserved urban community served by the Academic Adoption Program — Read to Rise sessions and student cohorts (ages 5–21).',
   'Bengaluru', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0009-000000000003', 'Hosur Road Settlement (Ujjivan)',
   'Grassroots community adopted under Chote Kadam for infrastructure interventions with Ujjivan Small Finance Bank mentors.',
   'Bengaluru', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Programs ─────────────────────────────────────────────────────────────────
INSERT INTO programs (id, code, name, description, status, default_coordinator_id, created_by) VALUES
  ('00000000-0000-0000-0004-000000000101', 'PRG-2026-101', 'Academic Adoption Program (AAP)',
   'Long-running academic support for students from underserved communities in Bangalore — first-generation learners, ages 5–21. Home of Exposure Visits and Read to Rise (Goodhearts volunteering).',
   'active', '00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000102', 'PRG-2026-102', 'Chote Kadam',
   'Community infrastructure development with Ujjivan Small Finance Bank — classrooms, anganwadis, healthcare centres. Corporate volunteers are onboarded as mentors mapped to a project for its full lifecycle.',
   'active', '00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000103', 'PRG-2026-103', 'Activity-Based Volunteering',
   'Corporate-sponsored day outings: volunteer groups fund and personally accompany Parinaam students on recreational-cum-educational trips as buddies/chaperones.',
   'active', '00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Activities ───────────────────────────────────────────────────────────────
INSERT INTO activities (id, code, program_id, name, description, type, outcome,
                        default_duration_hours, default_max_slots, status, sort_order, created_by) VALUES
  ('00000000-0000-0000-0005-000000000201', 'ACT-201', '00000000-0000-0000-0004-000000000101',
   'Exposure Visit',
   'Single-day site visit / immersion at a partner organization''s workplace for AAP students (17–21): guided tours, career Q&A, skills engagement. Host-organization employees volunteer as guides and mentors.',
   'In person', 'Students connect academic learning with real career pathways.', 4, 12, 'active', 1,
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0005-000000000202', 'ACT-202', '00000000-0000-0000-0004-000000000101',
   'Read to Rise',
   'Quarterly guided reading and writing sessions per community, facilitated by Field Coordinators with Goodhearts volunteers in one-on-one / small-group support. Storytelling, worksheets, journaling.',
   'In person', 'Improved reading fluency, comprehension and confidence.', 2, 8, 'active', 2,
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0005-000000000203', 'ACT-203', '00000000-0000-0000-0004-000000000102',
   'Community Infrastructure Mentorship',
   'The seven-phase mentor journey: onboarding, community engagement, deliberation, design thinking, execution, handover, recognition. Mentors participate rather than observe.',
   'In person', NULL, 8, 6, 'active', 1,
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0005-000000000204', 'ACT-204', '00000000-0000-0000-0004-000000000103',
   'Corporate Day Outing',
   'Single-day off-site recreational and educational outing. Corporate volunteers are paired with small student groups in a buddy system; the Field Coordinator owns child safety and logistics.',
   'In person', NULL, 8, 10, 'active', 1,
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Sessions ─────────────────────────────────────────────────────────────────
INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                    location, city, max_slots, coordinator_id, status, created_by) VALUES
  -- 1. Exposure Visit — upcoming single day
  ('00000000-0000-0000-0008-000000000201', 'EVT-2026-0201', '00000000-0000-0000-0005-000000000201',
   'TechCorp Workplace Exposure Visit', '2026-09-10', '10:00', 4,
   'TechCorp Solutions campus, Whitefield', 'Bengaluru', 12,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  -- 2. Read to Rise — Q2 ran and was closed by the admin; Q3 upcoming
  ('00000000-0000-0000-0008-000000000202', 'EVT-2026-0202', '00000000-0000-0000-0005-000000000202',
   'Read to Rise — Q2 FY27 (DJ Halli)', '2026-08-14', '10:00', 2,
   'DJ Halli community learning space', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000001', 'completed', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000203', 'EVT-2026-0203', '00000000-0000-0000-0005-000000000202',
   'Read to Rise — Q3 FY27 (DJ Halli)', '2026-11-13', '10:00', 2,
   'DJ Halli community learning space', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  -- 3. Chote Kadam — the phased mentor journey, derived status inprogress
  ('00000000-0000-0000-0008-000000000204', 'EVT-2026-0204', '00000000-0000-0000-0005-000000000203',
   'Anganwadi Renovation — Hosur Road', '2026-09-01', '09:00', 8,
   'Hosur Road settlement anganwadi', 'Bengaluru', 6,
   '00000000-0000-0000-0003-000000000002', 'inprogress', '00000000-0000-0000-0000-000000000001'),
  -- 4. Snow City outing — upcoming single day
  ('00000000-0000-0000-0008-000000000205', 'EVT-2026-0205', '00000000-0000-0000-0005-000000000204',
   'Snow City Outing — TechCorp', '2026-09-26', '08:30', 8,
   'Snow City, JC Nagar', 'Bengaluru', 10,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Community links (>=1 per live session — the V013 rule) ───────────────────
INSERT INTO event_communities (event_id, community_id) VALUES
  ('00000000-0000-0000-0008-000000000201', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000202', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000203', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000204', '00000000-0000-0000-0009-000000000003'),
  ('00000000-0000-0000-0008-000000000205', '00000000-0000-0000-0009-000000000002')
ON CONFLICT DO NOTHING;

-- ── The seven-phase mentor journey (Chote Kadam, verbatim from the client doc) ──
-- Phase 1 complete (Parinaam mark), phase 2 in progress with a logged mentor
-- visit; the CSR volunteer (csr@techcorp.in) is the named lead on every collab
-- phase. Session status above is the value fn_recompute_event_phase_status
-- derives from these rows.
INSERT INTO event_phases (id, event_id, sort_order, name, description, responsibility,
                          start_date, end_date, partner_lead_volunteer_id, status,
                          parinaam_marked_at, parinaam_marked_by) VALUES
  ('00000000-0000-0000-0011-000000000001', '00000000-0000-0000-0008-000000000204', 1,
   'On-boarding & Orientation',
   'Welcome email, programme philosophy deck, project mapping, roles and timelines.',
   'parinaam', '2026-09-01', '2026-09-01', NULL, 'completed',
   '2026-09-01 12:30+05:30', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0011-000000000002', '00000000-0000-0000-0008-000000000204', 2,
   'From Awareness to Engagement',
   'Site visits and community interactions with residents, parents and healthcare workers.',
   'collab', '2026-09-07', '2026-09-18', '00000000-0000-0000-0001-000000000017', 'inprogress',
   NULL, NULL),
  ('00000000-0000-0000-0011-000000000003', '00000000-0000-0000-0008-000000000204', 3,
   'Participation in Deliberation',
   'Mentors witness community-led needs identification and prioritisation.',
   'collab', '2026-09-21', '2026-09-30', '00000000-0000-0000-0001-000000000017', 'upcoming',
   NULL, NULL),
  ('00000000-0000-0000-0011-000000000004', '00000000-0000-0000-0008-000000000204', 4,
   'Exposure to Design Thinking',
   'Site assessment, material selection, layout/light/accessibility choices, costed plan.',
   'parinaam', '2026-10-05', '2026-10-16', NULL, 'upcoming',
   NULL, NULL),
  ('00000000-0000-0000-0011-000000000005', '00000000-0000-0000-0008-000000000204', 5,
   'Engagement During Execution',
   'Vendor coordination, milestone monitoring, budget controls, quality checks.',
   'collab', '2026-10-19', '2026-11-27', '00000000-0000-0000-0001-000000000017', 'upcoming',
   NULL, NULL),
  ('00000000-0000-0000-0011-000000000006', '00000000-0000-0000-0008-000000000204', 6,
   'Witnessing Transformation (Handover)',
   'The community experiences the renovated anganwadi — the most powerful moment of the journey.',
   'collab', '2026-12-04', '2026-12-04', '00000000-0000-0000-0001-000000000017', 'upcoming',
   NULL, NULL),
  ('00000000-0000-0000-0011-000000000007', '00000000-0000-0000-0008-000000000204', 7,
   'Recognition & Appreciation',
   'Appreciation email + digital certificate within one month of handover.',
   'parinaam', '2026-12-18', '2026-12-18', NULL, 'upcoming',
   NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- One mentor visit under phase 2 (visit-level attendance, V015):
-- (volunteer, phase, day) unique; presence by definition, hours required.
INSERT INTO attendance_records (id, event_id, volunteer_id, phase_id, visit_date,
                                attended, hours_contributed, notes, source, recorded_by) VALUES
  ('00000000-0000-0000-0012-000000000001', '00000000-0000-0000-0008-000000000204',
   '00000000-0000-0000-0001-000000000017', '00000000-0000-0000-0011-000000000002', '2026-09-07',
   TRUE, 3, 'First site visit with community interactions.', 'admin',
   '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
