-- ============================================
-- RLS POLICIES для всех PM таблиц
-- ============================================
--
-- Политика максимально проста: любой authenticated пользователь имеет
-- полный доступ. Контроль доступа на уровне UI/middleware (Sprint 1/2):
--   - residents/dispatchers/vendors закрыты в свои /resident, /dispatcher,
--     /vendor portals;
--   - /pm/* открыт только для admin/manager/property_manager.
-- В будущем спринте можно ужесточить (per-resident own-data only) — пока
-- такой permissive вариант разблокирует Sprint 3 без архитектурных правок.
-- ============================================

-- RESIDENTS
ALTER TABLE residents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_residents_all" ON residents;
CREATE POLICY "pm_residents_all" ON residents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- VENDORS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_vendors_all" ON vendors;
CREATE POLICY "pm_vendors_all" ON vendors FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- MAINTENANCE_REQUESTS
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_maintenance_requests_all" ON maintenance_requests;
CREATE POLICY "pm_maintenance_requests_all" ON maintenance_requests FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- MAINTENANCE_PHOTOS
ALTER TABLE maintenance_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_maintenance_photos_all" ON maintenance_photos;
CREATE POLICY "pm_maintenance_photos_all" ON maintenance_photos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- UTILITY_METERS
ALTER TABLE utility_meters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_utility_meters_all" ON utility_meters;
CREATE POLICY "pm_utility_meters_all" ON utility_meters FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- METER_READINGS
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_meter_readings_all" ON meter_readings;
CREATE POLICY "pm_meter_readings_all" ON meter_readings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- UTILITY_RATES
ALTER TABLE utility_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_utility_rates_all" ON utility_rates;
CREATE POLICY "pm_utility_rates_all" ON utility_rates FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- PM_INVOICES
ALTER TABLE pm_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_invoices_all" ON pm_invoices;
CREATE POLICY "pm_invoices_all" ON pm_invoices FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- COMMUNAL_ASSETS
ALTER TABLE communal_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_communal_assets_all" ON communal_assets;
CREATE POLICY "pm_communal_assets_all" ON communal_assets FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- POLLS
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_polls_all" ON polls;
CREATE POLICY "pm_polls_all" ON polls FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- POLL_VOTES
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_poll_votes_all" ON poll_votes;
CREATE POLICY "pm_poll_votes_all" ON poll_votes FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- INVENTORY_ITEMS
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_inventory_items_all" ON inventory_items;
CREATE POLICY "pm_inventory_items_all" ON inventory_items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
