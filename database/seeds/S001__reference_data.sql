-- =============================================================================
-- S001  Reference data — required in EVERY environment, including production.
-- Idempotent: safe to re-run.
-- =============================================================================

INSERT INTO app_settings (key, value, description) VALUES
  ('org.name',                       '"Parinaam Foundation"'::jsonb,  'Display name used in emails and certificates'),
  ('org.email_from',                 '"noreply@parinaam.org"'::jsonb, 'Default From address'),
  ('org.support_email',              '"admin@parinaam.org"'::jsonb,   'Shown to volunteers who exhaust quiz attempts'),
  ('org.public_url',                 '"https://parinaam.org"'::jsonb, 'Base URL used in email links'),
  ('consent.current_version',        '"1.0"'::jsonb,                  'Bumping this forces every volunteer to re-sign'),
  ('compliance.max_attempts',        '3'::jsonb,                      'Attempt cap applied to mandatory trainings'),
  ('compliance.expiry_months',       '12'::jsonb,                     'Validity window for a passing compliance attempt'),
  ('attendance.link_ttl_days',       '7'::jsonb,                      'Lifetime of a signed attendance link'),
  ('attendance.max_evidence_images', '2'::jsonb,                      'Evidence image cap per submission'),
  ('uploads.max_file_mb',            '25'::jsonb,                     'Upload size ceiling for training materials'),
  ('reports.timezone',               '"Asia/Kolkata"'::jsonb,         'Default timezone for scheduled report cron'),
  ('features.enforceTrainingPrerequisites', 'false'::jsonb,           'BR-05 gate. Phase 3 ships false; Phase 4 flips it to true'),
  ('notifications.n8n_workflow',     '"vms-email-dispatch"'::jsonb,   'n8n workflow that owns outbound email delivery'),
  ('notifications.enabled',          'true'::jsonb,                   'Master switch; false queues mail without dispatching')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Feedback multi-select catalog
-- -----------------------------------------------------------------------------
INSERT INTO feedback_option_catalog (kind, label, sort_order) VALUES
  ('issue',       'Communication issues',         1),
  ('issue',       'Unclear instructions',         2),
  ('issue',       'Poor time management',         3),
  ('issue',       'Transport / logistics',        4),
  ('issue',       'Team coordination',            5),
  ('issue',       'Lack of resources',            6),
  ('issue',       'Safety concerns',              7),
  ('issue',       'Inadequate training',          8),
  ('improvement', 'Better preparation materials', 1),
  ('improvement', 'Clearer communication',        2),
  ('improvement', 'Improved logistics',           3),
  ('improvement', 'Additional training',          4),
  ('improvement', 'Better time planning',         5),
  ('improvement', 'Volunteer matching',           6),
  ('improvement', 'More feedback channels',       7),
  ('improvement', 'Post-event debrief',           8)
ON CONFLICT (kind, label) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Mandatory compliance trainings — structural, not demo data.
-- BR-02 / BR-03 / BR-04 all reference these three.
-- -----------------------------------------------------------------------------
INSERT INTO trainings
  (id, code, name, description, duration, mode, category, status,
   passing_score, is_mandatory, max_attempts, expiry_months)
VALUES
  ('00000000-0000-0000-0006-000000000101', 'tc1', 'POCSO Compliance',
   'Protection of Children from Sexual Offences Act — mandatory compliance training covering child protection, mandatory reporting obligations and legal responsibilities.',
   '2h', 'Online', 'compliance', 'active', 80, TRUE, 3, 12),

  ('00000000-0000-0000-0006-000000000102', 'tc2', 'POSH Compliance',
   'Prevention of Sexual Harassment at Workplace — mandatory compliance covering definitions, Internal Complaints Committee (ICC) procedures and volunteer obligations.',
   '2h', 'Online', 'compliance', 'active', 80, TRUE, 3, 12),

  ('00000000-0000-0000-0006-000000000103', 'tc3', 'NDA Compliance',
   'Non-Disclosure Agreement compliance training — what confidential information you are bound to protect, and the obligations that continue after your volunteering ends.',
   '1h', 'Online', 'compliance', 'active', 75, TRUE, 3, 12)
