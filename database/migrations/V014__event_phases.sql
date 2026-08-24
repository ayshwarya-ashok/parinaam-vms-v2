-- =============================================================================
-- V014 — Session phases (client refinement, 2026-08-24).
--
-- A session may be single- or multi-phase. Each phase targets a day or a
-- date range, is owned by Parinaam, a partner (volunteer lead), or both in
-- collaboration, and is marked complete by its owner(s). Completing every
-- phase completes the session; a phase knocked back reverts it. Sessions with
-- NO phase rows keep the existing manual lifecycle untouched.
--
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block and the
-- new value cannot be used in the same transaction that adds it. psql -f runs
-- each statement in its own transaction, so this file is safe under the
-- standard runner; never wrap it in BEGIN/COMMIT.
-- =============================================================================

ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'inprogress' AFTER 'upcoming';

CREATE TYPE phase_status         AS ENUM ('upcoming', 'inprogress', 'completed');
CREATE TYPE phase_responsibility AS ENUM ('parinaam', 'partner', 'collab');

CREATE TABLE event_phases (
  id                        UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  UUID                 NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sort_order                INTEGER              NOT NULL DEFAULT 0,
  name                      VARCHAR(255)         NOT NULL,
  description               TEXT,
  responsibility            phase_responsibility NOT NULL DEFAULT 'parinaam',
  -- A single-day phase has end_date = start_date.
  start_date                DATE                 NOT NULL,
  end_date                  DATE                 NOT NULL,
  -- The named partner lead — the ONLY volunteer who may mark the partner side
  -- (client decision: named assignee, not any enrolled volunteer).
  partner_lead_volunteer_id UUID                 REFERENCES volunteers(id) ON DELETE SET NULL,
  status                    phase_status         NOT NULL DEFAULT 'upcoming',
  -- Completion marks. A collab phase completes only when BOTH are set;
  -- single-owner phases need only their own side.
  parinaam_marked_at        TIMESTAMPTZ,
  parinaam_marked_by        UUID                 REFERENCES users(id)      ON DELETE SET NULL,
  partner_marked_at         TIMESTAMPTZ,
  partner_marked_by         UUID                 REFERENCES volunteers(id) ON DELETE SET NULL,
  -- Admin override: authoritative over the marks, always audited.
  overridden_at             TIMESTAMPTZ,
  overridden_by             UUID                 REFERENCES users(id)      ON DELETE SET NULL,
  override_reason           TEXT,
  created_at                TIMESTAMPTZ          NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ          NOT NULL DEFAULT now(),

  CONSTRAINT event_phases_dates_chk CHECK (end_date >= start_date)
);

CREATE INDEX idx_event_phases_event ON event_phases (event_id, sort_order, start_date);
CREATE INDEX idx_event_phases_partner_lead ON event_phases (partner_lead_volunteer_id)
  WHERE partner_lead_volunteer_id IS NOT NULL;

COMMENT ON TABLE event_phases IS
  'Phases of a session. Zero rows = classic single-day session with the manual "Mark completed" lifecycle.';

-- -----------------------------------------------------------------------------
-- fn_recompute_event_phase_status — the ONLY writer of a phased session''s
-- status. All phases completed -> completed; any phase past upcoming ->
-- inprogress; all back to upcoming -> upcoming. Never touches draft/cancelled
-- sessions or sessions without phases.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recompute_event_phase_status(p_event UUID)
RETURNS event_status AS $$
DECLARE
  v_total     INTEGER;
  v_completed INTEGER;
  v_started   INTEGER;
  v_current   event_status;
  v_new       event_status;
BEGIN
  SELECT status INTO v_current FROM events WHERE id = p_event FOR UPDATE;
  IF v_current IS NULL OR v_current IN ('draft', 'cancelled') THEN
    RETURN v_current;
  END IF;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'completed'),
         COUNT(*) FILTER (WHERE status <> 'upcoming')
  INTO v_total, v_completed, v_started
  FROM event_phases WHERE event_id = p_event;

  IF v_total = 0 THEN
    RETURN v_current;  -- phase-less sessions keep the manual lifecycle
  END IF;

  IF v_completed = v_total THEN
    v_new := 'completed';
  ELSIF v_started > 0 THEN
    v_new := 'inprogress';
  ELSE
    v_new := 'upcoming';
  END IF;

  IF v_new <> v_current THEN
    UPDATE events SET status = v_new, updated_at = now() WHERE id = p_event;
  END IF;
  RETURN v_new;
END;
$$ LANGUAGE plpgsql;
