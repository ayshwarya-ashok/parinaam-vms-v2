-- =============================================================================
-- S002  Demo data — local development and UAT only. NEVER load in production.
--
-- Remapped onto the Program -> Activity -> Event hierarchy:
--   the prototype's "Community Health Camp" (an event) is now a PROGRAM,
--   its "Blood Pressure Screening" is now an ACTIVITY, and the 15 Jul 09:00
--   sitting of it is an EVENT. Blood Pressure Screening has two occurrences so
--   the recurrence the remodel exists for is visible in the demo data.
--
-- Reference date: 2026-08-18.
--   Occurrences up to 05 Aug are 'completed' and carry attendance + feedback.
--   19 Aug, 10 Sep are 'upcoming' and enrollable.
--   The Environment Awareness program is still 'draft'.
--
-- All demo logins use the password:  Parinaam@123
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users
-- -----------------------------------------------------------------------------
INSERT INTO users (id, email, password_hash, role, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@parinaam.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'admin',     now()),
  ('00000000-0000-0000-0000-000000000002', 'ananya@example.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000003', 'rahul@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000004', 'sunita@example.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000005', 'meera@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000006', 'arjun@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000007', 'lakshmi@example.org', crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000008', 'dev@example.org',     crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000009', 'pooja@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000010', 'nikhil@example.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000011', 'deepa@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000012', 'amit@example.org',    crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000013', 'riya@example.org',    crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000014', 'karan@example.org',   crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000015', 'preethi@example.org', crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000016', 'suresh@example.org',  crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now()),
  ('00000000-0000-0000-0000-000000000017', 'csr@techcorp.in',     crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now())
ON CONFLICT (email) DO NOTHING;

INSERT INTO organizations (id, name, email, phone, contact_person) VALUES
  ('00000000-0000-0000-0002-000000000001', 'TechCorp India Pvt. Ltd.', 'csr@techcorp.in', '+91 80 4000 1000', 'Ravi Kulkarni')
ON CONFLICT (name) DO NOTHING;

INSERT INTO volunteers (id, user_id, first_name, last_name, gender, date_of_birth, city, state, phone, category, organization_id, phase, skills, compliance_read) VALUES
  ('00000000-0000-0000-0001-000000000002','00000000-0000-0000-0000-000000000002','Ananya','Sharma','Female','1995-03-12','Pune','Maharashtra','+91 98200 11001','Individual',NULL,'Active','First Aid',TRUE),
  ('00000000-0000-0000-0001-000000000003','00000000-0000-0000-0000-000000000003','Rahul','Desai','Male','1990-07-08','Mumbai','Maharashtra','+91 98200 11002','Individual',NULL,'In Training','Medical',TRUE),
  ('00000000-0000-0000-0001-000000000004','00000000-0000-0000-0000-000000000004','Sunita','Rao','Female','1988-11-23','Mumbai','Maharashtra','+91 98200 11003','Individual',NULL,'In Training','Teaching',TRUE),
  ('00000000-0000-0000-0001-000000000005','00000000-0000-0000-0000-000000000005','Meera','Joshi','Female','1993-01-30','Pune','Maharashtra','+91 98200 11004','Individual',NULL,'Active','Teaching, IT',TRUE),
  ('00000000-0000-0000-0001-000000000006','00000000-0000-0000-0000-000000000006','Arjun','Nair','Male','1996-05-19','Pune','Maharashtra','+91 98200 11005','Individual',NULL,'In Training','IT',TRUE),
  ('00000000-0000-0000-0001-000000000007','00000000-0000-0000-0000-000000000007','Lakshmi','Rao','Female','1992-09-02','Pune','Maharashtra','+91 98200 11006','Individual',NULL,'In Training','Teaching',TRUE),
  ('00000000-0000-0000-0001-000000000008','00000000-0000-0000-0000-000000000008','Dev','Sharma','Male','1994-12-15','Pune','Maharashtra','+91 98200 11007','Individual',NULL,'In Training','IT, Communication',TRUE),
  ('00000000-0000-0000-0001-000000000009','00000000-0000-0000-0000-000000000009','Pooja','Iyer','Female','1997-04-06','Pune','Maharashtra','+91 98200 11008','Individual',NULL,'Onboarding','Teaching',FALSE),
  ('00000000-0000-0000-0001-000000000010','00000000-0000-0000-0000-000000000010','Nikhil','Gupta','Male','1991-02-28','Bengaluru','Karnataka','+91 98200 11009','Individual',NULL,'In Training','Mentoring',TRUE),
  ('00000000-0000-0000-0001-000000000011','00000000-0000-0000-0000-000000000011','Deepa','Pillai','Female','1989-06-11','Bengaluru','Karnataka','+91 98200 11010','Individual',NULL,'Onboarding','Career Guidance',FALSE),
  ('00000000-0000-0000-0001-000000000012','00000000-0000-0000-0000-000000000012','Amit','Verma','Male','1993-08-21','Bengaluru','Karnataka','+91 98200 11011','Individual',NULL,'In Training','Communication',TRUE),
  ('00000000-0000-0000-0001-000000000013','00000000-0000-0000-0000-000000000013','Riya','Shah','Female','1998-10-04','Bengaluru','Karnataka','+91 98200 11012','Individual',NULL,'Onboarding','Teaching',FALSE),
  ('00000000-0000-0000-0001-000000000014','00000000-0000-0000-0000-000000000014','Karan','Mehta','Male','1990-03-17','Bengaluru','Karnataka','+91 98200 11013','Individual',NULL,'In Training','IT, Mentoring',TRUE),
  ('00000000-0000-0000-0001-000000000015','00000000-0000-0000-0000-000000000015','Preethi','Nair','Female','1995-07-25','Bengaluru','Karnataka','+91 98200 11014','Individual',NULL,'Onboarding','HR, Teaching',FALSE),
  ('00000000-0000-0000-0001-000000000016','00000000-0000-0000-0000-000000000016','Suresh','Kumar','Male','1987-01-09','Bengaluru','Karnataka','+91 98200 11015','Individual',NULL,'In Training','Management',TRUE),
  ('00000000-0000-0000-0001-000000000017','00000000-0000-0000-0000-000000000017','Ravi','Kulkarni','Male','1985-05-05','Mumbai','Maharashtra','+91 98200 11016','CSR','00000000-0000-0000-0002-000000000001','Active','Logistics',TRUE)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO coordinators (id, name, email, mobile) VALUES
  ('00000000-0000-0000-0003-000000000001','Priya Menon',   'priya@parinaam.org',   '+91 98765 43210'),
  ('00000000-0000-0000-0003-000000000002','Vikram Singh',  'vikram@parinaam.org',  '+91 87654 32109'),
  ('00000000-0000-0000-0003-000000000003','Kavitha Reddy', 'kavitha@parinaam.org', '+91 76543 21098'),
  ('00000000-0000-0000-0003-000000000004','Sanjay Kumar',  'sanjay@parinaam.org',  '+91 65432 10987')
