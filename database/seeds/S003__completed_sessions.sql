-- =============================================================================
-- S003  A fully-worked activity: completed, upcoming and draft sessions
--
-- The demo data had completed sessions scattered one per activity, so there
-- was nowhere to see an activity's whole life at once. This adds ONE activity
-- under Green Bengaluru holding every state an admin has to work with:
--
--   EVT-2026-0101  completed  full attendance, mixed sources, one absence
--   EVT-2026-0102  completed  a no-show who never filed, for the admin to log
--   EVT-2026-0103  completed  small turnout, hours below the scheduled duration
--   EVT-2026-0104  upcoming   enrolments + a waitlist (capacity deliberately 2)
--   EVT-2026-0105  draft      staff-only, for testing Publish and Edit
--
-- Idempotent: every insert is ON CONFLICT DO NOTHING or guarded by NOT EXISTS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The activity
-- -----------------------------------------------------------------------------
INSERT INTO activities (id, code, program_id, name, description, type, skill_required,
                        default_duration_hours, default_max_slots, default_location, status, sort_order)
VALUES ('00000000-0000-0000-0005-000000000101', 'ACT-101',
        '00000000-0000-0000-0004-000000000005',
        'Lake Clean-up Drive',
        'Shoreline waste collection and segregation at Bengaluru lakes, with a short briefing on water-body ecology.',
        'In person', 'Physical work', 3, 6, 'Bellandur Lake, North Gate', 'active', 3)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Its occurrences
-- -----------------------------------------------------------------------------
INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                    location, city, max_slots, coordinator_id, status, created_by) VALUES
  ('00000000-0000-0000-0008-000000000101','EVT-2026-0101','00000000-0000-0000-0005-000000000101','June Drive',      '2026-06-13','07:00',3,'Bellandur Lake, North Gate','Bengaluru',6,'00000000-0000-0000-0003-000000000004','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000102','EVT-2026-0102','00000000-0000-0000-0005-000000000101','July Drive',      '2026-07-11','07:00',3,'Bellandur Lake, North Gate','Bengaluru',6,'00000000-0000-0000-0003-000000000004','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000103','EVT-2026-0103','00000000-0000-0000-0005-000000000101','August Drive',    '2026-08-08','07:30',3,'Varthur Lake, South Bund','Bengaluru',6,'00000000-0000-0000-0003-000000000004','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000104','EVT-2026-0104','00000000-0000-0000-0005-000000000101','September Drive', '2026-09-19','07:00',3,'Bellandur Lake, North Gate','Bengaluru',2,'00000000-0000-0000-0003-000000000004','upcoming', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000105','EVT-2026-0105','00000000-0000-0000-0005-000000000101','October Drive',   '2026-10-17','07:00',3,'Varthur Lake, South Bund','Bengaluru',6,'00000000-0000-0000-0003-000000000004','draft',    '00000000-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Enrolments
-- -----------------------------------------------------------------------------
INSERT INTO event_enrollments (volunteer_id, event_id, status, skills, enrolled_at)
SELECT v.id, e.id, 'enrolled', v.skills, m.at::timestamptz
FROM (VALUES
  -- June: a good turnout
  ('rahul@example.org',   'EVT-2026-0101', '2026-06-02 10:00+05:30'),
  ('meera@example.org',   'EVT-2026-0101', '2026-06-02 18:20+05:30'),
  ('arjun@example.org',   'EVT-2026-0101', '2026-06-03 09:05+05:30'),
  ('nikhil@example.org',  'EVT-2026-0101', '2026-06-05 21:40+05:30'),
  -- July: one of these never files anything (Dev)
  ('rahul@example.org',   'EVT-2026-0102', '2026-07-01 08:00+05:30'),
  ('dev@example.org',     'EVT-2026-0102', '2026-07-01 08:30+05:30'),
  ('meera@example.org',   'EVT-2026-0102', '2026-07-02 12:15+05:30'),
  -- August: small turnout, short session
  ('ananya@example.org',  'EVT-2026-0103', '2026-08-01 07:45+05:30'),
  ('amit@example.org',    'EVT-2026-0103', '2026-08-01 19:00+05:30'),
  -- September (upcoming, 2 slots): full, so the waitlist below is real
  ('meera@example.org',   'EVT-2026-0104', '2026-08-15 09:00+05:30'),
  ('arjun@example.org',   'EVT-2026-0104', '2026-08-15 09:12+05:30')
) AS m(email, evt, at)
JOIN users u ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN events e ON e.code = m.evt
WHERE NOT EXISTS (
  SELECT 1 FROM event_enrollments x WHERE x.event_id = e.id AND x.volunteer_id = v.id
);

-- The September drive is full at 2, so these two are genuinely waiting (BR-10).
INSERT INTO waitlist_entries (volunteer_id, event_id, position, added_at)
SELECT v.id, e.id, m.pos, m.at::timestamptz
FROM (VALUES
  ('rahul@example.org',  'EVT-2026-0104', 1, '2026-08-16 10:00+05:30'),
  ('nikhil@example.org', 'EVT-2026-0104', 2, '2026-08-16 14:30+05:30')
) AS m(email, evt, pos, at)
JOIN users u ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN events e ON e.code = m.evt
WHERE NOT EXISTS (
  SELECT 1 FROM waitlist_entries x WHERE x.event_id = e.id AND x.volunteer_id = v.id
);

-- -----------------------------------------------------------------------------
-- Attendance — the logged hours the admin reviews. Deliberately varied:
-- self-reported and coordinator-reported, a documented absence, and one
-- volunteer (Dev, July) with NO record at all so the "+ Log" path has a subject.
-- -----------------------------------------------------------------------------
INSERT INTO attendance_records
  (event_id, volunteer_id, attended, arrival_time, departure_time, hours_contributed,
   absence_reason, notes, source, recorded_at)
SELECT e.id, v.id, m.attended, m.arrive::time, m.depart::time, m.hours,
       m.reason::absence_reason, m.notes, m.src::attendance_source, m.rec_at::timestamptz
FROM (VALUES
  ('EVT-2026-0101','rahul@example.org',  TRUE,  '07:00','10:00', 3.00, NULL, 'Led the segregation team.',        'self',        '2026-06-13 12:30+05:30'),
  ('EVT-2026-0101','meera@example.org',  TRUE,  '07:00','10:00', 3.00, NULL, NULL,                               'self',        '2026-06-13 13:10+05:30'),
  ('EVT-2026-0101','arjun@example.org',  TRUE,  '07:15','10:00', 2.75, NULL, 'Arrived slightly late.',           'self',        '2026-06-13 19:05+05:30'),
  ('EVT-2026-0101','nikhil@example.org', TRUE,  '07:00','10:00', 3.00, NULL, 'Marked present on the paper sheet.','coordinator','2026-06-13 11:00+05:30'),

  ('EVT-2026-0102','rahul@example.org',  TRUE,  '07:00','10:00', 3.00, NULL, NULL,                               'self',        '2026-07-11 14:00+05:30'),
  ('EVT-2026-0102','meera@example.org',  FALSE, NULL,   NULL,    0.00, 'Medical / Health issue', 'Called the coordinator that morning.', 'self', '2026-07-11 06:30+05:30'),
  -- dev@example.org: intentionally absent from this table (never responded).

  ('EVT-2026-0103','ananya@example.org', TRUE,  '07:30','09:00', 1.50, NULL, 'Rain cut the session short.',      'coordinator', '2026-08-08 10:15+05:30'),
  ('EVT-2026-0103','amit@example.org',   TRUE,  '07:30','09:00', 1.50, NULL, 'Rain cut the session short.',      'coordinator', '2026-08-08 10:15+05:30')
) AS m(evt, email, attended, arrive, depart, hours, reason, notes, src, rec_at)
JOIN events e ON e.code = m.evt
JOIN users u ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM attendance_records x WHERE x.event_id = e.id AND x.volunteer_id = v.id
);

