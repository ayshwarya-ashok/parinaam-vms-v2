-- =============================================================================
-- V007  Recognition and feedback
--
-- Decisions (2026-08-18):
--   Certificates are issued PER PROGRAM. Hours are summed across every
--   occurrence the volunteer attended within that program.
--   Feedback is submitted PER EVENT occurrence, while it is still specific
--   enough for a coordinator to act on.
-- =============================================================================

CREATE TABLE certificates (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_number VARCHAR(30)  UNIQUE,
  volunteer_id       UUID         NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  program_id         UUID         NOT NULL REFERENCES programs(id)   ON DELETE CASCADE,
  hours              NUMERIC(6,2) NOT NULL,
  events_attended    INTEGER      NOT NULL DEFAULT 0,
  period_start       DATE,
  period_end         DATE,
  cert_type          cert_type    NOT NULL DEFAULT 'individual',
  organization_id    UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  issued             BOOLEAN      NOT NULL DEFAULT FALSE,
  issued_at          TIMESTAMPTZ,
  issued_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
  resend_count       SMALLINT     NOT NULL DEFAULT 0,
  file_path          VARCHAR(500),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT certificates_uq        UNIQUE (volunteer_id, program_id),
  CONSTRAINT certificates_hours_chk CHECK (hours >= 0),
  CONSTRAINT certificates_issued_chk CHECK (
    (issued = TRUE  AND issued_at IS NOT NULL) OR
    (issued = FALSE AND issued_at IS NULL)
  )
);

COMMENT ON TABLE certificates IS
  'One certificate per volunteer per program. BR-08: CSR volunteers always '
  'receive cert_type = corporate, naming the sponsoring organization.';
COMMENT ON COLUMN certificates.events_attended IS
  'Snapshot of how many occurrences the hours were summed from, printed on the certificate.';
COMMENT ON COLUMN certificates.period_start IS
  'First and last occurrence dates attended, so a reissue after further '
  'participation is distinguishable from the original.';

CREATE INDEX idx_certificates_program ON certificates (program_id, issued);
CREATE INDEX idx_certificates_vol     ON certificates (volunteer_id, issued);

CREATE TRIGGER trg_certificates_updated_at
  BEFORE UPDATE ON certificates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- feedback_option_catalog — admin-editable multi-select tags.
-- -----------------------------------------------------------------------------
CREATE TABLE feedback_option_catalog (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       VARCHAR(20)  NOT NULL,     -- 'issue' | 'improvement'
  label      VARCHAR(100) NOT NULL,
  sort_order INTEGER      NOT NULL DEFAULT 0,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  CONSTRAINT feedback_option_kind_chk CHECK (kind IN ('issue', 'improvement')),
  CONSTRAINT feedback_option_uq UNIQUE (kind, label)
);

-- -----------------------------------------------------------------------------
-- feedback_submissions — one per volunteer per Event occurrence. BR-09.
-- -----------------------------------------------------------------------------
CREATE TABLE feedback_submissions (
  id                       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id             UUID           NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  event_id                 UUID           NOT NULL REFERENCES events(id)     ON DELETE CASCADE,
  overall_rating           SMALLINT       NOT NULL,
  nps_score                SMALLINT       NOT NULL,
  vol_again                vol_again_type,
  went_well                TEXT,
  went_wrong_detail        TEXT,
  improvement_detail       TEXT,
  comments                 TEXT,
  is_published_testimonial BOOLEAN        NOT NULL DEFAULT FALSE,
  submitted_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT feedback_submissions_uq         UNIQUE (volunteer_id, event_id),
  CONSTRAINT feedback_submissions_rating_chk CHECK (overall_rating BETWEEN 1 AND 5),
  CONSTRAINT feedback_submissions_nps_chk    CHECK (nps_score BETWEEN 0 AND 10)
);

COMMENT ON COLUMN feedback_submissions.is_published_testimonial IS
  'Admin opt-in. Only published submissions may surface on the public Impact page (BR-16).';

CREATE INDEX idx_feedback_event  ON feedback_submissions (event_id, submitted_at DESC);
CREATE INDEX idx_feedback_vol    ON feedback_submissions (volunteer_id);
CREATE INDEX idx_feedback_public ON feedback_submissions (is_published_testimonial)
  WHERE is_published_testimonial = TRUE;

-- -----------------------------------------------------------------------------
CREATE TABLE feedback_issues (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID         NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  issue_label VARCHAR(100) NOT NULL,
  CONSTRAINT feedback_issues_uq UNIQUE (feedback_id, issue_label)
);

CREATE INDEX idx_feedback_issues_label ON feedback_issues (issue_label);

CREATE TABLE feedback_improvements (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id       UUID         NOT NULL REFERENCES feedback_submissions(id) ON DELETE CASCADE,
  improvement_label VARCHAR(100) NOT NULL,
  CONSTRAINT feedback_improvements_uq UNIQUE (feedback_id, improvement_label)
);

CREATE INDEX idx_feedback_improvements_label ON feedback_improvements (improvement_label);
