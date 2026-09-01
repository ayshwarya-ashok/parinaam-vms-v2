-- =============================================================================
-- V017 — Individual volunteers may carry an organization (client refinement,
-- 2026-09-01).
--
-- New scenario: a person volunteers on their own initiative while representing
-- their employer — Individual category, but affiliated to a company. BR-01
-- therefore relaxes on one side only:
--   • CSR        — organization stays MANDATORY (company-driven volunteering).
--   • Individual — organization becomes OPTIONAL (an affiliation, nothing more).
--
-- The constraint keeps its name so every reference to volunteers_csr_org_chk
-- (docs/01 BR-01, docs/03, docs/06 D-04) still points at the live rule.
-- =============================================================================

ALTER TABLE volunteers DROP CONSTRAINT volunteers_csr_org_chk;

ALTER TABLE volunteers ADD CONSTRAINT volunteers_csr_org_chk CHECK (
  category <> 'CSR' OR organization_id IS NOT NULL
);

COMMENT ON CONSTRAINT volunteers_csr_org_chk ON volunteers IS
  'BR-01 (revised 2026-09-01): CSR volunteers must reference their sponsoring organization; Individuals may optionally reference one as an affiliation.';
