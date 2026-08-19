-- =============================================================================
-- V004  Training catalog, materials, quiz, attempts
--       trainings, training_materials, training_questions, training_options,
--       program_trainings, activity_trainings, training_attempts,
--       training_attempt_answers, training_attempt_resets
--
-- Trainings attach at two levels. The gate applied when a volunteer enrolls in
-- an Event is the UNION of its program's trainings and its activity's trainings.
-- =============================================================================

CREATE TABLE trainings (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(20)       UNIQUE,     -- 't1', 'tc1'
  name            VARCHAR(255)      NOT NULL,
  description     TEXT,
  duration        VARCHAR(20)       NOT NULL,
  mode            training_mode     NOT NULL,
  category        training_category NOT NULL,
  status          training_status   NOT NULL DEFAULT 'active',
  passing_score   INTEGER           NOT NULL DEFAULT 70,
  is_mandatory    BOOLEAN           NOT NULL DEFAULT FALSE,
  max_attempts    SMALLINT,
  expiry_months   INTEGER,
  content_version INTEGER           NOT NULL DEFAULT 1,
  created_by      UUID              REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),

  CONSTRAINT trainings_passing_score_chk CHECK (passing_score BETWEEN 1 AND 100),
  CONSTRAINT trainings_max_attempts_chk  CHECK (max_attempts IS NULL OR max_attempts > 0),
  CONSTRAINT trainings_expiry_chk        CHECK (expiry_months IS NULL OR expiry_months > 0),
  -- BR-03
  CONSTRAINT trainings_mandatory_chk CHECK (
    is_mandatory = FALSE OR (max_attempts IS NOT NULL AND expiry_months IS NOT NULL)
  )
);

COMMENT ON COLUMN trainings.content_version IS
  'Bumped when materials change. Lets admins reset assessments taken against older content.';

CREATE INDEX idx_trainings_category  ON trainings (category, status);
CREATE INDEX idx_trainings_mandatory ON trainings (is_mandatory) WHERE is_mandatory = TRUE;

CREATE TRIGGER trg_trainings_updated_at
  BEFORE UPDATE ON trainings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
CREATE TABLE training_materials (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id     UUID               NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  name            VARCHAR(255)       NOT NULL,
  file_type       material_file_type NOT NULL,
  file_path       VARCHAR(500)       NOT NULL,
  mime_type       VARCHAR(120),
  file_size_bytes BIGINT,
  file_size_text  VARCHAR(30),
  pages           INTEGER,
  slides          INTEGER,
  duration_text   VARCHAR(20),
  content_hash    CHAR(64),
  sort_order      INTEGER            NOT NULL DEFAULT 0,
  uploaded_by     UUID               REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_materials_training ON training_materials (training_id, sort_order);

-- -----------------------------------------------------------------------------
CREATE TABLE training_questions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  training_id          UUID        NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  question_text        TEXT        NOT NULL,
  correct_option_index SMALLINT    NOT NULL,
  sort_order           INTEGER     NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_questions_correct_idx_chk CHECK (correct_option_index >= 0)
);

CREATE INDEX idx_training_questions_training ON training_questions (training_id, sort_order);

CREATE TABLE training_options (
  id           UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID     NOT NULL REFERENCES training_questions(id) ON DELETE CASCADE,
  option_index SMALLINT NOT NULL,
  option_text  TEXT     NOT NULL,
  CONSTRAINT training_options_index_chk CHECK (option_index BETWEEN 0 AND 9),
  CONSTRAINT training_options_uq UNIQUE (question_id, option_index)
);

-- -----------------------------------------------------------------------------
-- Junctions. Program-level trainings give context for the whole initiative;
-- activity-level trainings are the role/skill gate.
-- -----------------------------------------------------------------------------
CREATE TABLE program_trainings (
  program_id  UUID NOT NULL REFERENCES programs(id)  ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, training_id)
);

CREATE INDEX idx_program_trainings_training ON program_trainings (training_id);

CREATE TABLE activity_trainings (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  training_id UUID NOT NULL REFERENCES trainings(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, training_id)
);

CREATE INDEX idx_activity_trainings_training ON activity_trainings (training_id);

-- -----------------------------------------------------------------------------
-- training_attempts — append-only. One row per quiz sitting.
-- -----------------------------------------------------------------------------
CREATE TABLE training_attempts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id    UUID         NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  training_id     UUID         NOT NULL REFERENCES trainings(id)  ON DELETE CASCADE,
  attempt_number  SMALLINT     NOT NULL,
  score_percent   NUMERIC(5,2) NOT NULL,
  correct_count   SMALLINT     NOT NULL DEFAULT 0,
  question_count  SMALLINT     NOT NULL DEFAULT 0,
  passed          BOOLEAN      NOT NULL,
  content_version INTEGER      NOT NULL DEFAULT 1,
  attempted_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expiry_date     DATE,
  is_superseded   BOOLEAN      NOT NULL DEFAULT FALSE,

  CONSTRAINT training_attempts_score_chk   CHECK (score_percent BETWEEN 0 AND 100),
  CONSTRAINT training_attempts_attempt_chk CHECK (attempt_number > 0),
  CONSTRAINT training_attempts_uq UNIQUE (volunteer_id, training_id, attempt_number)
);

COMMENT ON COLUMN training_attempts.is_superseded IS
  'TRUE when an admin reset attempts. Retained for audit, ignored by gating rules.';

CREATE INDEX idx_training_attempts_vol   ON training_attempts (volunteer_id, training_id, attempted_at DESC);
CREATE INDEX idx_training_attempts_valid ON training_attempts (training_id, volunteer_id)
  WHERE passed = TRUE AND is_superseded = FALSE;

-- -----------------------------------------------------------------------------
CREATE TABLE training_attempt_answers (
  id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID     NOT NULL REFERENCES training_attempts(id) ON DELETE CASCADE,
  question_id    UUID     NOT NULL REFERENCES training_questions(id) ON DELETE CASCADE,
  selected_index SMALLINT NOT NULL,
  is_correct     BOOLEAN  NOT NULL,
  CONSTRAINT training_attempt_answers_uq UNIQUE (attempt_id, question_id)
);

CREATE TABLE training_attempt_resets (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id                UUID        NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  training_id                 UUID        NOT NULL REFERENCES trainings(id)  ON DELETE CASCADE,
  attempts_cleared            SMALLINT    NOT NULL DEFAULT 0,
  reason                      TEXT,
  triggered_by_content_change BOOLEAN     NOT NULL DEFAULT FALSE,
  reset_by                    UUID        REFERENCES users(id) ON DELETE SET NULL,
  reset_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_training_attempt_resets_vol ON training_attempt_resets (volunteer_id, training_id);
