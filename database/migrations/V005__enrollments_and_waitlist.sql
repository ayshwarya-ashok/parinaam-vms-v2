-- =============================================================================
-- V005  Enrollment and waitlist
--       event_enrollments, waitlist_entries
--
-- Decision (2026-08-18, open question C): volunteers enroll per Event
-- occurrence. There is no separate program-level registration record —
-- participation in a program is derived from the events a volunteer joined.
--
-- Deviation D-07: waitlist state lives ONLY in waitlist_entries. An enrollment
-- row means a held seat, nothing else.
-- =============================================================================

CREATE TABLE event_enrollments (
  id                     UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id           UUID              NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  event_id               UUID              NOT NULL REFERENCES events(id)     ON DELETE CASCADE,
  status                 enrollment_status NOT NULL DEFAULT 'enrolled',
  skills                 VARCHAR(255),
  promoted_from_waitlist BOOLEAN           NOT NULL DEFAULT FALSE,
  conflict_acknowledged  BOOLEAN           NOT NULL DEFAULT FALSE,
  enrolled_at            TIMESTAMPTZ       NOT NULL DEFAULT now(),
  cancelled_at           TIMESTAMPTZ,
  updated_at             TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT event_enrollments_uq UNIQUE (volunteer_id, event_id),
  CONSTRAINT event_enrollments_cancel_chk CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
    (status = 'enrolled'  AND cancelled_at IS NULL)
  )
);

COMMENT ON TABLE event_enrollments IS
  'A held seat at one dated occurrence. Volunteers waiting for a seat are in '
  'waitlist_entries and have no row here until they are promoted.';
COMMENT ON COLUMN event_enrollments.conflict_acknowledged IS
  'TRUE when the volunteer chose "Enroll Anyway" past a BR-11 overlap warning.';
COMMENT ON COLUMN event_enrollments.skills IS
  'Skills the volunteer brings to this occurrence.';

CREATE INDEX idx_enrollments_event ON event_enrollments (event_id, status);
CREATE INDEX idx_enrollments_vol   ON event_enrollments (volunteer_id, status);

-- Only one live seat per volunteer per event.
CREATE UNIQUE INDEX uq_enrollment_live
  ON event_enrollments (volunteer_id, event_id)
  WHERE status = 'enrolled';

CREATE TRIGGER trg_enrollments_updated_at
  BEFORE UPDATE ON event_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- waitlist_entries — ordered FIFO queue for a full occurrence.
-- -----------------------------------------------------------------------------
CREATE TABLE waitlist_entries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID        NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  event_id     UUID        NOT NULL REFERENCES events(id)     ON DELETE CASCADE,
  position     INTEGER     NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT waitlist_entries_uq      UNIQUE (volunteer_id, event_id),
  CONSTRAINT waitlist_entries_pos_uq  UNIQUE (event_id, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT waitlist_entries_pos_chk CHECK (position >= 1)
);

COMMENT ON TABLE waitlist_entries IS
  'BR-10: 1-based queue. Position 1 is auto-promoted when a seat frees; the '
  'remaining positions shift down inside the same transaction.';

CREATE INDEX idx_waitlist_event ON waitlist_entries (event_id, position);
CREATE INDEX idx_waitlist_vol   ON waitlist_entries (volunteer_id);
