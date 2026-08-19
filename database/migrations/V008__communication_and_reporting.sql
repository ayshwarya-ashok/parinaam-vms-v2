-- =============================================================================
-- V008  Communication and reporting
--       email_logs, scheduled_reports, report_runs, app_settings
--
-- Email delivery is orchestrated by n8n. The API renders the message and hands
-- it to an n8n webhook; n8n sends it and calls back with the outcome.
-- email_logs is the transactional outbox that makes that handoff recoverable.
-- =============================================================================

CREATE TABLE email_logs (
  id                  UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id          UUID                 REFERENCES programs(id)     ON DELETE SET NULL,
  activity_id         UUID                 REFERENCES activities(id)   ON DELETE SET NULL,
  event_id            UUID                 REFERENCES events(id)       ON DELETE SET NULL,
  volunteer_id        UUID                 REFERENCES volunteers(id)   ON DELETE SET NULL,
  coordinator_id      UUID                 REFERENCES coordinators(id) ON DELETE SET NULL,
  recipient_type      email_recipient_type NOT NULL,
  recipient_email     CITEXT               NOT NULL,
  template_key        VARCHAR(80)          NOT NULL,
  subject             VARCHAR(500),
  body_snapshot       TEXT,
  status              email_status         NOT NULL DEFAULT 'queued',
  -- n8n handoff
  n8n_workflow        VARCHAR(120),
  n8n_execution_id    VARCHAR(120),
  dispatched_at       TIMESTAMPTZ,
  provider_message_id VARCHAR(255),
  error_message       TEXT,
  attempt_count       SMALLINT             NOT NULL DEFAULT 0,
  queued_at           TIMESTAMPTZ          NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ
);

COMMENT ON TABLE email_logs IS
  'Transactional outbox and audit trail. A row exists before the message is '
  'handed to n8n, so an n8n outage delays delivery but never loses it.';
COMMENT ON COLUMN email_logs.template_key IS
  'Stable template identifier: registration_confirmed, training_required, '
  'event_cancelled, attendance_volunteer, attendance_coordinator, '
  'program_announcement, certificate_issued, scheduled_report, and so on.';
COMMENT ON COLUMN email_logs.n8n_execution_id IS
  'n8n execution id returned by the workflow, for tracing a message into the n8n UI.';

CREATE INDEX idx_email_logs_event     ON email_logs (event_id, sent_at DESC);
CREATE INDEX idx_email_logs_program   ON email_logs (program_id, sent_at DESC);
CREATE INDEX idx_email_logs_recipient ON email_logs (recipient_email, sent_at DESC);
CREATE INDEX idx_email_logs_template  ON email_logs (template_key, queued_at DESC);
-- Sweeps for the retry/dead-letter view.
CREATE INDEX idx_email_logs_pending   ON email_logs (status, queued_at)
  WHERE status IN ('queued', 'dispatched', 'failed');

-- -----------------------------------------------------------------------------
CREATE TABLE scheduled_reports (
  id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255)     NOT NULL,
  report_type VARCHAR(100)     NOT NULL,
  format      report_format    NOT NULL,
  frequency   report_frequency NOT NULL,
  send_time   TIME             NOT NULL,
  timezone    VARCHAR(64)      NOT NULL DEFAULT 'Asia/Kolkata',
  recipients  TEXT             NOT NULL,
  filters     JSONB            NOT NULL DEFAULT '{}'::jsonb,
  is_active   BOOLEAN          NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by  UUID             REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_reports_due ON scheduled_reports (next_run_at)
  WHERE is_active = TRUE;

CREATE TRIGGER trg_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
CREATE TABLE report_runs (
  id                  UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_report_id UUID              REFERENCES scheduled_reports(id) ON DELETE CASCADE,
  report_type         VARCHAR(100)      NOT NULL,
  format              report_format     NOT NULL,
  filters             JSONB             NOT NULL DEFAULT '{}'::jsonb,
  status              report_run_status NOT NULL DEFAULT 'pending',
  row_count           INTEGER,
  file_path           VARCHAR(500),
  error_message       TEXT,
  requested_by        UUID              REFERENCES users(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_runs_schedule ON report_runs (scheduled_report_id, created_at DESC);
CREATE INDEX idx_report_runs_status   ON report_runs (status, created_at DESC);

-- -----------------------------------------------------------------------------
CREATE TABLE app_settings (
  key         VARCHAR(80) PRIMARY KEY,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
