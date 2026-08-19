-- =============================================================================
-- V006  Field execution: dispatch, attendance, coordinator reports, photos
--       attendance_dispatches, attendance_records, event_reports, event_photos
--
-- All of these hang off an Event (the dated occurrence), because that is the
-- only thing that actually happens on a day.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- attendance_dispatches — per-occurrence state of the two outbound emails.
-- -----------------------------------------------------------------------------
CREATE TABLE attendance_dispatches (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  UUID        NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  volunteer_email_sent      BOOLEAN     NOT NULL DEFAULT FALSE,
  volunteer_email_sent_at   TIMESTAMPTZ,
  volunteer_send_count      SMALLINT    NOT NULL DEFAULT 0,
  coordinator_email_sent    BOOLEAN     NOT NULL DEFAULT FALSE,
  coordinator_email_sent_at TIMESTAMPTZ,
  coordinator_send_count    SMALLINT    NOT NULL DEFAULT 0,
  last_dispatched_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_attendance_dispatches_updated_at
  BEFORE UPDATE ON attendance_dispatches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- attendance_records — one row per volunteer per occurrence.
-- -----------------------------------------------------------------------------
CREATE TABLE attendance_records (
  id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID              NOT NULL REFERENCES events(id)     ON DELETE CASCADE,
  volunteer_id      UUID              NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  attended          BOOLEAN           NOT NULL DEFAULT FALSE,
  arrival_time      TIME,
  departure_time    TIME,
  hours_contributed NUMERIC(4,2),
  absence_reason    absence_reason,
  absence_detail    TEXT,
  notes             TEXT,
  source            attendance_source NOT NULL DEFAULT 'self',
  recorded_by       UUID              REFERENCES users(id) ON DELETE SET NULL,
  recorded_at       TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT attendance_records_uq UNIQUE (event_id, volunteer_id),
  CONSTRAINT attendance_records_hours_chk CHECK (
    hours_contributed IS NULL OR (hours_contributed >= 0 AND hours_contributed <= 24)
  ),
  -- BR-15
  CONSTRAINT attendance_records_absence_chk CHECK (
    (attended = TRUE  AND absence_reason IS NULL) OR
    (attended = FALSE AND (absence_reason IS NOT NULL OR source <> 'self'))
  ),
  CONSTRAINT attendance_records_present_hours_chk CHECK (
    attended = FALSE OR hours_contributed IS NOT NULL
  )
);

COMMENT ON COLUMN attendance_records.hours_contributed IS
  'Derived from arrival/departure when self-reported; may be overridden by an admin.';

CREATE INDEX idx_attendance_event ON attendance_records (event_id, attended);
CREATE INDEX idx_attendance_vol   ON attendance_records (volunteer_id, recorded_at DESC);

CREATE TRIGGER trg_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- event_reports — the field coordinator's occurrence report.
-- Sole origin of the beneficiary count.
-- -----------------------------------------------------------------------------
CREATE TABLE event_reports (
  id                    UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID                NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  coordinator_id        UUID                REFERENCES coordinators(id) ON DELETE SET NULL,
  status                event_report_status NOT NULL,
  actual_start_time     TIME,
  actual_end_time       TIME,
  volunteers_present    INTEGER             NOT NULL DEFAULT 0,
  beneficiaries_reached INTEGER             NOT NULL DEFAULT 0,
  highlights            TEXT,
  challenges            TEXT,
  notes                 TEXT,
  submitted_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  submitted_via_token   UUID                REFERENCES access_tokens(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT event_reports_counts_chk CHECK (
    volunteers_present >= 0 AND beneficiaries_reached >= 0
  )
);

COMMENT ON TABLE event_reports IS
  'Coordinator-submitted proof that the occurrence happened. Feeds the beneficiaries KPI.';

CREATE INDEX idx_event_reports_status ON event_reports (status, submitted_at DESC);

CREATE TRIGGER trg_event_reports_updated_at
  BEFORE UPDATE ON event_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- event_photos — evidence and gallery content.
-- -----------------------------------------------------------------------------
CREATE TABLE event_photos (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id             UUID         NOT NULL REFERENCES events(id)              ON DELETE CASCADE,
  event_report_id      UUID         REFERENCES event_reports(id)                ON DELETE SET NULL,
  attendance_record_id UUID         REFERENCES attendance_records(id)           ON DELETE SET NULL,
  file_path            VARCHAR(500) NOT NULL,
  thumbnail_path       VARCHAR(500),
  mime_type            VARCHAR(120),
  file_size_bytes      BIGINT,
  caption              VARCHAR(255),
  source               photo_source NOT NULL DEFAULT 'admin_upload',
  is_public            BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order           INTEGER      NOT NULL DEFAULT 0,
  uploaded_by          UUID         REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON COLUMN event_photos.is_public IS
  'Only photos explicitly marked public appear in the public Impact page gallery (BR-16).';

CREATE INDEX idx_event_photos_event  ON event_photos (event_id, sort_order);
CREATE INDEX idx_event_photos_public ON event_photos (is_public, uploaded_at DESC)
  WHERE is_public = TRUE;
