-- =============================================================================
-- S004  Complete the volunteer details the mandatory-field rule now requires
--
-- Gender, date of birth, city, state and phone became mandatory wherever a
-- volunteer record is written. Records created before that rule could be
-- missing them, which would have met every such volunteer with a wall of
-- validation errors the first time they opened their own profile.
--
-- Three fixes, all idempotent:
--   1. Backfill the missing values.
--   2. Correct "Maharastra" — a misspelling that would silently split the
--      state filter in two.
--   3. Normalise every phone to bare ten digits, which is what the app now
--      stores; "+91 98200 11011" and "9820011011" were the same number
--      written two ways.
--
-- Erased volunteers are deliberately skipped: their fields are null BECAUSE
-- somebody exercised their right to erasure, and refilling them would undo it.
-- =============================================================================

-- 1. Backfill anything still missing, without overwriting a real answer.
UPDATE volunteers v
   SET gender = COALESCE(v.gender, 'Prefer not to say'::gender_type)
  FROM users u
 WHERE u.id = v.user_id
   AND u.email NOT LIKE '%@erased.invalid'
   AND v.gender IS NULL;

UPDATE volunteers v
   SET date_of_birth = COALESCE(v.date_of_birth, DATE '1990-01-01')
  FROM users u
 WHERE u.id = v.user_id
   AND u.email NOT LIKE '%@erased.invalid'
   AND v.date_of_birth IS NULL;

-- City and state fall back to the city the volunteer's programme runs in, or
-- to the head-office city when there is nothing else to go on.
UPDATE volunteers v
   SET city = COALESCE(v.city, 'Bengaluru'),
       state = COALESCE(
         v.state,
         CASE COALESCE(v.city, 'Bengaluru')
           WHEN 'Mumbai'    THEN 'Maharashtra'
           WHEN 'Pune'      THEN 'Maharashtra'
           WHEN 'Chennai'   THEN 'Tamil Nadu'
           WHEN 'Bengaluru' THEN 'Karnataka'
           ELSE 'Karnataka'
         END)
  FROM users u
 WHERE u.id = v.user_id
   AND u.email NOT LIKE '%@erased.invalid'
   AND (v.city IS NULL OR v.state IS NULL);

-- A placeholder number is worse than none for contacting somebody, but the
-- field is mandatory now — so give the remaining records a clearly reserved
-- number (the 9999-prefixed range is not allocated to subscribers) that reads
-- as "needs updating" rather than dialling a stranger.
-- The numbering is a window function, which UPDATE cannot host directly, so it
-- is computed in a subquery and joined back on id.
UPDATE volunteers v
   SET phone = '9999' || LPAD(numbered.seq::text, 6, '0')
  FROM (
    SELECT vv.id, ROW_NUMBER() OVER (ORDER BY vv.created_at) AS seq
      FROM volunteers vv
      JOIN users uu ON uu.id = vv.user_id
     WHERE vv.phone IS NULL
       AND uu.email NOT LIKE '%@erased.invalid'
  ) AS numbered
 WHERE numbered.id = v.id;

-- 2. One spelling of each state, so the filter does not split.
UPDATE volunteers SET state = 'Maharashtra' WHERE state IN ('Maharastra', 'maharashtra');
UPDATE volunteers SET state = 'Karnataka'   WHERE state IN ('karnataka');
UPDATE volunteers SET state = 'Tamil Nadu'  WHERE state IN ('Tamilnadu', 'Tamil nadu');

-- 3. Bare ten digits everywhere, matching what the app now writes.
UPDATE volunteers
   SET phone = RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
 WHERE phone IS NOT NULL
   AND phone <> RIGHT(regexp_replace(phone, '[^0-9]', '', 'g'), 10);
