-- =============================================================================
-- V023 — the "How would you like to help?" catalogs match the client's forms
-- (Round 37). Two reference-value categories are reshaped:
--
--   AREA_OF_INTEREST → Education & literacy, Health & wellbeing, Livelihoods &
--   skilling, Community outreach, Events & campaigns, Administrative support,
--   Fundraising, Other.
--
--   AVAILABILITY ("How often would you like to volunteer?") → Weekly, Monthly,
--   Quarterly, Occasionally, Other — a SINGLE choice from here on; picking
--   Other reveals a free-text field whose value is stored verbatim in
--   volunteers.availability.
--
-- Codes already stored on volunteers stay resolvable where sensible (education,
-- health, livelihood, fundraising, admin_support are reused with new labels);
-- options with no new counterpart are DEACTIVATED, not deleted — the catalog's
-- rule is that relabelling or retiring an option never rewrites anyone's
-- answers, and an inactive row still resolves for display.
-- =============================================================================

-- Reused codes get the new labels.
UPDATE reference_values SET label = 'Education & literacy',  sort_order = 1 WHERE category = 'AREA_OF_INTEREST' AND code = 'education';
UPDATE reference_values SET label = 'Health & wellbeing',    sort_order = 2 WHERE category = 'AREA_OF_INTEREST' AND code = 'health';
UPDATE reference_values SET label = 'Livelihoods & skilling', sort_order = 3 WHERE category = 'AREA_OF_INTEREST' AND code = 'livelihood';
UPDATE reference_values SET label = 'Administrative support', sort_order = 6 WHERE category = 'AREA_OF_INTEREST' AND code = 'admin_support';
UPDATE reference_values SET label = 'Fundraising',           sort_order = 7 WHERE category = 'AREA_OF_INTEREST' AND code = 'fundraising';

-- New options.
INSERT INTO reference_values (category, code, label, sort_order) VALUES
  ('AREA_OF_INTEREST', 'community_outreach', 'Community outreach',  4),
  ('AREA_OF_INTEREST', 'events_campaigns',   'Events & campaigns',  5),
  ('AREA_OF_INTEREST', 'other',              'Other',               8)
ON CONFLICT (category, code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;

-- Retired options: deactivated so forms stop offering them, but still
-- resolvable on volunteers who picked them.
UPDATE reference_values SET is_active = FALSE
WHERE category = 'AREA_OF_INTEREST'
  AND code IN ('child_welfare', 'women_empower', 'environment', 'elderly_care', 'disaster_relief');

-- AVAILABILITY becomes a frequency question.
UPDATE reference_values SET is_active = FALSE
WHERE category = 'AVAILABILITY'
  AND code IN ('weekday_morning', 'weekday_evening', 'saturday', 'sunday', 'flexible');

INSERT INTO reference_values (category, code, label, sort_order) VALUES
  ('AVAILABILITY', 'weekly',       'Weekly',       1),
  ('AVAILABILITY', 'monthly',      'Monthly',      2),
  ('AVAILABILITY', 'quarterly',    'Quarterly',    3),
  ('AVAILABILITY', 'occasionally', 'Occasionally', 4),
  ('AVAILABILITY', 'other',        'Other',        5)
ON CONFLICT (category, code) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order, is_active = TRUE;
