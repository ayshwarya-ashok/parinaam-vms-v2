-- =============================================================================
-- V021 — capture the AGE GROUP, not the date of birth (client observation,
-- 2026-09-15). Applies across the application.
--
-- A birth date is precise PII the system never needed — nothing computes with
-- it beyond "roughly how old". The six buckets carry all the signal with none
-- of the sensitivity. Existing volunteers are bucketed from their stored DOB
-- (as of today) and the DOB column is then DROPPED — keeping a dead PII column
-- would defeat the point of the change. Erased volunteers already had NULL
-- and stay NULL.
--
-- The bucket list is duplicated in the API's AGE_GROUPS constant and the web
-- forms — change all three together.
-- =============================================================================

ALTER TABLE volunteers ADD COLUMN age_group VARCHAR(20);

UPDATE volunteers SET age_group = CASE
  WHEN date_of_birth IS NULL THEN NULL
  WHEN date_part('year', age(date_of_birth)) < 18 THEN 'Under 18'
  WHEN date_part('year', age(date_of_birth)) <= 25 THEN '18-25'
  WHEN date_part('year', age(date_of_birth)) <= 35 THEN '26-35'
  WHEN date_part('year', age(date_of_birth)) <= 45 THEN '36-45'
  WHEN date_part('year', age(date_of_birth)) <= 60 THEN '46-60'
  ELSE '60+'
END;

ALTER TABLE volunteers ADD CONSTRAINT volunteers_age_group_chk CHECK (
  age_group IS NULL OR age_group IN ('Under 18', '18-25', '26-35', '36-45', '46-60', '60+')
);

ALTER TABLE volunteers DROP CONSTRAINT volunteers_dob_chk;
ALTER TABLE volunteers DROP COLUMN date_of_birth;

COMMENT ON COLUMN volunteers.age_group IS
  'The only age signal stored (V021 dropped date_of_birth): Under 18 / 18-25 / 26-35 / 36-45 / 46-60 / 60+.';
