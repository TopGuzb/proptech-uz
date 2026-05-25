/**
 * PropTech UZ — DB Diagnose
 *
 * Считает строки в каждой PM-таблице через service-role (bypass RLS),
 * чтобы понять что реально в базе и какие миграции применены.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const TABLES = [
  "projects",
  "buildings",
  "apartments",
  "user_profiles",
  "residents",
  "vendors",
  "maintenance_requests",
  "maintenance_photos",
  "utility_meters",
  "meter_readings",
  "utility_rates",
  "pm_invoices",
  "communal_assets",
  "polls",
  "poll_votes",
  "pm_assets",       // Sprint 6
  "inventory_items",
] as const;

async function main(): Promise<void> {
  console.log("📊 DB diagnose (service-role, RLS bypassed):\n");

  for (const t of TABLES) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ✗ ${t.padEnd(26)} ERROR: ${error.message}`);
    } else {
      console.log(`  ${(count ?? 0) > 0 ? "✓" : " "} ${t.padEnd(26)} ${count ?? 0} rows`);
    }
  }

  // Check polls schema
  console.log("\n📋 polls columns:");
  const { data: cols, error: cErr } = await sb.rpc("__nope__"); // dummy to suppress
  void cols; void cErr;
  const { data: row } = await sb.from("polls").select("*").limit(1);
  if (row && row.length > 0) console.log("  keys:", Object.keys(row[0]).join(", "));
  else console.log("  (no rows to inspect)");
}

main().catch((e) => { console.error(e); process.exit(1); });
