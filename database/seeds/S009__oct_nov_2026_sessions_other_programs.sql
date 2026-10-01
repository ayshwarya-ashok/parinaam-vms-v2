-- =============================================================================
-- S009  October–November 2026 sessions for the remaining programs — demo/UAT.
--
-- S008 filled October for the three flagship programs (AAP, Chote Kadam,
-- Activity-Based Volunteering). The other active programs still had nothing
-- on the testing calendar. Fifteen enrollable sessions across Oct + Nov 2026:
--
--   Community Health Camp (Sanjay Kumar)
--     • Blood Pressure Screening — October        Thu 08 Oct, 09:00, 3 h
--     • Nutrition Counselling — October           Tue 20 Oct, 11:00, 2 h
--     • First Aid Training — November             Sat 07 Nov, 09:30, 4 h
--     • Blood Pressure Screening — November       Thu 19 Nov, 09:00, 3 h
--   Digital Literacy Drive (Kavitha Reddy)
--     • Basic Computer Skills — October batch     Tue 13 Oct, 17:00, 2 h
--     • Internet Safety Workshop — October        Tue 27 Oct, 17:00, 2 h
--     • Basic Computer Skills — November batch    Tue 10 Nov, 17:00, 2 h
--   Youth Mentorship (Priya Menon)
--     • Career Guidance Session — October         Sun 18 Oct, 10:00, 3 h
--     • Study Skills Workshop — November          Sun 01 Nov, 10:00, 2 h
--     • Career Guidance Session — November        Sun 22 Nov, 10:00, 3 h
--   Green Bengaluru (Vikram Singh)
--     • Tree Plantation Drive — Lalbagh           Sun 11 Oct, 07:00, 3 h
--     • Nursery Setup — Lalbagh                   Sun 08 Nov, 07:30, 2 h
--     • Lake Clean-up Drive — Bellandur           Sat 28 Nov, 07:00, 3 h
--   Winter Coat Drive (Sanjay Kumar) — NAME-RESOLVED, see below
--     • Coat Collection — November Week 2         Sat 14 Nov, 10:00, 3 h
--     • Coat Collection — November Week 4         Sun 29 Nov, 10:00, 3 h
--
-- Environment Awareness is deliberately absent: the program is still draft,
-- so BR-17 would never let its sessions open for enrollment anyway.
--
-- Winter Coat Drive was created through the UI (random UUIDs), so it exists
-- only in databases where someone made it — its two sessions resolve the
-- activity BY NAME and silently insert nothing where the program is absent.
--
-- All 'upcoming', dates/slots/locations follow each activity's defaults,
-- codes continue the seed block (EVT-2026-0213…0227, clear of the app's
-- count-based generator), and every session carries a beneficiary-community
-- link (the V013 rule). Idempotent: every insert is ON CONFLICT DO NOTHING.
-- =============================================================================

INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                    location, city, max_slots, coordinator_id, status, created_by) VALUES
  -- ── Community Health Camp ────────────────────────────────────────────────────
  ('00000000-0000-0000-0008-000000000213', 'EVT-2026-0213', '00000000-0000-0000-0005-000000000001',
   'Blood Pressure Screening — October', '2026-10-08', '09:00', 3,
   'City Hall, Block A', 'Bengaluru', 5,
   '00000000-0000-0000-0003-000000000004', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000214', 'EVT-2026-0214', '00000000-0000-0000-0005-000000000002',
   'Nutrition Counselling — October', '2026-10-20', '11:00', 2,
   'City Hall, Block B', 'Bengaluru', 3,
   '00000000-0000-0000-0003-000000000004', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000215', 'EVT-2026-0215', '00000000-0000-0000-0005-000000000003',
   'First Aid Training — November', '2026-11-07', '09:30', 4,
   'City Hall, Block C', 'Bengaluru', 4,
   '00000000-0000-0000-0003-000000000004', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000216', 'EVT-2026-0216', '00000000-0000-0000-0005-000000000001',
   'Blood Pressure Screening — November', '2026-11-19', '09:00', 3,
   'City Hall, Block A', 'Bengaluru', 5,
   '00000000-0000-0000-0003-000000000004', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── Digital Literacy Drive (online, Zoom) ────────────────────────────────────
  ('00000000-0000-0000-0008-000000000217', 'EVT-2026-0217', '00000000-0000-0000-0005-000000000004',
   'Basic Computer Skills — October batch', '2026-10-13', '17:00', 2,
   'Zoom Room 1', 'Bengaluru', 3,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000218', 'EVT-2026-0218', '00000000-0000-0000-0005-000000000005',
   'Internet Safety Workshop — October', '2026-10-27', '17:00', 2,
   'Zoom Room 2', 'Bengaluru', 3,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000219', 'EVT-2026-0219', '00000000-0000-0000-0005-000000000004',
   'Basic Computer Skills — November batch', '2026-11-10', '17:00', 2,
   'Zoom Room 1', 'Bengaluru', 3,
   '00000000-0000-0000-0003-000000000003', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── Youth Mentorship ─────────────────────────────────────────────────────────
  ('00000000-0000-0000-0008-000000000220', 'EVT-2026-0220', '00000000-0000-0000-0005-000000000006',
   'Career Guidance Session — October', '2026-10-18', '10:00', 3,
   'Community Centre, Hall A', 'Bengaluru', 4,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000221', 'EVT-2026-0221', '00000000-0000-0000-0005-000000000007',
   'Study Skills Workshop — November', '2026-11-01', '10:00', 2,
   'Community Centre, Hall B', 'Bengaluru', 3,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000222', 'EVT-2026-0222', '00000000-0000-0000-0005-000000000006',
   'Career Guidance Session — November', '2026-11-22', '10:00', 3,
   'Community Centre, Hall A', 'Bengaluru', 4,
   '00000000-0000-0000-0003-000000000001', 'upcoming', '00000000-0000-0000-0000-000000000001'),

  -- ── Green Bengaluru ──────────────────────────────────────────────────────────
  ('00000000-0000-0000-0008-000000000223', 'EVT-2026-0223', '00000000-0000-0000-0005-000000000010',
   'Tree Plantation Drive — Lalbagh', '2026-10-11', '07:00', 3,
   'Lalbagh, West Lawn', 'Bengaluru', 12,
   '00000000-0000-0000-0003-000000000002', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000224', 'EVT-2026-0224', '00000000-0000-0000-0005-000000000011',
   'Nursery Setup — Lalbagh', '2026-11-08', '07:30', 2,
   'Lalbagh, Nursery Block', 'Bengaluru', 8,
   '00000000-0000-0000-0003-000000000002', 'upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000225', 'EVT-2026-0225', '00000000-0000-0000-0005-000000000101',
   'Lake Clean-up Drive — Bellandur', '2026-11-28', '07:00', 3,
   'Bellandur Lake, North Gate', 'Bengaluru', 6,
   '00000000-0000-0000-0003-000000000002', 'upcoming', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ── Winter Coat Drive: UI-created program (random UUIDs) — resolve by name ───
INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                    location, city, max_slots, coordinator_id, status, created_by)
SELECT v.id, v.code, a.id, v.name, v.date::date, v.start_time::time, v.hours,
       'Community Centre Foyer', 'Bengaluru', 6,
       '00000000-0000-0000-0003-000000000004', 'upcoming', '00000000-0000-0000-0000-000000000001'
FROM (VALUES
  ('00000000-0000-0000-0008-000000000226'::uuid, 'EVT-2026-0226',
   'Coat Collection — November Week 2', '2026-11-14', '10:00', 3::numeric),
  ('00000000-0000-0000-0008-000000000227'::uuid, 'EVT-2026-0227',
   'Coat Collection — November Week 4', '2026-11-29', '10:00', 3::numeric)
) AS v(id, code, name, date, start_time, hours)
JOIN activities a ON a.name = 'Coat Collection Point' AND a.status = 'active'
JOIN programs p ON p.id = a.program_id AND p.name = 'Winter Coat Drive' AND p.status = 'active'
ON CONFLICT (id) DO NOTHING;

-- ── Community links (>=1 per live session — the V013 rule) ───────────────────
-- Fixed-ID sessions → seeded communities; the Winter Coat Drive pair is guarded
-- by EXISTS so databases without that program skip the links too.
INSERT INTO event_communities (event_id, community_id) VALUES
  ('00000000-0000-0000-0008-000000000213', '00000000-0000-0000-0009-000000000001'), -- Bengaluru (General)
  ('00000000-0000-0000-0008-000000000214', '00000000-0000-0000-0009-000000000001'),
  ('00000000-0000-0000-0008-000000000215', '00000000-0000-0000-0009-000000000001'),
  ('00000000-0000-0000-0008-000000000216', '00000000-0000-0000-0009-000000000003'), -- Hosur Road Settlement
  ('00000000-0000-0000-0008-000000000217', '00000000-0000-0000-0009-000000000002'), -- DJ Halli
  ('00000000-0000-0000-0008-000000000218', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000219', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000220', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000221', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000222', '00000000-0000-0000-0009-000000000002'),
  ('00000000-0000-0000-0008-000000000223', '00000000-0000-0000-0009-000000000001'),
  ('00000000-0000-0000-0008-000000000224', '00000000-0000-0000-0009-000000000001'),
  ('00000000-0000-0000-0008-000000000225', '00000000-0000-0000-0009-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO event_communities (event_id, community_id)
SELECT e.id, '00000000-0000-0000-0009-000000000001'::uuid
FROM events e
WHERE e.id IN ('00000000-0000-0000-0008-000000000226', '00000000-0000-0000-0008-000000000227')
ON CONFLICT DO NOTHING;