ON CONFLICT (email) DO NOTHING;

-- -----------------------------------------------------------------------------
-- PROGRAMS (undated)
-- -----------------------------------------------------------------------------
INSERT INTO programs (id, code, name, description, status, default_coordinator_id, created_by) VALUES
  ('00000000-0000-0000-0004-000000000001','PRG-2026-001','Community Health Camp',
   'Ongoing health awareness programme providing free screenings and nutritional guidance to local communities.',
   'active','00000000-0000-0000-0003-000000000001','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000002','PRG-2026-002','Digital Literacy Drive',
   'Bridging the digital divide by teaching basic computer skills and internet safety to underserved communities.',
   'active','00000000-0000-0000-0003-000000000002','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000003','PRG-2026-003','Youth Mentorship',
   'Connecting youth with experienced professionals for career guidance, mentorship and skill-building.',
   'active','00000000-0000-0000-0003-000000000003','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000004','PRG-2026-004','Environment Awareness',
   'Community walks and cleanup drives raising local environmental awareness. Not yet launched.',
   'draft','00000000-0000-0000-0003-000000000004','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0004-000000000005','PRG-2026-005','Green Bengaluru',
   'Plantation and nursery programme run with the city horticulture department.',
   'active','00000000-0000-0000-0003-000000000004','00000000-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ACTIVITIES (undated definitions). ACT-009 is discontinued.
-- -----------------------------------------------------------------------------
INSERT INTO activities (id, code, program_id, name, description, type, skill_required, default_duration_hours, default_max_slots, default_location, status, sort_order, discontinued_at, discontinue_reason) VALUES
  ('00000000-0000-0000-0005-000000000001','ACT-001','00000000-0000-0000-0004-000000000001','Blood Pressure Screening','Screening camp for hypertension awareness and referral.','In person','First aid',3,5,'City Hall, Block A','active',1,NULL,NULL),
  ('00000000-0000-0000-0005-000000000002','ACT-002','00000000-0000-0000-0004-000000000001','Nutrition Counselling','One-to-one dietary guidance for families.','In person','Counselling',2,3,'City Hall, Block B','active',2,NULL,NULL),
  ('00000000-0000-0000-0005-000000000003','ACT-003','00000000-0000-0000-0004-000000000001','First Aid Training','Hands-on community first-aid certification.','In person','First aid',4,4,'City Hall, Block C','active',3,NULL,NULL),
  ('00000000-0000-0000-0005-000000000004','ACT-004','00000000-0000-0000-0004-000000000002','Basic Computer Skills','Introductory computing for first-time users.','Online','Teaching, IT',2,3,'Zoom Room 1','active',1,NULL,NULL),
  ('00000000-0000-0000-0005-000000000005','ACT-005','00000000-0000-0000-0004-000000000002','Internet Safety Workshop','Phishing, passwords and safe browsing.','Online','IT',2,3,'Zoom Room 2','active',2,NULL,NULL),
  ('00000000-0000-0000-0005-000000000006','ACT-006','00000000-0000-0000-0004-000000000003','Career Guidance Session','Mentor-mentee matching and career conversations.','In person','Mentoring',3,4,'Community Centre, Hall A','active',1,NULL,NULL),
  ('00000000-0000-0000-0005-000000000007','ACT-007','00000000-0000-0000-0004-000000000003','Study Skills Workshop','Study technique and exam preparation coaching.','In person','Teaching',2,3,'Community Centre, Hall B','active',2,NULL,NULL),
  ('00000000-0000-0000-0005-000000000008','ACT-008','00000000-0000-0000-0004-000000000004','Awareness Walk','Community walk raising environmental awareness.','In person',NULL,3,10,'Cubbon Park, Main Gate','active',1,NULL,NULL),
  ('00000000-0000-0000-0005-000000000009','ACT-009','00000000-0000-0000-0004-000000000004','Cleanup Drive','Litter collection and segregation drive.','In person',NULL,2,8,'Cubbon Park, East Side','discontinued',2,'2026-08-01 10:00+05:30','Superseded by the municipal cleanup contract.'),
  ('00000000-0000-0000-0005-000000000010','ACT-010','00000000-0000-0000-0004-000000000005','Tree Plantation Drive','Sapling plantation with the horticulture department.','In person','Gardening',3,12,'Lalbagh, West Lawn','active',1,NULL,NULL),
  ('00000000-0000-0000-0005-000000000011','ACT-011','00000000-0000-0000-0004-000000000005','Nursery Setup','Preparing and maintaining the sapling nursery.','In person','Gardening',2,8,'Lalbagh, Nursery Block','active',2,NULL,NULL)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- EVENTS (dated occurrences). ACT-001 recurs: 15 Jul and 19 Aug.
-- -----------------------------------------------------------------------------
INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours, location, city, max_slots, coordinator_id, status, created_by) VALUES
  ('00000000-0000-0000-0008-000000000001','EVT-2026-0001','00000000-0000-0000-0005-000000000001','July Session',  '2026-07-15','09:00',3,'City Hall, Block A, Mumbai','Mumbai',5,'00000000-0000-0000-0003-000000000001','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000002','EVT-2026-0002','00000000-0000-0000-0005-000000000002',NULL,            '2026-07-15','10:00',2,'City Hall, Block B, Mumbai','Mumbai',3,'00000000-0000-0000-0003-000000000001','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000003','EVT-2026-0003','00000000-0000-0000-0005-000000000003',NULL,            '2026-07-15','13:00',4,'City Hall, Block C, Mumbai','Mumbai',4,'00000000-0000-0000-0003-000000000001','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000004','EVT-2026-0004','00000000-0000-0000-0005-000000000004',NULL,            '2026-07-22','09:30',2,'Public Library, Pune (Zoom Room 1)','Pune',3,'00000000-0000-0000-0003-000000000002','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000005','EVT-2026-0005','00000000-0000-0000-0005-000000000005',NULL,            '2026-07-22','11:30',2,'Public Library, Pune (Zoom Room 2)','Pune',3,'00000000-0000-0000-0003-000000000002','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000006','EVT-2026-0006','00000000-0000-0000-0005-000000000006',NULL,            '2026-08-05','10:00',3,'Community Centre, Hall A, Bengaluru','Bengaluru',4,'00000000-0000-0000-0003-000000000003','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000007','EVT-2026-0007','00000000-0000-0000-0005-000000000007',NULL,            '2026-08-05','14:00',2,'Community Centre, Hall B, Bengaluru','Bengaluru',3,'00000000-0000-0000-0003-000000000003','completed','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000008','EVT-2026-0008','00000000-0000-0000-0005-000000000008',NULL,            '2026-09-12','07:00',3,'Cubbon Park, Main Gate, Bengaluru','Bengaluru',10,'00000000-0000-0000-0003-000000000004','draft','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000009','EVT-2026-0009','00000000-0000-0000-0005-000000000009',NULL,            '2026-09-12','10:00',2,'Cubbon Park, East Side, Bengaluru','Bengaluru',8,'00000000-0000-0000-0003-000000000004','draft','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000010','EVT-2026-0010','00000000-0000-0000-0005-000000000010',NULL,            '2026-09-10','08:00',3,'Lalbagh, West Lawn, Bengaluru','Bengaluru',12,'00000000-0000-0000-0003-000000000004','upcoming','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0008-000000000011','EVT-2026-0011','00000000-0000-0000-0005-000000000011',NULL,            '2026-09-10','09:30',2,'Lalbagh, Nursery Block, Bengaluru','Bengaluru',8,'00000000-0000-0000-0003-000000000004','upcoming','00000000-0000-0000-0000-000000000001'),
  -- Second occurrence of ACT-001. This is the recurrence the remodel exists for.
  ('00000000-0000-0000-0008-000000000012','EVT-2026-0012','00000000-0000-0000-0005-000000000001','August Session','2026-08-19','09:00',3,'City Hall, Block A, Mumbai','Mumbai',5,'00000000-0000-0000-0003-000000000001','upcoming','00000000-0000-0000-0000-000000000001')
