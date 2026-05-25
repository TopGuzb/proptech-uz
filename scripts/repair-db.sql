-- ─────────────────────────────────────────────────────────────────────────────
-- repair-db.sql
--
-- Применить в Supabase → SQL Editor → New query → вставить → Run.
-- Идемпотентно: можно запускать повторно.
-- Что делает:
--   1. Дропает старую таблицу polls (со старой схемой is_active)
--      и пересоздаёт её по Sprint-6 спецификации.
--   2. Применяет Sprint-6 миграцию для pm_assets / poll_votes (IF NOT EXISTS).
--   3. Реаппает RLS-политики для всех PM-таблиц (DROP IF EXISTS + CREATE).
--   4. Заставляет PostgREST перечитать схему.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Drop old polls (старая схема: is_active) ─────────────────────────────
DROP TABLE IF EXISTS poll_votes CASCADE;
DROP TABLE IF EXISTS polls      CASCADE;

-- ── 1. Sprint 6: polls / poll_votes / pm_assets ─────────────────────────────
CREATE TABLE IF NOT EXISTS polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id     UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  options         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','closed','cancelled')),
  quorum_pct      INT  NOT NULL DEFAULT 50
                  CHECK (quorum_pct BETWEEN 0 AND 100),
  closes_at       TIMESTAMPTZ,
  ai_summary      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_polls_building ON polls(building_id);
CREATE INDEX IF NOT EXISTS idx_polls_status   ON polls(status);

CREATE TABLE IF NOT EXISTS poll_votes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id       UUID NOT NULL REFERENCES polls(id)      ON DELETE CASCADE,
  resident_id   UUID NOT NULL REFERENCES residents(id)  ON DELETE CASCADE,
  apartment_id  UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  option_id     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (poll_id, apartment_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll      ON poll_votes(poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_resident  ON poll_votes(resident_id);

CREATE TABLE IF NOT EXISTS pm_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id       UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL
                    CHECK (category IN ('elevator','pump','boiler','hvac','electrical','plumbing','security','other')),
  serial_number     TEXT,
  manufacturer      TEXT,
  installed_at      DATE,
  warranty_until    DATE,
  next_service_at   DATE,
  service_interval_days INT,
  location          TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'operational'
                    CHECK (status IN ('operational','needs_service','broken','retired')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pm_assets_building ON pm_assets(building_id);
CREATE INDEX IF NOT EXISTS idx_pm_assets_category ON pm_assets(category);
CREATE INDEX IF NOT EXISTS idx_pm_assets_status   ON pm_assets(status);

-- ── 2. RLS — permissive для всех PM-таблиц ──────────────────────────────────
ALTER TABLE residents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_meters        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meter_readings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE communal_assets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_votes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_assets             ENABLE ROW LEVEL SECURITY;

-- maintenance_photos / inventory_items могут отсутствовать — оборачиваем
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='maintenance_photos') THEN
    EXECUTE 'ALTER TABLE maintenance_photos ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_items') THEN
    EXECUTE 'ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DROP POLICY IF EXISTS pm_residents_all              ON residents;
DROP POLICY IF EXISTS pm_vendors_all                ON vendors;
DROP POLICY IF EXISTS pm_maintenance_requests_all   ON maintenance_requests;
DROP POLICY IF EXISTS pm_utility_meters_all         ON utility_meters;
DROP POLICY IF EXISTS pm_meter_readings_all         ON meter_readings;
DROP POLICY IF EXISTS pm_utility_rates_all          ON utility_rates;
DROP POLICY IF EXISTS pm_invoices_all               ON pm_invoices;
DROP POLICY IF EXISTS pm_communal_assets_all        ON communal_assets;
DROP POLICY IF EXISTS polls_all                     ON polls;
DROP POLICY IF EXISTS poll_votes_all                ON poll_votes;
DROP POLICY IF EXISTS pm_assets_all                 ON pm_assets;

CREATE POLICY pm_residents_all            ON residents             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_vendors_all              ON vendors               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_maintenance_requests_all ON maintenance_requests  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_utility_meters_all       ON utility_meters        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_meter_readings_all       ON meter_readings        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_utility_rates_all        ON utility_rates         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_invoices_all             ON pm_invoices           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_communal_assets_all      ON communal_assets       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY polls_all                   ON polls                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY poll_votes_all              ON poll_votes            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pm_assets_all               ON pm_assets             FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='maintenance_photos') THEN
    EXECUTE 'DROP POLICY IF EXISTS pm_maintenance_photos_all ON maintenance_photos';
    EXECUTE 'CREATE POLICY pm_maintenance_photos_all ON maintenance_photos FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='inventory_items') THEN
    EXECUTE 'DROP POLICY IF EXISTS pm_inventory_items_all ON inventory_items';
    EXECUTE 'CREATE POLICY pm_inventory_items_all ON inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ── 3. Reload PostgREST schema cache ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
