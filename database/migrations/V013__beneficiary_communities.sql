-- =============================================================================
-- V013 — Beneficiary communities.
--
-- Every session serves at least one beneficiary community (client refinement,
-- 2026-08-24). Communities are admin-managed master data; sessions link
-- many-to-many. The >=1 rule is enforced in the service at publish time — a
-- cross-table CHECK is not expressible — so this migration backfills every
-- existing event to a default community to keep history valid.
-- =============================================================================

CREATE TABLE beneficiary_communities (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  city        VARCHAR(100),
  status      VARCHAR(10)  NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'archived')),
  created_by  UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE beneficiary_communities IS
  'The communities Parinaam serves. Archive, never delete — session links are history.';

CREATE TABLE event_communities (
  event_id     UUID NOT NULL REFERENCES events(id)                  ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES beneficiary_communities(id) ON DELETE RESTRICT,
  PRIMARY KEY (event_id, community_id)
);

CREATE INDEX idx_event_communities_community ON event_communities (community_id);

-- Backfill: a default community so every pre-V013 session satisfies the >=1
-- rule. Deliberately generic; admins can relink sessions afterwards.
INSERT INTO beneficiary_communities (id, name, description, city)
VALUES ('00000000-0000-0000-0009-000000000001',
        'Bengaluru (General)',
        'Default community assigned to sessions created before beneficiary communities existed. Relink sessions to their real communities as they are known.',
        'Bengaluru');

INSERT INTO event_communities (event_id, community_id)
SELECT e.id, '00000000-0000-0000-0009-000000000001' FROM events e;
