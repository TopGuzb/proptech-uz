// ─────────────────────────────────────────────────────────────────────────────
// lib/pm/tariffs.ts
//
// Default residential utility tariffs for Uzbekistan (UZS per unit).
// Sources: aproximate retail rates as of 2024-2025; demo-only.
// Stored here as code to keep the demo simple — production would read these
// from a `utility_rates` table per building/region.
// ─────────────────────────────────────────────────────────────────────────────

export type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

export interface Tariff {
  meter_type:    MeterType;
  unit:          string;     // human display
  rate_per_unit: number;     // UZS
  label_ru:      string;
}

export const UZ_TARIFFS: Record<MeterType, Tariff> = {
  electricity: { meter_type: "electricity", unit: "кВт·ч", rate_per_unit: 450,  label_ru: "Электричество" },
  gas:         { meter_type: "gas",         unit: "м³",   rate_per_unit: 380,  label_ru: "Газ" },
  water_cold:  { meter_type: "water_cold",  unit: "м³",   rate_per_unit: 4500, label_ru: "Холодная вода" },
  water_hot:   { meter_type: "water_hot",   unit: "м³",   rate_per_unit: 9800, label_ru: "Горячая вода" },
  heating:     { meter_type: "heating",     unit: "Гкал", rate_per_unit: 95000,label_ru: "Отопление" },
};

/** Default monthly PM service fee per m² of apartment area. */
export const PM_FEE_PER_M2: number = 8000; // UZS / m²

/** Compute UZS cost for a given consumption_diff. */
export function costFor(meter: MeterType, units: number): number {
  const t = UZ_TARIFFS[meter];
  if (!t || units <= 0) return 0;
  return Math.round(units * t.rate_per_unit);
}
