-- =============================================================================
-- S008  October 2026 sessions — demo/UAT only.
--
-- The three flagship programs had almost nothing on the calendar for October
-- 2026 (the month the client team is testing in): AAP's next session was
-- mid-November, Chote Kadam's only event was September's Hosur Road
-- renovation, and Activity-Based Volunteering had nothing upcoming at all.
-- Seven enrollable sessions spread across the month fix that:
--
--   Academic Adoption Program (AAP)
--     • Read to Rise — October Week 2 (DJ Halli)      Fri 09 Oct, 10:00, 2 h
--     • Infosys BPM Workplace Exposure Visit          Thu 15 Oct, 10:00, 4 h
--     • Read to Rise — October Week 4 (DJ Halli)      Fri 23 Oct, 10:00, 2 h
--   Chote Kadam (Community Infrastructure Mentorship)
--     • Anganwadi Repainting — Kadugodi               Sat 10 Oct, 09:00, 8 h
--     • School Library Setup — Ulsoor                 Sat 24 Oct, 09:00, 6 h
--   Activity-Based Volunteering (Corporate Day Outing)
--     • Planetarium Outing — Wipro Cares              Sat 17 Oct, 08:30, 8 h
--     • Bannerghatta Park Outing — Infosys BPM        Sat 31 Oct, 08:00, 8 h
--
-- All 'upcoming' and future-dated, so they are open for enrollment (BR-17).
-- Codes continue the seed block (EVT-2026-0206…0212); the app's own code
-- generator counts rows (next would be EVT-2026-0031+), so no collision.
-- Every session carries a beneficiary-community link (the V013 rule).
-- Idempotent: every insert is ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                    location, city, max_slots, coordinator_id, status, created_by) VALUES
  -- ── AAP · Read to Rise (fortnightly reading circles, DJ Halli) ──────────────
  ('00000000-0000-0000-0008-000000000206', 'EVT-2026-0206', '00000000-0000-0000-0005-000000000202',
   'Read to Rise — October Week 2 (DJ Halli)', '2026-10-09', '10:00', 2,
   'DJ Halli community learning space', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000207', 'EVT-2026-0207', '00000000-0000-0000-0005-000000000202',
   'Read to Rise — October Week 4 (DJ Halli)', '2026-10-23', '10:00', 2,
   'DJ Halli community learning space', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── AAP · Exposure Visit (students visit a sponsor workplace) ───────────────
  ('00000000-0000-0000-0008-000000000208', 'EVT-2026-0208', '00000000-0000-0000-0005-000000000201',
   'Infosys BPM Workplace Exposure Visit', '2026-10-15', '10:00', 4,
   'Infosys BPM campus, Electronic City', 'Bengaluru', 12,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── Chote Kadam · Community Infrastructure Mentorship ───────────────────────
  ('00000000-0000-0000-0008-000000000209', 'EVT-2026-0209', '00000000-0000-0000-0005-000000000203',
   'Anganwadi Repainting — Kadugodi', '2026-10-10', '09:00', 8,
   'Kadugodi anganwadi cluster', 'Bengaluru', 6,
   '00000000-0000-0000-0003-000000000002', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000210', 'EVT-2026-0210', '00000000-0000-0000-0005-000000000203',
   'School Library Setup — Ulsoor', '2026-10-24', '09:00', 6,
   'Government Primary School, Ulsoor', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000002', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── Activity-Based Volunteering · Corporate Day Outing ──────────────────────
  ('00000000-0000-0000-0008-000000000211', 'EVT-2026-0211', '00000000-0000-0000-0005-000000000204',
   'Planetarium Outing — Wipro Cares', '2026-10-17', '08:30', 8,
   'Jawaharlal Nehru Planetarium', 'Bengaluru', 10,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000212', 'EVT-2026-0212', '00000000-0000-0000-0005-000000000204',
   'Bannerghatta Park Outing — Infosys BPM', '2026-10-31', '08:00', 8,
   'Bannerghatta Biological Park', 'Bengaluru', 10,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Community links (>=1 per live session — the V013 rule) ───────────────────
INSERT INTO event_communities (event_id, community_id) VALUES
  ('00000000-0000-0000-0008-000000000206', '00000000-0000-0000-0009-000000000002'), -- DJ Halli
  ('00000000-0000-0000-0008-000000000207', '00000000-0000-0000-0009-000000000002'), -- DJ Halli
  ('00000000-0000-0000-0008-000000000208', '00000000-0000-0000-0009-000000000002'), -- DJ Halli
  ('00000000-0000-0000-0008-000000000209', '00000000-0000-0000-0009-000000000001'), -- Bengaluru (General)
  ('00000000-0000-0000-0008-000000000210', '00000000-0000-0000-0009-000000000001'), -- Bengaluru (General)
  ('00000000-0000-0000-0008-000000000211', '00000000-0000-0000-0009-000000000002'), -- DJ Halli
  ('00000000-0000-0000-0008-000000000212', '00000000-0000-0000-0009-000000000003')  -- Hosur Road Settlement
ON CONFLICT DO NOTHING;