ON CONFLICT (code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helper used by this file and S002. Dropped at the end of S002.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_question(
  p_training_code TEXT,
  p_sort          INTEGER,
  p_text          TEXT,
  p_correct       INTEGER,
  p_options       TEXT[]
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_training_id UUID;
  v_question_id UUID;
  i INTEGER;
BEGIN
  SELECT id INTO v_training_id FROM trainings WHERE code = p_training_code;
  IF v_training_id IS NULL THEN
    RAISE EXCEPTION 'seed_question: unknown training code %', p_training_code;
  END IF;

  SELECT id INTO v_question_id
  FROM training_questions
  WHERE training_id = v_training_id AND sort_order = p_sort;

  IF v_question_id IS NOT NULL THEN
    RETURN v_question_id;
  END IF;

  INSERT INTO training_questions (training_id, question_text, correct_option_index, sort_order)
  VALUES (v_training_id, p_text, p_correct, p_sort)
  RETURNING id INTO v_question_id;

  FOR i IN 1 .. array_length(p_options, 1) LOOP
    INSERT INTO training_options (question_id, option_index, option_text)
    VALUES (v_question_id, i - 1, p_options[i]);
  END LOOP;

  RETURN v_question_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Quiz content for the three mandatory compliance trainings.
-- -----------------------------------------------------------------------------
SELECT seed_question('tc1', 1, 'Who is classified as a ''child'' under the POCSO Act?', 1,
  ARRAY['Person under 16 years','Person under 18 years','Person under 21 years','Person under 14 years']);
SELECT seed_question('tc1', 2, 'Which of the following is NOT covered as a sexual offence under POCSO?', 2,
  ARRAY['Penetrative sexual assault','Sexual harassment of a child','A child accidentally touching another while playing','Sharing pornographic material involving children']);
SELECT seed_question('tc1', 3, 'Mandatory reporting under POCSO requires you to:', 0,
  ARRAY['Report to the police within 24 hours of gaining knowledge of an offence','File a written complaint only at school','Inform only the parents','Consult a lawyer before reporting']);
SELECT seed_question('tc1', 4, 'Failure to report a POCSO offence is:', 1,
  ARRAY['A civil matter only','A punishable offence under the Act','Not an offence if unintentional','Only penalised if the offence is repeated']);
SELECT seed_question('tc1', 5, 'Under POCSO, who bears the burden of proof?', 1,
  ARRAY['The child victim','The accused person','The organisation','The parent or guardian']);

SELECT seed_question('tc2', 1, 'The POSH Act applies to:', 1,
  ARRAY['Only government workplaces','All workplaces in India, including NGOs and volunteer organisations','Only organisations with more than 100 employees','Only manufacturing and IT companies']);
SELECT seed_question('tc2', 2, 'Which of the following constitutes sexual harassment under POSH?', 1,
  ARRAY['Legitimate performance feedback from a supervisor','Unwelcome physical contact or sexual advances','A workplace disagreement about a task','Assigning extra tasks to a team member']);
SELECT seed_question('tc2', 3, 'The Internal Complaints Committee (ICC) must include:', 1,
  ARRAY['Only senior management members','At least 50% women members, including an external expert','Only HR representatives','Only external members from a legal firm']);
SELECT seed_question('tc2', 4, 'A complaint under POSH must be filed within:', 2,
  ARRAY['7 days of the incident','30 days of the incident','90 days (3 months) of the incident','1 year of the incident']);
SELECT seed_question('tc2', 5, 'Confidentiality during a POSH inquiry requires:', 1,
  ARRAY['Sharing the details with all staff for transparency','Strictly keeping all information confidential as per the Act','Publishing findings in the annual report','Sharing details with the accused''s family']);

SELECT seed_question('tc3', 1, 'An NDA (Non-Disclosure Agreement) primarily protects:', 1,
  ARRAY['The volunteer''s salary details','Confidential information shared during the course of volunteering','The volunteer''s personal social media content','The organisation''s brand colour scheme']);
SELECT seed_question('tc3', 2, 'Parinaam''s NDA covers:', 1,
  ARRAY['Beneficiary personal data only','All confidential organisational, volunteer, and beneficiary information','Only published reports and media releases','Only financial statements']);
SELECT seed_question('tc3', 3, 'Your NDA obligation continues:', 1,
  ARRAY['Only during your active volunteering period','For the duration specified in the agreement, even after volunteering ends','Until you delete your Parinaam account','Only if you signed the NDA physically in person']);
SELECT seed_question('tc3', 4, 'Breaching the NDA can result in:', 1,
  ARRAY['A verbal warning only','Legal action and immediate termination of your volunteer role','A written apology to the organisation','No consequences if the breach was unintentional']);

-- -----------------------------------------------------------------------------
-- Registration form vocabulary (V011). Codes are permanent; labels may change.
-- -----------------------------------------------------------------------------
INSERT INTO reference_values (category, code, label, sort_order) VALUES
  ('LANGUAGE',        'en',              'English',                     1),
  ('LANGUAGE',        'hi',              'Hindi',                       2),
  ('LANGUAGE',        'kn',              'Kannada',                     3),
  ('LANGUAGE',        'ta',              'Tamil',                       4),
  ('LANGUAGE',        'te',              'Telugu',                      5),
  ('LANGUAGE',        'mr',              'Marathi',                     6),
  ('LANGUAGE',        'ml',              'Malayalam',                   7),
  ('LANGUAGE',        'bn',              'Bengali',                     8),
  ('AREA_OF_INTEREST','education',       'Teaching & education',        1),
  ('AREA_OF_INTEREST','health',          'Health & wellbeing',          2),
  ('AREA_OF_INTEREST','child_welfare',   'Child welfare',               3),
  ('AREA_OF_INTEREST','women_empower',   'Women empowerment',           4),
  ('AREA_OF_INTEREST','environment',     'Environment & sustainability',5),
  ('AREA_OF_INTEREST','livelihood',      'Livelihood & skills training',6),
  ('AREA_OF_INTEREST','elderly_care',    'Elderly care',                7),
  ('AREA_OF_INTEREST','disaster_relief', 'Disaster relief',             8),
  ('AREA_OF_INTEREST','fundraising',     'Fundraising & events',        9),
  ('AREA_OF_INTEREST','admin_support',   'Administrative support',     10),
  ('AVAILABILITY',    'weekday_morning', 'Weekday mornings',            1),
  ('AVAILABILITY',    'weekday_evening', 'Weekday evenings',            2),
  ('AVAILABILITY',    'saturday',        'Saturdays',                   3),
  ('AVAILABILITY',    'sunday',          'Sundays',                     4),
  ('AVAILABILITY',    'flexible',        'Flexible / on request',       5)
ON CONFLICT (category, code) DO NOTHING;
