-- =============================================================================
-- V003  Program -> Activity -> Event
--
--   Program   long-running initiative.  NOT date bound.  Can be discontinued.
--   Activity  repeatable unit of work inside a Program.  NOT date bound.
--             Can be discontinued independently of its Program.
--   Event     one dated, timed occurrence of an Activity.  Volunteers enroll
--             here; capacity, coordinator, location and attendance all live here.
--
-- One Activity may have many Events, which is what makes a recurring activity
-- ("Blood Pressure Screening", run monthly) expressible.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- programs
-- -----------------------------------------------------------------------------
CREATE TABLE programs (
  id                     UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(20)    UNIQUE,          -- 'PRG-2026-001'
  name                   VARCHAR(255)   NOT NULL,
  description            TEXT,
  status                 program_status NOT NULL DEFAULT 'draft',
  default_coordinator_id UUID           REFERENCES coordinators(id) ON DELETE SET NULL,
  discontinued_at        TIMESTAMPTZ,
  discontinued_by        UUID           REFERENCES users(id) ON DELETE SET NULL,
  discontinue_reason     TEXT,
  created_by             UUID           REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT programs_discontinued_chk CHECK (
    (status = 'discontinued' AND discontinued_at IS NOT NULL) OR
    (status <> 'discontinued' AND discontinued_at IS NULL)
  )
);

COMMENT ON TABLE programs IS
  'A long-running initiative. Has no dates. Discontinuing a program blocks new '
  'enrollment on every event beneath it without deleting any history.';
COMMENT ON COLUMN programs.default_coordinator_id IS
  'Optional default proposed when scheduling a new event under this program.';

CREATE INDEX idx_programs_status ON programs (status);

CREATE TRIGGER trg_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- activities — the definition of a repeatable piece of work. No dates.
-- -----------------------------------------------------------------------------
CREATE TABLE activities (
  id                     UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  code                   VARCHAR(20)     UNIQUE,        -- 'ACT-001'
  program_id             UUID            NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  name                   VARCHAR(255)    NOT NULL,
  description            TEXT,
  type                   activity_type   NOT NULL DEFAULT 'In person',
  outcome                TEXT,
  skill_required         VARCHAR(255),
  default_duration_hours NUMERIC(4,2),
  default_max_slots      INTEGER,
  default_location       VARCHAR(255),
  status                 activity_status NOT NULL DEFAULT 'active',
  sort_order             INTEGER         NOT NULL DEFAULT 0,
  discontinued_at        TIMESTAMPTZ,
  discontinued_by        UUID            REFERENCES users(id) ON DELETE SET NULL,
  discontinue_reason     TEXT,
  created_by             UUID            REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT activities_duration_chk CHECK (
    default_duration_hours IS NULL OR (default_duration_hours > 0 AND default_duration_hours <= 24)
  ),
  CONSTRAINT activities_slots_chk CHECK (default_max_slots IS NULL OR default_max_slots > 0),
  CONSTRAINT activities_discontinued_chk CHECK (
    (status = 'discontinued' AND discontinued_at IS NOT NULL) OR
    (status <> 'discontinued' AND discontinued_at IS NULL)
  )
);

COMMENT ON TABLE activities IS
  'A repeatable unit of work inside a program. Has no dates of its own; each '
  'scheduled occurrence is a row in events.';
COMMENT ON COLUMN activities.default_duration_hours IS
  'Seed value copied into a new event. The event value is authoritative once set.';

CREATE INDEX idx_activities_program ON activities (program_id, sort_order);
CREATE INDEX idx_activities_status  ON activities (status);

CREATE TRIGGER trg_activities_updated_at
  BEFORE UPDATE ON activities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- events — one dated, timed occurrence. This is the enrollable unit.
-- -----------------------------------------------------------------------------
CREATE TABLE events (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code           VARCHAR(20)  UNIQUE,                -- 'EVT-2026-0001'
  activity_id    UUID         NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name           VARCHAR(255),                       -- NULL => inherit the activity name
  date           DATE         NOT NULL,
  start_time     TIME         NOT NULL,
  duration_hours NUMERIC(4,2) NOT NULL,
  location       VARCHAR(255),
  city           VARCHAR(100),
  max_slots      INTEGER      NOT NULL DEFAULT 10,
  coordinator_id UUID         NOT NULL REFERENCES coordinators(id) ON DELETE RESTRICT,
  status         event_status NOT NULL DEFAULT 'draft',
  cancelled_at   TIMESTAMPTZ,
  cancelled_by   UUID         REFERENCES users(id) ON DELETE SET NULL,
  cancel_reason  TEXT,
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT events_slots_chk    CHECK (max_slots > 0),
  CONSTRAINT events_duration_chk CHECK (duration_hours > 0 AND duration_hours <= 24),
  CONSTRAINT events_cancel_chk   CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
    (status <> 'cancelled' AND cancelled_at IS NULL)
  )
);

COMMENT ON TABLE events IS
  'A single dated occurrence of an activity. BR-06: spots_left is never stored — '
  'see v_event_capacity.';
COMMENT ON COLUMN events.name IS
  'Optional override, e.g. "August Session". NULL means display the activity name.';

CREATE INDEX idx_events_activity    ON events (activity_id, date);
CREATE INDEX idx_events_date        ON events (date, start_time);
CREATE INDEX idx_events_status_date ON events (status, date);
CREATE INDEX idx_events_coordinator ON events (coordinator_id);
CREATE INDEX idx_events_city        ON events (city);

CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE access_tokens
  ADD CONSTRAINT access_tokens_event_fk
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- Generated [start, end) range. Backs BR-11 scheduling-conflict detection.
ALTER TABLE events
  ADD COLUMN time_range TSRANGE
  GENERATED ALWAYS AS (
    tsrange(
      (date + start_time)::timestamp,
      (date + start_time)::timestamp + make_interval(mins => (duration_hours * 60)::int),
      '[)'
    )
  ) STORED;

CREATE INDEX idx_events_time_range ON events USING gist (time_range);

-- -----------------------------------------------------------------------------
-- announcements — a broadcast about a program, optionally about one occurrence.
-- -----------------------------------------------------------------------------
CREATE TABLE announcements (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id      UUID         NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  event_id        UUID         REFERENCES events(id) ON DELETE CASCADE,
  subject         VARCHAR(500) NOT NULL,
  body_snapshot   TEXT         NOT NULL,
  recipient_count INTEGER      NOT NULL DEFAULT 0,
  is_resend       BOOLEAN      NOT NULL DEFAULT FALSE,
  sent_by         UUID         REFERENCES users(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE announcements IS
  'event_id NULL means the broadcast covers the whole program and its upcoming '
  'occurrences; set means it announces one specific occurrence.';

CREATE INDEX idx_announcements_program ON announcements (program_id, sent_at DESC);
CREATE INDEX idx_announcements_event   ON announcements (event_id, sent_at DESC);

-- -----------------------------------------------------------------------------
-- fn_is_event_enrollable — the single definition of "can anyone still join?".
-- Centralises the three-level discontinuation cascade so no caller has to
-- remember to check all of program status, activity status and event status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_event_enrollable(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT e.status = 'upcoming'
        AND a.status = 'active'
        AND p.status = 'active'
        AND e.date >= CURRENT_DATE
     FROM events e
     JOIN activities a ON a.id = e.activity_id
     JOIN programs   p ON p.id = a.program_id
     WHERE e.id = p_event_id),
    FALSE
  );
$$;

COMMENT ON FUNCTION fn_is_event_enrollable IS
  'TRUE only when the event is upcoming and neither its activity nor its program '
  'has been discontinued.';
