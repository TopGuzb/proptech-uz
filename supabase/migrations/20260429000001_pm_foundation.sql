-- ============================================
-- PROPERTY MANAGEMENT MODULE — FOUNDATION
-- Sprint 1
-- ============================================
-- Adds new tables for the PM module without
-- touching the existing sales hierarchy
-- (companies → projects → buildings → floors →
-- apartments → clients).
-- ============================================

-- 1. Residents (жильцы — отдельно от clients/buyers)
CREATE TABLE IF NOT EXISTS residents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  telegram_username TEXT,
  telegram_chat_id TEXT,
  resident_type TEXT NOT NULL DEFAULT 'owner' CHECK (resident_type IN ('owner', 'tenant', 'family')),
  move_in_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_residents_apartment ON residents(apartment_id);
CREATE INDEX IF NOT EXISTS idx_residents_company   ON residents(company_id);
CREATE INDEX IF NOT EXISTS idx_residents_user      ON residents(user_id);

-- 2. Vendors (подрядчики — электрики, сантехники)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  telegram_username TEXT,
  specializations TEXT[] NOT NULL DEFAULT '{}',
  rating DECIMAL(3,2) DEFAULT 0.0,
  total_jobs INT DEFAULT 0,
  completed_jobs INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_active  ON vendors(is_active);

-- 3. Maintenance Requests
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  building_id  UUID REFERENCES buildings(id) ON DELETE SET NULL,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  resident_id  UUID REFERENCES residents(id) ON DELETE SET NULL,
  category TEXT CHECK (category IN ('plumbing', 'electrical', 'heating', 'cleaning', 'elevator', 'appliance', 'structural', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
  status   TEXT NOT NULL DEFAULT 'open'   CHECK (status   IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  ai_category_suggested TEXT,
  ai_priority_suggested TEXT,
  ai_summary TEXT,
  assigned_vendor_id     UUID REFERENCES vendors(id)    ON DELETE SET NULL,
  assigned_dispatcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sla_deadline TIMESTAMPTZ,
  resolution_notes TEXT,
  cost_amount DECIMAL(10,2),
  resident_rating INT CHECK (resident_rating BETWEEN 1 AND 5),
  resident_feedback TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  assigned_at  TIMESTAMPTZ,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maintenance_apartment ON maintenance_requests(apartment_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_company   ON maintenance_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status    ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority  ON maintenance_requests(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_vendor    ON maintenance_requests(assigned_vendor_id);

-- 4. Maintenance Photos
CREATE TABLE IF NOT EXISTS maintenance_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES maintenance_requests(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_type TEXT NOT NULL DEFAULT 'before' CHECK (photo_type IN ('before', 'during', 'after')),
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_request ON maintenance_photos(request_id);

-- 5. Utility Meters
CREATE TABLE IF NOT EXISTS utility_meters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  meter_type TEXT NOT NULL CHECK (meter_type IN ('electricity', 'gas', 'water_cold', 'water_hot', 'heating')),
  serial_number TEXT,
  unit TEXT NOT NULL DEFAULT 'kWh',
  installed_date DATE,
  initial_reading DECIMAL(12,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meters_apartment ON utility_meters(apartment_id);
CREATE INDEX IF NOT EXISTS idx_meters_type      ON utility_meters(meter_type);

-- 6. Meter Readings
CREATE TABLE IF NOT EXISTS meter_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id     UUID NOT NULL REFERENCES utility_meters(id) ON DELETE CASCADE,
  apartment_id UUID NOT NULL REFERENCES apartments(id)     ON DELETE CASCADE,
  reading_value DECIMAL(12,2) NOT NULL,
  reading_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  consumption_diff DECIMAL(12,2),
  cost_amount      DECIMAL(10,2),
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'photo_ai', 'smart_meter')),
  photo_url TEXT,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_readings_meter ON meter_readings(meter_id);
CREATE INDEX IF NOT EXISTS idx_readings_date  ON meter_readings(reading_date);

-- 7. Utility Rates
CREATE TABLE IF NOT EXISTS utility_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  meter_type TEXT NOT NULL,
  rate_per_unit DECIMAL(10,4) NOT NULL,
  currency TEXT DEFAULT 'UZS',
  effective_from DATE NOT NULL,
  effective_to   DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rates_company ON utility_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_rates_type    ON utility_rates(meter_type);

-- 8. PM Invoices
CREATE TABLE IF NOT EXISTS pm_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  resident_id  UUID REFERENCES residents(id)  ON DELETE SET NULL,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,
  pm_fee             DECIMAL(10,2) DEFAULT 0,
  utilities_amount   DECIMAL(10,2) DEFAULT 0,
  maintenance_amount DECIMAL(10,2) DEFAULT 0,
  total_amount       DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'UZS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  pdf_url TEXT,
  due_date DATE,
  sent_at  TIMESTAMPTZ,
  paid_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_apartment ON pm_invoices(apartment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON pm_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period    ON pm_invoices(billing_period_start);

-- 9. Communal Property
CREATE TABLE IF NOT EXISTS communal_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id)  ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id)  ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('elevator', 'entrance', 'parking', 'playground', 'common_area', 'roof', 'facade', 'other')),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'operational' CHECK (status IN ('operational', 'maintenance', 'broken', 'retired')),
  last_inspection_date DATE,
  next_inspection_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communal_building ON communal_assets(building_id);

-- 10. Polls
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id)  ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL DEFAULT '[]',
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at   TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     UUID NOT NULL REFERENCES polls(id)     ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  selected_option INT NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(poll_id, resident_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_building ON polls(building_id);
CREATE INDEX IF NOT EXISTS idx_votes_poll     ON poll_votes(poll_id);

-- 11. Inventory
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id)          ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT,
  quantity INT NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  min_threshold INT DEFAULT 0,
  unit_cost DECIMAL(10,2),
  supplier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_company ON inventory_items(company_id);

-- 12. Add pm_role column to user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'pm_role'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN pm_role TEXT
      CHECK (pm_role IN ('property_manager', 'dispatcher', 'vendor', 'resident'));
  END IF;
END $$;