ON CONFLICT (code) DO NOTHING;

-- NOTE: EVT-2026-0010 (08:00–11:00) and EVT-2026-0011 (09:30–11:30) overlap on
-- purpose, so the BR-11 scheduling-conflict path is demoable out of the box.

-- -----------------------------------------------------------------------------
-- Activity (non-mandatory) trainings
-- -----------------------------------------------------------------------------
INSERT INTO trainings (id, code, name, description, duration, mode, category, status, passing_score, is_mandatory) VALUES
  ('00000000-0000-0000-0006-000000000001','t1','Orientation',
   'Mandatory orientation covering Parinaam''s mission, volunteer code of conduct, confidentiality and safety protocols.',
   '2h','Online','compliance','active',70,FALSE),
  ('00000000-0000-0000-0006-000000000002','t2','First Aid',
   'Hands-on first aid and emergency response training covering CPR, wound care and managing medical emergencies in the field.',
   '4h','In person','activity','active',80,FALSE),
  ('00000000-0000-0000-0006-000000000003','t3','Child Safeguarding',
   'Essential training on protecting children from abuse, recognising warning signs, and mandatory reporting obligations.',
   '3h','Online','compliance','active',80,FALSE),
  ('00000000-0000-0000-0006-000000000004','t4','Community Outreach Basics',
   'Effective communication techniques, cultural sensitivity and outreach strategies for working with diverse communities.',
   '2h','Online','activity','active',70,FALSE),
  ('00000000-0000-0000-0006-000000000005','t5','Mental Health Awareness',
   'Recognising signs of mental health challenges in volunteers and beneficiaries, and providing appropriate support and referrals.',
   '2h','Online','compliance','active',70,FALSE)
ON CONFLICT (code) DO NOTHING;

SELECT seed_question('t1', 1, 'What is the primary goal of Parinaam Foundation?', 1,
  ARRAY['Profit generation','Community empowerment through volunteerism','Corporate training','Government compliance']);
SELECT seed_question('t1', 2, 'How many hours in advance must you notify if you cannot attend an activity?', 2,
  ARRAY['1 hour','12 hours','24 hours','48 hours']);
