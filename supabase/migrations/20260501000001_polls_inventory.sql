-- ─────────────────────────────────────────────────────────────────────────────
-- 20260501000001_polls_inventory.sql
--
-- Sprint 6: Polls (ОСС-style voting) + PM asset inventory.
-- Uses building_id directly (no companies dependency).
-- RLS: permissive for authenticated users — matches Sprint 3 baseline.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Polls ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  options         JSONB NOT NULL,                -- [{ "id": "a", "label": "За" }, ...]
  status          TEXT NOT NULL DEFAULT 'open'   -- open | closed | cancelled
                  CHECK (status IN ('open','closed','cancelled')),
  quorum_pct      INT  NOT NULL DEFAULT 50       -- % of apartments needed
                  CHECK (quorum_pct BETWEEN 0 AND 100),
  closes_at       TIMESTAMPTZ,
  ai_summary      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_polls_building ON polls(building_id);
CREATE INDEX IF NOT EXISTS idx_polls_status   ON polls(status);

-- ── 2. Poll votes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS poll_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       UUID NOT NULL REFERENCES polls(id)      ON DELETE CASCADE,
  resident_id   UUID NOT NULL REFERENCES residents(id)  ON DELETE CASCADE,
  apartment_id  UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  option_id     TEXT NOT NULL,                  -- matches polls.options[].id
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (poll_id, apartment_id)                -- одна квартира — один голос
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll      ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_resident  ON poll_votes(resident_id);

-- ── 3. PM assets (общее имущество / инвентарь) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pm_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id       UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL                          -- elevator | pump | boiler | hvac | electrical | plumbing | other
                    CHECK (category IN ('elevator','pump','boiler','hvac','electrical','plumbing','security','other')),
  serial_number     TEXT,
  manufacturer      TEXT,
  installed_at      DATE,
  warranty_until    DATE,
  next_service_at   DATE,
  service_interval_days INT,
  location          TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'operational'    -- operational | needs_service | broken | retired
                    CHECK (status IN ('operational','needs_service','broken','retired')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pm_assets_building ON pm_assets(building_id);
CREATE INDEX IF NOT EXISTS idx_pm_assets_category ON pm_assets(category);
CREATE INDEX IF NOT EXISTS idx_pm_assets_status   ON pm_assets(status);

-- ── 4. RLS — permissive for authenticated, mirrors Sprint 3 baseline ───────
ALTER TABLE polls       ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_assets   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS polls_all       ON polls;
DROP POLICY IF EXISTS poll_votes_all  ON poll_votes;
DROP POLICY IF EXISTS pm_assets_all   ON pm_assets;

CREATE POLICY polls_all
  ON polls FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY poll_votes_all
  ON poll_votes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_assets_all
  ON pm_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
