/**
 * PropTech UZ — Smoke Test
 *
 * Симулирует то, что делает каждый портал на старте:
 *   1. Логинит юзера (anon-клиент, как в браузере).
 *   2. Тянет данные, на которые подписан соответствующий dashboard.
 *   3. Проверяет наличие/отсутствие критичных полей.
 *
 * Не использует service-role — по тому же RLS-каналу, что и реальные клиенты.
 *
 * Запуск:  npx tsx scripts/smoke-test.ts
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!URL || !ANON) {
  console.error("❌ Missing Supabase env vars");
  process.exit(1);
}

interface CheckResult {
  portal: string;
  step:   string;
  ok:     boolean;
  detail: string;
}

const results: CheckResult[] = [];

function record(portal: string, step: string, ok: boolean, detail: string) {
  results.push({ portal, step, ok, detail });
  const tag = ok ? "✓" : "✗";
  console.log(`  ${tag} ${step.padEnd(38)} ${detail}`);
}

async function login(email: string, password: string): Promise<SupabaseClient | null> {
  const sb = createClient(URL, ANON);
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return null;
  }
  return sb;
}

// ─────────────────────────────────────────────────────────────────────────────
async function testPM(): Promise<void> {
  console.log("\n📊 PM Portal — pm@test.uz");
  const sb = await login("pm@test.uz", "demo1234");
  if (!sb) { record("pm", "login", false, "auth failed"); return; }
  record("pm", "login", true, "session created");

  // user_profiles.pm_role
  const { data: u } = await sb.auth.getUser();
  const { data: prof } = await sb
    .from("user_profiles")
    .select("pm_role, role")
    .eq("id", u.user!.id)
    .single();
  record("pm", "profile.pm_role", prof?.pm_role === "property_manager", `pm_role=${prof?.pm_role}`);

  // /pm/dashboard data
  const { data: projs } = await sb.from("projects").select("id, name").order("name");
  record("pm", "projects list", (projs?.length ?? 0) > 0, `${projs?.length ?? 0} projects`);

  const { data: blds } = await sb.from("buildings").select("id, name");
  record("pm", "buildings list", (blds?.length ?? 0) > 0, `${blds?.length ?? 0} buildings`);

  const { data: apts } = await sb.from("apartments").select("id").limit(1);
  record("pm", "apartments query", apts !== null, `${apts?.length ?? 0} sample`);

  // Each tab's main table
  const tables = [
    ["pm/residents",      "residents"],
    ["pm/requests",       "maintenance_requests"],
    ["pm/vendors",        "vendors"],
    ["pm/meters",         "utility_meters"],
    ["pm/invoices",       "pm_invoices"],
    ["pm/polls",          "polls"],
    ["pm/inventory",      "pm_assets"],
    ["pm/communal",       "communal_assets"],
  ] as const;

  for (const [label, tbl] of tables) {
    const { data, error } = await sb.from(tbl).select("id").limit(1);
    record("pm", label, !error, error ? `error: ${error.message}` : `ok (${data?.length ?? 0})`);
  }

  await sb.auth.signOut();
}

// ─────────────────────────────────────────────────────────────────────────────
async function testDispatcher(): Promise<void> {
  console.log("\n📡 Dispatcher Portal — disp@test.uz");
  const sb = await login("disp@test.uz", "demo1234");
  if (!sb) { record("disp", "login", false, "auth failed"); return; }
  record("disp", "login", true, "session created");

  const { data: u } = await sb.auth.getUser();
  const { data: prof } = await sb.from("user_profiles").select("pm_role").eq("id", u.user!.id).single();
  record("disp", "profile.pm_role", prof?.pm_role === "dispatcher", `pm_role=${prof?.pm_role}`);

  // RequestsDashboard pulls from /api/pm/maintenance-requests — but
  // direct table read also needs to work for at-a-glance rendering.
  const { data: reqs, error } = await sb
    .from("maintenance_requests")
    .select("id, status, priority, title")
    .limit(20);
  record("disp", "requests query", !error, error ? `error: ${error.message}` : `${reqs?.length ?? 0} items`);

  await sb.auth.signOut();
}

// ─────────────────────────────────────────────────────────────────────────────
async function testVendor(): Promise<void> {
  console.log("\n🔧 Vendor Portal — vendor@test.uz");
  const sb = await login("vendor@test.uz", "demo1234");
  if (!sb) { record("vendor", "login", false, "auth failed"); return; }
  record("vendor", "login", true, "session created");

  const { data: u } = await sb.auth.getUser();
  const { data: prof } = await sb.from("user_profiles").select("pm_role").eq("id", u.user!.id).single();
  record("vendor", "profile.pm_role", prof?.pm_role === "vendor", `pm_role=${prof?.pm_role}`);

  // Vendor portal looks up vendors WHERE user_id = current user
  const { data: vRows, error: vErr } = await sb
    .from("vendors")
    .select("id, name, specializations")
    .eq("user_id", u.user!.id)
    .limit(1);
  if (vErr) record("vendor", "self vendor lookup", false, `error: ${vErr.message}`);
  else      record("vendor", "self vendor lookup", (vRows?.length ?? 0) > 0, vRows?.[0]?.name ?? "no link");

  // The portal also lists active vendors for the picker
  const { data: vs, error: vsErr } = await sb.from("vendors").select("id, name").eq("is_active", true);
  record("vendor", "vendors list", !vsErr, vsErr ? `error: ${vsErr.message}` : `${vs?.length ?? 0} vendors`);

  await sb.auth.signOut();
}

// ─────────────────────────────────────────────────────────────────────────────
async function testResident(): Promise<void> {
  console.log("\n🏠 Resident Portal — resident@test.uz");
  const sb = await login("resident@test.uz", "demo1234");
  if (!sb) { record("resident", "login", false, "auth failed"); return; }
  record("resident", "login", true, "session created");

  const { data: u } = await sb.auth.getUser();
  const { data: prof } = await sb.from("user_profiles").select("pm_role").eq("id", u.user!.id).single();
  record("resident", "profile.pm_role", prof?.pm_role === "resident", `pm_role=${prof?.pm_role}`);

  // The resident dashboard runs this exact query
  const { data: r, error: rErr } = await sb
    .from("residents")
    .select("full_name, move_in_date, apartment_id, apartment:apartments (number, size_m2, floor, building:buildings (name, project:projects (name)))")
    .eq("user_id", u.user!.id)
    .maybeSingle();
  if (rErr)       record("resident", "self profile", false, `error: ${rErr.message}`);
  else if (!r)    record("resident", "self profile", false, "no resident row linked");
  else            record("resident", "self profile", true, `${r.full_name} · apt ${r.apartment_id?.slice(0, 8)}…`);

  if (r?.apartment_id) {
    const { data: reqs, error: reqErr } = await sb
      .from("maintenance_requests")
      .select("id")
      .eq("apartment_id", r.apartment_id);
    record("resident", "own requests", !reqErr, reqErr ? `error: ${reqErr.message}` : `${reqs?.length ?? 0} items`);

    const { data: invs, error: invErr } = await sb
      .from("pm_invoices")
      .select("id, total_amount, status")
      .eq("apartment_id", r.apartment_id);
    record("resident", "own invoices", !invErr, invErr ? `error: ${invErr.message}` : `${invs?.length ?? 0} items`);

    const { data: meters, error: mErr } = await sb
      .from("utility_meters")
      .select("id, meter_type")
      .eq("apartment_id", r.apartment_id);
    record("resident", "own meters", !mErr, mErr ? `error: ${mErr.message}` : `${meters?.length ?? 0} meters`);
  }

  // Polls visible to resident
  const { data: polls, error: pErr } = await sb.from("polls").select("id, title, status").limit(5);
  record("resident", "polls visibility", !pErr, pErr ? `error: ${pErr.message}` : `${polls?.length ?? 0} polls`);

  await sb.auth.signOut();
}

async function main(): Promise<void> {
  console.log("🔍 Smoke test starting...");
  await testPM();
  await testDispatcher();
  await testVendor();
  await testResident();

  const failed = results.filter((r) => !r.ok);
  console.log("\n────────────────────────────────────────────");
  console.log(`Total: ${results.length}, ✓ ${results.length - failed.length}, ✗ ${failed.length}`);
  if (failed.length > 0) {
    console.log("\n❌ Failures:");
    for (const f of failed) {
      console.log(`  [${f.portal}] ${f.step}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("\n✅ Все проверки прошли.");
}

main().catch((e: unknown) => {
  console.error("❌ Smoke test crashed:", e);
  process.exit(1);
});