SELECT seed_question('t1', 3, 'Which of the following is a core volunteer responsibility?', 1,
  ARRAY['Attending all social events','Maintaining confidentiality of beneficiaries','Sharing beneficiary photos on social media','Skipping training modules']);
SELECT seed_question('t1', 4, 'What should you do if you witness misconduct during an activity?', 2,
  ARRAY['Ignore it','Handle it yourself','Report to the field co-ordinator immediately','Post about it online']);
SELECT seed_question('t1', 5, 'Volunteer data and beneficiary information must be treated as:', 1,
  ARRAY['Public information','Confidential and protected','Optional to share','Available on the website']);

SELECT seed_question('t2', 1, 'What is the correct compression depth for adult CPR?', 2,
  ARRAY['1–2 cm','2–2.5 cm','5–6 cm','8–10 cm']);
SELECT seed_question('t2', 2, 'When should you call emergency services?', 1,
  ARRAY['Only after trying to treat the patient yourself','Immediately when the situation is life-threatening','Only if the patient asks','After 10 minutes of no improvement']);
SELECT seed_question('t2', 3, 'Which position is used for an unconscious breathing patient?', 1,
  ARRAY['Supine (flat on back)','Recovery position (on side)','Seated upright','Face down']);
SELECT seed_question('t2', 4, 'How many rescue breaths follow 30 chest compressions in adult CPR?', 1,
  ARRAY['1','2','3','5']);
SELECT seed_question('t2', 5, 'A tourniquet should be applied:', 1,
  ARRAY['Directly over a wound','A few cm above a wound on a limb','Below the wound','Only by doctors']);

SELECT seed_question('t3', 1, 'Child safeguarding is the responsibility of:', 1,
  ARRAY['Only designated safeguarding officers','All volunteers and staff','Only paid employees','Only management']);
SELECT seed_question('t3', 2, 'Which of the following is a potential sign of child abuse?', 1,
  ARRAY['A child who is active and talkative','Unexplained bruises or injuries','A child who enjoys learning','Good attendance at activities']);
SELECT seed_question('t3', 3, 'If a child discloses abuse to you, you should:', 2,
  ARRAY['Promise to keep it secret','Investigate yourself','Listen, reassure, and report to the designated officer','Tell the child''s parents immediately']);
SELECT seed_question('t3', 4, 'Photography or video of children during activities:', 1,
  ARRAY['Is always allowed if the volunteer takes it','Requires written consent from guardians','Is never allowed under any circumstances','Only requires verbal consent']);

SELECT seed_question('t4', 1, 'Effective community outreach begins with:', 1,
  ARRAY['Distributing flyers','Listening and understanding community needs','Giving speeches','Setting up social media pages']);
SELECT seed_question('t4', 2, 'Cultural sensitivity means:', 2,
  ARRAY['Ignoring cultural differences','Imposing your own values','Respecting and adapting to cultural norms','Only working with familiar cultures']);
SELECT seed_question('t4', 3, 'When a community member disagrees with your approach, you should:', 2,
  ARRAY['Argue your point persistently','Dismiss their feedback','Listen actively and adapt if appropriate','Report them to management']);

SELECT seed_question('t5', 1, 'Mental health conditions are:', 1,
  ARRAY['A sign of personal weakness','Common and treatable health issues','Rare and only affect certain people','Always visible to others']);
SELECT seed_question('t5', 2, 'If a volunteer appears to be struggling emotionally, you should:', 2,
  ARRAY['Ignore it — it is not your concern','Tell everyone on the team','Check in privately and offer support or referral','Post about it on the group chat']);
SELECT seed_question('t5', 3, 'Self-care for volunteers is:', 2,
  ARRAY['Selfish','Unnecessary if you are experienced','Essential for sustained volunteering','Only needed after critical incidents']);

-- -----------------------------------------------------------------------------
-- Training materials — real PDFs, generated by scripts/generate-seed-materials.mjs
-- (run once after first boot; it renders each document and fixes sizes/hashes)
-- -----------------------------------------------------------------------------
INSERT INTO training_materials (training_id, name, file_type, file_path, file_size_text, pages, slides, duration_text, sort_order)
SELECT t.id, m.name, m.ftype::material_file_type, m.path, m.size_text, m.pages, m.slides, m.dur, m.sort
FROM (VALUES
  ('t1','Volunteer Handbook.pdf',              'pdf','seed/t1-handbook.pdf',   '3.2 MB', 24,  NULL, NULL, 1),
  ('t1','Welcome to Parinaam.pdf',             'pdf','seed/t1-welcome.pdf',    '1.6 KB', 1,   NULL, NULL, 2),
  ('t2','First Aid Manual.pdf',                'pdf','seed/t2-manual.pdf',     '4.8 MB', 56,  NULL, NULL, 1),
  ('t2','CPR Procedure Guide.pdf',             'pdf','seed/t2-cpr.pdf',        '1.2 MB', 8,   NULL, NULL, 2),
  ('t2','Emergency Response Video.pdf',        'pdf','seed/t2-response.pdf',   '1.4 KB', 1,   NULL, NULL, 3),
  ('t3','Child Safeguarding Policy.pdf',       'pdf','seed/t3-policy.pdf',     '2.1 MB', 32,  NULL, NULL, 1),
  ('t3','Recognition & Reporting Guide.pdf',   'pdf','seed/t3-reporting.pdf',  '1.6 KB', 1,   NULL, NULL, 2),
  ('t4','Outreach Techniques.pdf',             'pdf','seed/t4-outreach.pdf',   '1.5 KB', 1,   NULL, NULL, 1),
  ('t5','Mental Health Handbook.pdf',          'pdf','seed/t5-handbook.pdf',   '2.9 MB', 28,  NULL, NULL, 1),
  ('tc1','POCSO Act Overview.pdf',             'pdf','seed/tc1-overview.pdf',  '2.8 MB', 36,  NULL, NULL, 1),
  ('tc1','Mandatory Reporting Guidelines.pdf', 'pdf','seed/tc1-reporting.pdf', '1.1 MB', 10,  NULL, NULL, 2),
  ('tc2','POSH Act and Policy.pdf',            'pdf','seed/tc2-policy.pdf',    '3.1 MB', 42,  NULL, NULL, 1),
  ('tc2','ICC Procedures & Timelines.pdf',     'pdf','seed/tc2-icc.pdf',       '1.4 KB', 1,   NULL, NULL, 2),
  ('tc3','Volunteer NDA Agreement.pdf',        'pdf','seed/tc3-nda.pdf',       '1.4 MB', 8,   NULL, NULL, 1)
) AS m(tcode, name, ftype, path, size_text, pages, slides, dur, sort)
JOIN trainings t ON t.code = m.tcode
WHERE NOT EXISTS (
  SELECT 1 FROM training_materials tm WHERE tm.training_id = t.id AND tm.name = m.name
);

