-- =============================================================================
-- V002  Identity, authentication and people
--       users, refresh_tokens, access_tokens, organizations, volunteers,
--       coordinators, volunteer_consents, audit_logs
--
-- 2FA is deliberately absent (decision 2026-08-18, open question Q8). Adding it
-- later is a two-column additive migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- users — authentication record for every person who can log in.
-- Coordinators are deliberately NOT users; they act through signed links.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email              CITEXT       NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  role               user_role    NOT NULL,
  is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
  email_verified_at  TIMESTAMPTZ,
  last_login_at      TIMESTAMPTZ,
  failed_login_count SMALLINT     NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT users_email_format_chk CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

COMMENT ON TABLE users IS 'Login credentials and role for all system users.';

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- refresh_tokens — rotating refresh tokens for JWT sessions.
-- -----------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  CHAR(64)    NOT NULL UNIQUE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID        REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  user_agent  VARCHAR(400),
  ip_address  INET
);

CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens (user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens (expires_at);

-- -----------------------------------------------------------------------------
-- access_tokens — single-purpose signed links. This is how coordinators, who
-- have no accounts, submit their event reports.
-- Targets an Event (the dated occurrence), never an Activity or Program.
-- -----------------------------------------------------------------------------
CREATE TABLE access_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     CHAR(64)    NOT NULL UNIQUE,
  purpose        access_token_purpose NOT NULL,
  subject_email  CITEXT,
  volunteer_id   UUID,                    -- FK added below, after volunteers exists
  coordinator_id UUID,
  event_id       UUID,                    -- FK added in V003
  payload        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  expires_at     TIMESTAMPTZ NOT NULL,
  consumed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID        REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE access_tokens IS
  'Hashed one-time / time-boxed link tokens. The raw token is never stored.';

CREATE INDEX idx_access_tokens_purpose ON access_tokens (purpose, expires_at)
  WHERE consumed_at IS NULL;

-- -----------------------------------------------------------------------------
-- organizations — corporate / CSR partners.
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  email          CITEXT,
  phone          VARCHAR(30),
  contact_person VARCHAR(150),
  address        TEXT,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_uq UNIQUE (name)
);

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- volunteers — demographic and lifecycle profile, 1:1 with users.
-- -----------------------------------------------------------------------------
CREATE TABLE volunteers (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name         VARCHAR(100) NOT NULL,
  last_name          VARCHAR(100) NOT NULL,
  gender             gender_type,
  date_of_birth      DATE,
  city               VARCHAR(100),
  state              VARCHAR(100),
  phone              VARCHAR(20),
  category           volunteer_category NOT NULL DEFAULT 'Individual',
  organization_id    UUID         REFERENCES organizations(id) ON DELETE SET NULL,
  phase              volunteer_phase NOT NULL DEFAULT 'Onboarding',
  skills             VARCHAR(255),
  compliance_read    BOOLEAN      NOT NULL DEFAULT FALSE,
  email_opt_in       BOOLEAN      NOT NULL DEFAULT TRUE,
  profile_photo_path VARCHAR(500),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),

  -- BR-01
  CONSTRAINT volunteers_csr_org_chk CHECK (
    (category = 'CSR'        AND organization_id IS NOT NULL) OR
    (category = 'Individual' AND organization_id IS NULL)
  ),
  CONSTRAINT volunteers_dob_chk CHECK (date_of_birth IS NULL OR date_of_birth < CURRENT_DATE)
);

COMMENT ON COLUMN volunteers.phase IS
  'Onboarding -> In Training -> Active. Derived by fn_recompute_volunteer_phase().';

CREATE INDEX idx_volunteers_org   ON volunteers (organization_id);
CREATE INDEX idx_volunteers_phase ON volunteers (phase);
CREATE INDEX idx_volunteers_city  ON volunteers (city);
CREATE INDEX idx_volunteers_name  ON volunteers (lower(first_name), lower(last_name));

CREATE TRIGGER trg_volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE access_tokens
  ADD CONSTRAINT access_tokens_volunteer_fk
  FOREIGN KEY (volunteer_id) REFERENCES volunteers(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- coordinators — field coordinators. Contactable and assignable, never users.
-- -----------------------------------------------------------------------------
CREATE TABLE coordinators (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(150) NOT NULL,
  email      CITEXT       NOT NULL UNIQUE,
  mobile     VARCHAR(20),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_coordinators_updated_at
  BEFORE UPDATE ON coordinators
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE access_tokens
  ADD CONSTRAINT access_tokens_coordinator_fk
  FOREIGN KEY (coordinator_id) REFERENCES coordinators(id) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- volunteer_consents — the POCSO / POSH / NDA declaration. BR-02.
-- -----------------------------------------------------------------------------
CREATE TABLE volunteer_consents (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id    UUID         NOT NULL UNIQUE REFERENCES volunteers(id) ON DELETE CASCADE,
  pocso_agreed    BOOLEAN      NOT NULL DEFAULT FALSE,
  posh_agreed     BOOLEAN      NOT NULL DEFAULT FALSE,
  nda_agreed      BOOLEAN      NOT NULL DEFAULT FALSE,
  signed_name     VARCHAR(200) NOT NULL,
  consent_version VARCHAR(20)  NOT NULL DEFAULT '1.0',
  consent_date    DATE         NOT NULL,
  signed_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ip_address      INET,
  user_agent      VARCHAR(400)
);

COMMENT ON COLUMN volunteer_consents.consent_version IS
  'Policy text version presented at signing time; bumping it forces a re-sign.';

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id          BIGSERIAL   PRIMARY KEY,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  actor_email CITEXT,
  action      VARCHAR(80) NOT NULL,
  entity      VARCHAR(60) NOT NULL,
  entity_id   UUID,
  before_data JSONB,
  after_data  JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor  ON audit_logs (actor_id, created_at DESC);