-- -----------------------------------------------------------------------------
-- Coordinator reports — the beneficiary numbers behind the dashboard. The
-- August drive is 'partial': the weather ended it early, and the report is
-- where that shows up.
-- -----------------------------------------------------------------------------
INSERT INTO event_reports
  (event_id, coordinator_id, status, actual_start_time, actual_end_time,
   volunteers_present, beneficiaries_reached, highlights, challenges, submitted_at)
SELECT e.id, e.coordinator_id, m.status::event_report_status,
       m.st::time, m.et::time, m.vp, m.br, m.hi, m.ch, m.sub::timestamptz
FROM (VALUES
  ('EVT-2026-0101','completed','07:00','10:00', 4, 320, 'Cleared 640 kg of waste from the north shoreline; 320 residents reached through the awareness stall.', NULL, '2026-06-13 20:00+05:30'),
  ('EVT-2026-0102','completed','07:00','10:00', 1, 140, 'Smaller team but the inlet screen was fully cleared.', 'Two volunteers dropped out on the morning; consider over-enrolling by one.', '2026-07-11 20:30+05:30'),
  ('EVT-2026-0103','partial',  '07:30','09:00', 2,  95, 'Segregation bins installed at the south bund.', 'Heavy rain from 08:45 ended the drive an hour early.', '2026-08-08 18:00+05:30')
) AS m(evt, status, st, et, vp, br, hi, ch, sub)
JOIN events e ON e.code = m.evt
WHERE NOT EXISTS (SELECT 1 FROM event_reports x WHERE x.event_id = e.id);

-- -----------------------------------------------------------------------------
-- Attendance dispatch state, so Field Execution shows these as already sent.
-- -----------------------------------------------------------------------------
INSERT INTO attendance_dispatches
  (event_id, volunteer_email_sent, volunteer_email_sent_at, volunteer_send_count,
   coordinator_email_sent, coordinator_email_sent_at, coordinator_send_count)
SELECT e.id, TRUE, (e.date + TIME '18:00') AT TIME ZONE 'Asia/Kolkata', 1,
              TRUE, (e.date + TIME '18:00') AT TIME ZONE 'Asia/Kolkata', 1
FROM events e
WHERE e.code IN ('EVT-2026-0101','EVT-2026-0102','EVT-2026-0103')
  AND NOT EXISTS (SELECT 1 FROM attendance_dispatches d WHERE d.event_id = e.id);