-- -----------------------------------------------------------------------------
-- Training links. Program level = context; activity level = skill gate.
-- -----------------------------------------------------------------------------
INSERT INTO program_trainings (program_id, training_id)
SELECT p.id, t.id
FROM (VALUES
  ('PRG-2026-001','t1'),
  ('PRG-2026-002','t1'),
  ('PRG-2026-003','t1'), ('PRG-2026-003','t3'),
  ('PRG-2026-004','t1'),
  ('PRG-2026-005','t1')
) AS m(pcode, tcode)
JOIN programs  p ON p.code = m.pcode
JOIN trainings t ON t.code = m.tcode
ON CONFLICT DO NOTHING;

INSERT INTO activity_trainings (activity_id, training_id)
SELECT a.id, t.id
FROM (VALUES
  ('ACT-001','t2'),
  ('ACT-003','t2'),
  ('ACT-004','t4'),
  ('ACT-005','t4'),
  ('ACT-007','t3'),
  ('ACT-011','t4')
) AS m(acode, tcode)
JOIN activities a ON a.code = m.acode
JOIN trainings  t ON t.code = m.tcode
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Consents
-- -----------------------------------------------------------------------------
INSERT INTO volunteer_consents (volunteer_id, pocso_agreed, posh_agreed, nda_agreed, signed_name, consent_date)
SELECT v.id, TRUE, TRUE, TRUE, v.first_name || ' ' || v.last_name, DATE '2026-07-01'
FROM volunteers v
WHERE v.phase <> 'Onboarding'
ON CONFLICT (volunteer_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Compliance and activity training attempts
--   Ananya, Meera, Ravi — fully compliant
--   Rahul  — POCSO attempts exhausted (3 fails); drives the admin reset flow
--   Nikhil — partial
-- -----------------------------------------------------------------------------
INSERT INTO training_attempts
  (volunteer_id, training_id, attempt_number, score_percent, correct_count, question_count, passed, attempted_at, expiry_date)
SELECT v.id, t.id, m.attempt_no, m.score, m.correct, m.qcount, m.passed,
       m.attempted_at::timestamptz,
       CASE WHEN m.passed THEN (m.attempted_at::date + INTERVAL '12 months')::date END
FROM (VALUES
  ('ananya@example.org', 'tc1', 1, 65.00, 3, 5, FALSE, '2026-07-04 10:00+05:30'),
  ('ananya@example.org', 'tc1', 2, 88.00, 4, 5, TRUE,  '2026-07-05 10:30+05:30'),
  ('ananya@example.org', 'tc2', 1, 85.00, 4, 5, TRUE,  '2026-07-05 11:00+05:30'),
  ('ananya@example.org', 'tc3', 1, 100.00,4, 4, TRUE,  '2026-07-05 11:30+05:30'),
  ('meera@example.org',  'tc1', 1, 92.00, 5, 5, TRUE,  '2026-07-06 09:00+05:30'),
  ('meera@example.org',  'tc2', 1, 90.00, 5, 5, TRUE,  '2026-07-06 09:40+05:30'),
  ('meera@example.org',  'tc3', 1, 100.00,4, 4, TRUE,  '2026-07-06 10:10+05:30'),
  ('csr@techcorp.in',    'tc1', 1, 90.00, 5, 5, TRUE,  '2026-07-06 12:00+05:30'),
  ('csr@techcorp.in',    'tc2', 1, 90.00, 5, 5, TRUE,  '2026-07-06 12:30+05:30'),
  ('csr@techcorp.in',    'tc3', 1, 100.00,4, 4, TRUE,  '2026-07-06 13:00+05:30'),
  ('rahul@example.org',  'tc1', 1, 50.00, 2, 5, FALSE, '2026-07-06 12:00+05:30'),
  ('rahul@example.org',  'tc1', 2, 60.00, 3, 5, FALSE, '2026-07-07 12:00+05:30'),
  ('rahul@example.org',  'tc1', 3, 55.00, 3, 5, FALSE, '2026-07-08 12:00+05:30'),
  ('rahul@example.org',  'tc2', 1, 60.00, 3, 5, FALSE, '2026-07-06 13:00+05:30'),
  ('rahul@example.org',  'tc2', 2, 78.00, 4, 5, FALSE, '2026-07-07 13:00+05:30'),
  ('rahul@example.org',  'tc3', 1, 75.00, 3, 4, TRUE,  '2026-07-06 14:00+05:30'),
  ('nikhil@example.org', 'tc1', 1, 72.00, 4, 5, FALSE, '2026-07-09 10:00+05:30'),
  ('nikhil@example.org', 'tc3', 1, 50.00, 2, 4, FALSE, '2026-07-09 11:00+05:30'),
  ('ananya@example.org', 't1',  1, 100.00,5, 5, TRUE,  '2026-07-06 09:00+05:30'),
  ('ananya@example.org', 't2',  1, 80.00, 4, 5, TRUE,  '2026-07-07 09:00+05:30'),
  ('meera@example.org',  't1',  1, 100.00,5, 5, TRUE,  '2026-07-07 09:00+05:30'),
  ('meera@example.org',  't4',  1, 100.00,3, 3, TRUE,  '2026-07-07 10:00+05:30'),
  ('csr@techcorp.in',    't1',  1, 100.00,5, 5, TRUE,  '2026-07-07 11:00+05:30'),
  ('rahul@example.org',  't1',  1, 80.00, 4, 5, TRUE,  '2026-07-08 09:00+05:30')
) AS m(email, tcode, attempt_no, score, correct, qcount, passed, attempted_at)
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN trainings t  ON t.code = m.tcode
ON CONFLICT (volunteer_id, training_id, attempt_number) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Event enrollments
-- -----------------------------------------------------------------------------
INSERT INTO event_enrollments (volunteer_id, event_id, status, skills)
SELECT v.id, e.id, 'enrolled', v.skills
FROM (VALUES
  ('rahul@example.org',  'EVT-2026-0001'),
  ('sunita@example.org', 'EVT-2026-0001'),
  ('csr@techcorp.in',    'EVT-2026-0001'),
  ('ananya@example.org', 'EVT-2026-0002'),
  ('rahul@example.org',  'EVT-2026-0003'),
  ('meera@example.org',  'EVT-2026-0004'),
  ('arjun@example.org',  'EVT-2026-0004'),
  ('dev@example.org',    'EVT-2026-0004'),
  ('meera@example.org',  'EVT-2026-0005'),
  ('lakshmi@example.org','EVT-2026-0005'),
  ('pooja@example.org',  'EVT-2026-0005'),
  ('nikhil@example.org', 'EVT-2026-0006'),
  ('deepa@example.org',  'EVT-2026-0006'),
  ('amit@example.org',   'EVT-2026-0006'),
  ('riya@example.org',   'EVT-2026-0007'),
  ('ananya@example.org', 'EVT-2026-0010'),
  ('ananya@example.org', 'EVT-2026-0012')
) AS m(email, ecode)
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN events e     ON e.code = m.ecode
ON CONFLICT (volunteer_id, event_id) DO NOTHING;

-- EVT-2026-0004 is at capacity (3/3): Lakshmi waits.
INSERT INTO waitlist_entries (volunteer_id, event_id, position)
SELECT v.id, e.id, m.pos
FROM (VALUES
  ('lakshmi@example.org', 'EVT-2026-0004', 1),
  ('karan@example.org',   'EVT-2026-0004', 2)
) AS m(email, ecode, pos)
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN events e     ON e.code = m.ecode
ON CONFLICT (volunteer_id, event_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Attendance dispatch state
-- -----------------------------------------------------------------------------
INSERT INTO attendance_dispatches
  (event_id, volunteer_email_sent, volunteer_email_sent_at, volunteer_send_count,
   coordinator_email_sent, coordinator_email_sent_at, coordinator_send_count)
SELECT e.id, m.vs, m.va::timestamptz, m.vc, m.cs, m.ca::timestamptz, m.cc
FROM (VALUES
  ('EVT-2026-0001', TRUE,  '2026-07-12 09:00+05:30', 1, TRUE,  '2026-07-12 09:00+05:30', 1),
  ('EVT-2026-0002', TRUE,  '2026-07-12 09:00+05:30', 1, TRUE,  '2026-07-12 09:00+05:30', 1),
  ('EVT-2026-0003', TRUE,  '2026-07-12 09:00+05:30', 1, TRUE,  '2026-07-12 09:00+05:30', 1),
  ('EVT-2026-0004', TRUE,  '2026-07-19 09:00+05:30', 1, TRUE,  '2026-07-19 09:00+05:30', 1),
  ('EVT-2026-0005', TRUE,  '2026-07-19 09:00+05:30', 1, FALSE, NULL,                     0),
  ('EVT-2026-0006', TRUE,  '2026-08-02 09:00+05:30', 1, TRUE,  '2026-08-02 09:00+05:30', 1),
  ('EVT-2026-0007', TRUE,  '2026-08-02 09:00+05:30', 1, TRUE,  '2026-08-02 09:00+05:30', 1),
  ('EVT-2026-0012', FALSE, NULL,                     0, FALSE, NULL,                     0)
) AS m(ecode, vs, va, vc, cs, ca, cc)
JOIN events e ON e.code = m.ecode
ON CONFLICT (event_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Attendance records
-- -----------------------------------------------------------------------------
INSERT INTO attendance_records
  (event_id, volunteer_id, attended, arrival_time, departure_time, hours_contributed,
   absence_reason, notes, source, recorded_at)
SELECT e.id, v.id, m.attended, m.arrive::time, m.depart::time, m.hours,
       m.reason::absence_reason, m.notes, m.src::attendance_source, m.rec_at::timestamptz
FROM (VALUES
  ('EVT-2026-0001','rahul@example.org',  TRUE, '09:00','12:00', 3.00, NULL, NULL,                                  'self',        '2026-07-15 18:10+05:30'),
  ('EVT-2026-0001','sunita@example.org', TRUE, '09:15','12:00', 2.75, NULL, 'Arrived slightly late.',              'self',        '2026-07-15 19:00+05:30'),
  ('EVT-2026-0001','csr@techcorp.in',    TRUE, '09:00','12:00', 3.00, NULL, 'TechCorp CSR team lead.',             'self',        '2026-07-15 19:10+05:30'),
  ('EVT-2026-0002','ananya@example.org', TRUE, '09:55','11:55', 2.00, NULL, 'Counselled 14 families.',             'self',        '2026-07-15 18:00+05:30'),
  ('EVT-2026-0003','rahul@example.org',  TRUE, '13:00','17:00', 4.00, NULL, NULL,                                  'coordinator', '2026-07-16 09:00+05:30'),
  ('EVT-2026-0004','meera@example.org',  TRUE, '09:30','11:30', 2.00, NULL, 'Great engagement from participants.', 'self',        '2026-07-22 17:00+05:30'),
  ('EVT-2026-0004','arjun@example.org',  TRUE, '09:30','11:30', 2.00, NULL, NULL,                                  'self',        '2026-07-22 17:05+05:30'),
  ('EVT-2026-0004','dev@example.org',    TRUE, '09:35','11:30', 2.00, NULL, NULL,                                  'self',        '2026-07-22 17:20+05:30'),
  ('EVT-2026-0005','meera@example.org',  TRUE, '11:30','13:30', 2.00, NULL, NULL,                                  'self',        '2026-07-22 18:00+05:30'),
  ('EVT-2026-0005','lakshmi@example.org',FALSE, NULL,   NULL,   NULL, 'Transport issue','Bus strike in the area.',  'self',        '2026-07-22 18:30+05:30'),
  ('EVT-2026-0005','pooja@example.org',  TRUE, '11:40','13:30', 1.83, NULL, NULL,                                  'self',        '2026-07-22 19:00+05:30'),
  ('EVT-2026-0006','nikhil@example.org', TRUE, '10:00','13:00', 3.00, NULL, 'Youth were highly responsive.',       'self',        '2026-08-05 18:00+05:30'),
  ('EVT-2026-0006','deepa@example.org',  TRUE, '10:00','13:00', 3.00, NULL, NULL,                                  'self',        '2026-08-05 18:10+05:30'),
  ('EVT-2026-0006','amit@example.org',   TRUE, '10:10','13:00', 2.83, NULL, NULL,                                  'self',        '2026-08-05 18:20+05:30'),
  ('EVT-2026-0007','riya@example.org',   FALSE, NULL,  NULL,    NULL, 'Personal emergency', NULL,                  'self',        '2026-08-05 20:00+05:30')
) AS m(ecode, email, attended, arrive, depart, hours, reason, notes, src, rec_at)
JOIN events e     ON e.code = m.ecode
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
ON CONFLICT (event_id, volunteer_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Coordinator occurrence reports (source of the beneficiary KPI)
-- -----------------------------------------------------------------------------
INSERT INTO event_reports
  (event_id, coordinator_id, status, actual_start_time, actual_end_time,
   volunteers_present, beneficiaries_reached, highlights, challenges, submitted_at)
SELECT e.id, e.coordinator_id, m.status::event_report_status,
       m.st::time, m.et::time, m.vp, m.br, m.hi, m.ch, m.sub::timestamptz
FROM (VALUES
  ('EVT-2026-0001','completed','09:00','12:00', 3, 180, 'Screened 180 residents; 22 referred for follow-up.',   NULL,                                    '2026-07-15 20:00+05:30'),
  ('EVT-2026-0002','completed','10:00','12:00', 1,  95, 'Nutrition kits distributed to every attending family.','Ran short of printed diet charts.',     '2026-07-15 20:10+05:30'),
  ('EVT-2026-0003','completed','13:15','17:00', 1, 175, 'Certified 40 community first-aid responders.',         'Started 15 minutes late.',              '2026-07-16 09:30+05:30'),
  ('EVT-2026-0004','completed','09:30','11:30', 3, 210, 'All participants completed the hands-on exercise.',    NULL,                                    '2026-07-22 19:00+05:30'),
  ('EVT-2026-0005','partial',  '11:35','13:30', 2, 170, 'Good discussion on phishing and password hygiene.',    'One volunteer absent; pace was tight.', '2026-07-22 19:30+05:30'),
  ('EVT-2026-0006','completed','10:00','13:00', 3, 130, 'Strong mentor-mentee matching outcomes.',              NULL,                                    '2026-08-05 19:00+05:30'),
  ('EVT-2026-0007','partial',  '14:10','16:00', 1,  90, 'Session ran with a single facilitator.',               'Ran out of printed worksheets.',        '2026-08-05 19:30+05:30')
) AS m(ecode, status, st, et, vp, br, hi, ch, sub)
JOIN events e ON e.code = m.ecode
ON CONFLICT (event_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Certificates — PER PROGRAM, hours summed from v_program_participation.
-- -----------------------------------------------------------------------------
INSERT INTO certificates
  (certificate_number, volunteer_id, program_id, hours, events_attended,
   period_start, period_end, cert_type, organization_id, issued)
SELECT
  'PAR-2026-' || lpad((row_number() OVER (ORDER BY p.code, v.last_name))::text, 6, '0'),
  pp.volunteer_id,
  pp.program_id,
  pp.total_hours,
  pp.events_attended,
  pp.first_attended_on,
  pp.last_attended_on,
  CASE WHEN v.category = 'CSR' THEN 'corporate' ELSE 'individual' END::cert_type,
  v.organization_id,
  FALSE
FROM v_program_participation pp
JOIN volunteers v ON v.id = pp.volunteer_id
JOIN programs   p ON p.id = pp.program_id
WHERE pp.events_attended > 0
ON CONFLICT (volunteer_id, program_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Feedback — PER EVENT occurrence
-- -----------------------------------------------------------------------------
INSERT INTO feedback_submissions
  (id, volunteer_id, event_id, overall_rating, nps_score, vol_again,
   went_well, went_wrong_detail, improvement_detail, comments, is_published_testimonial, submitted_at)
SELECT m.fid::uuid, v.id, e.id, m.rating, m.nps, m.again::vol_again_type,
       m.well, m.wrong, m.improve, m.comments, m.publish, m.sub::timestamptz
FROM (VALUES
  ('00000000-0000-0000-0007-000000000001','meera@example.org','EVT-2026-0004',5,9,'Definitely',
   'The co-ordinator was extremely well-prepared and the Zoom setup was flawless. Participants were highly engaged.',
   NULL,
   'A post-event debrief would help volunteers consolidate learnings.',
   'Fantastic experience overall. Proud to be part of this.', TRUE, '2026-07-25 19:00+05:30'),

  ('00000000-0000-0000-0007-000000000002','rahul@example.org','EVT-2026-0001',3,6,'Probably',
   'The venue was well set up and the medical supplies were adequate.',
   'The schedule slipped by over 45 minutes and we were not informed about the delays.',
   'Send a day-before briefing note with the exact schedule to all volunteers.',
   'Good cause but execution needs improvement.', TRUE, '2026-07-18 20:00+05:30'),

  ('00000000-0000-0000-0007-000000000003','nikhil@example.org','EVT-2026-0006',4,8,'Definitely',
   'The youth were engaged and responsive. Peer interactions were energetic.',
   'We ran out of printed worksheets halfway through the study skills session.',
   'Ensure printed materials match the registered headcount, not just confirmed.',
   'Would love to do this again with slightly better resourcing.', TRUE, '2026-08-08 18:00+05:30')
) AS m(fid, email, ecode, rating, nps, again, well, wrong, improve, comments, publish, sub)
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
JOIN events e     ON e.code = m.ecode
ON CONFLICT (volunteer_id, event_id) DO NOTHING;

INSERT INTO feedback_issues (feedback_id, issue_label) VALUES
  ('00000000-0000-0000-0007-000000000002','Poor time management'),
  ('00000000-0000-0000-0007-000000000002','Communication issues'),
  ('00000000-0000-0000-0007-000000000003','Lack of resources')
ON CONFLICT DO NOTHING;

INSERT INTO feedback_improvements (feedback_id, improvement_label) VALUES
  ('00000000-0000-0000-0007-000000000001','More feedback channels'),
  ('00000000-0000-0000-0007-000000000001','Post-event debrief'),
  ('00000000-0000-0000-0007-000000000002','Better time planning'),
  ('00000000-0000-0000-0007-000000000002','Clearer communication'),
  ('00000000-0000-0000-0007-000000000003','Better preparation materials'),
  ('00000000-0000-0000-0007-000000000003','Improved logistics')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Announcements and scheduled reports
-- -----------------------------------------------------------------------------
INSERT INTO announcements (program_id, subject, body_snapshot, recipient_count, sent_by, sent_at)
SELECT p.id,
       '🎉 New Volunteering Opportunity — ' || p.name,
       'Announcement dispatched to all opted-in volunteers.',
       16,
       '00000000-0000-0000-0000-000000000001',
       now() - INTERVAL '30 days'
FROM programs p
WHERE p.code IN ('PRG-2026-001','PRG-2026-002','PRG-2026-003')
  AND NOT EXISTS (SELECT 1 FROM announcements a WHERE a.program_id = p.id);

INSERT INTO scheduled_reports (name, report_type, format, frequency, send_time, recipients, created_by) VALUES
  ('Weekly Volunteer Summary', 'volunteer_summary', 'PDF',   'Weekly',  '08:00', 'admin@parinaam.org',    '00000000-0000-0000-0000-000000000001'),
  ('Monthly Program Report',   'program',           'Excel', 'Monthly', '09:00', 'director@parinaam.org', '00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- Sample mailbox content: a handful of already-delivered messages so the
-- email-log screen and the Mailpit inbox both have something to show.
-- -----------------------------------------------------------------------------
INSERT INTO email_logs
  (program_id, event_id, volunteer_id, recipient_type, recipient_email, template_key,
   subject, body_snapshot, status, n8n_workflow, n8n_execution_id, provider_message_id,
   queued_at, dispatched_at, sent_at)
SELECT a.program_id, e.id, v.id, 'volunteer', u.email, m.tkey, m.subject,
       'Rendered by the API and delivered via the n8n vms-email-dispatch workflow.',
       'sent', 'vms-email-dispatch', 'seed-exec-' || m.n, 'seed-msg-' || m.n,
       m.at::timestamptz, m.at::timestamptz, m.at::timestamptz
FROM (VALUES
  ('EVT-2026-0001','rahul@example.org','attendance_volunteer','Action Required: Mark Your Attendance — Blood Pressure Screening','1','2026-07-12 09:00+05:30'),
  ('EVT-2026-0004','meera@example.org','attendance_volunteer','Action Required: Mark Your Attendance — Basic Computer Skills','2','2026-07-19 09:00+05:30'),
  ('EVT-2026-0006','nikhil@example.org','registration_confirmed','Registration Confirmed — Career Guidance Session','3','2026-07-25 10:05+05:30'),
  ('EVT-2026-0010','ananya@example.org','registration_confirmed','Registration Confirmed — Tree Plantation Drive','4','2026-08-14 10:05+05:30')
) AS m(ecode, email, tkey, subject, n, at)
JOIN events e     ON e.code = m.ecode
JOIN activities a ON a.id = e.activity_id
JOIN users u      ON u.email = m.email
JOIN volunteers v ON v.user_id = u.id
WHERE NOT EXISTS (SELECT 1 FROM email_logs el WHERE el.provider_message_id = 'seed-msg-' || m.n);

-- -----------------------------------------------------------------------------
-- Recompute lifecycle phases from the seeded consent + attempt data
-- -----------------------------------------------------------------------------
SELECT fn_recompute_volunteer_phase(id) FROM volunteers;

DROP FUNCTION IF EXISTS seed_question(TEXT, INTEGER, TEXT, INTEGER, TEXT[]);
