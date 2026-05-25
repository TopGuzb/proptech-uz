// ─────────────────────────────────────────────────────────────────────────────
// lib/types/database.ts
//
// Shared TypeScript types for the Property Management module (Sprint 1).
// These mirror the columns of the new tables created in
// supabase/migrations/20260429000001_pm_foundation.sql.
// Existing CRM types (Project / Apartment / Client) are NOT redefined here.
// ─────────────────────────────────────────────────────────────────────────────

export type ResidentType    = 'owner' | 'tenant' | 'family';
export type PMRole          = 'property_manager' | 'dispatcher' | 'vendor' | 'resident';
export type RequestPriority = 'low' | 'medium' | 'high' | 'emergency';
export type RequestStatus   = 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type RequestCategory =
  | 'plumbing'
  | 'electrical'
  | 'heating'
  | 'cleaning'
  | 'elevator'
  | 'appliance'
  | 'structural'
  | 'other';
export type MeterType =
  | 'electricity'
  | 'gas'
  | 'water_cold'
  | 'water_hot'
  | 'heating';

export interface Resident {
  id: string;
  apartment_id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  telegram_username: string | null;
  telegram_chat_id: string | null;
  resident_type: ResidentType;
  move_in_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  email: string | null;
  telegram_username: string | null;
  specializations: string[];
  rating: number;
  total_jobs: number;
  completed_jobs: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface MaintenanceRequest {
  id: string;
  apartment_id: string;
  building_id: string | null;
  resident_id: string | null;
  category: RequestCategory | null;
  priority: RequestPriority;
  status: RequestStatus;
  title: string;
  description: string;
  ai_category_suggested: string | null;
  ai_priority_suggested: string | null;
  ai_summary: string | null;
  assigned_vendor_id: string | null;
  assigned_dispatcher_id: string | null;
  sla_deadline: string | null;
  resolution_notes: string | null;
  cost_amount: number | null;
  resident_rating: number | null;
  resident_feedback: string | null;
  created_at: string;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface UtilityMeter {
  id: string;
  apartment_id: string;
  meter_type: MeterType;
  serial_number: string | null;
  unit: string;
  installed_date: string | null;
  initial_reading: number;
  is_active: boolean;
}

export interface MeterReading {
  id: string;
  meter_id: string;
  apartment_id: string;
  reading_value: number;
  reading_date: string;
  consumption_diff: number | null;
  cost_amount: number | null;
  source: 'manual' | 'photo_ai' | 'smart_meter';
  photo_url: string | null;
}

export interface PMInvoice {
  id: string;
  apartment_id: string;
  resident_id: string | null;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  pm_fee: number;
  utilities_amount: number;
  maintenance_amount: number;
  total_amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  pdf_url: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface CommunalAsset {
  id: string;
  building_id: string;
  asset_type:
    | 'elevator'
    | 'entrance'
    | 'parking'
    | 'playground'
    | 'common_area'
    | 'roof'
    | 'facade'
    | 'other';
  name: string;
  description: string | null;
  status: 'operational' | 'maintenance' | 'broken' | 'retired';
  last_inspection_date: string | null;
  next_inspection_date: string | null;
  created_at: string;
}

export interface Poll {
  id: string;
  building_id: string | null;
  project_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  options: { id: number; label: string }[];
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  building_id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  min_threshold: number;
  unit_cost: number | null;
  supplier: string | null;
  notes: string | null;
}
