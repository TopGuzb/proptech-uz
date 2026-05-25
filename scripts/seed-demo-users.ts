/**
 * PropTech UZ — Demo Users Seed Script
 *
 * Создаёт 4 демо-аккаунта в Supabase Auth + user_profiles, плюс линкует:
 *   - resident@test.uz  → первый существующий resident (residents.user_id)
 *   - vendor@test.uz    → первый существующий vendor   (vendors.user_id)
 *
 * Идемпотентно — если юзер уже есть, скрипт обновляет profile/линки, а не падает.
 *
 * Демо-аккаунты:
 *   pm@test.uz       / demo1234   → property_manager
 *   disp@test.uz     / demo1234   → dispatcher
 *   vendor@test.uz   / demo1234   → vendor
 *   resident@test.uz / demo1234   → resident
 *
 * Запуск:  npx tsx scripts/seed-demo-users.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type PMRole = "property_manager" | "dispatcher" | "vendor" | "resident";

interface DemoAccount {
  email:    string;
  password: string;
  fullName: string;
  pmRole:   PMRole;
  /** Sales-side role written to user_profiles.role for legacy compatibility. */
  role:     "admin" | "manager" | "viewer";
}

const ACCOUNTS: DemoAccount[] = [
  { email: "pm@test.uz",       password: "demo1234", fullName: "Управляющий ЖК",  pmRole: "property_manager", role: "manager" },
  { email: "disp@test.uz",     password: "demo1234", fullName: "Диспетчер ЖК",    pmRole: "dispatcher",       role: "viewer"  },
  { email: "vendor@test.uz",   password: "demo1234", fullName: "Демо-Подрядчик",  pmRole: "vendor",           role: "viewer"  },
  { email: "resident@test.uz", password: "demo1234", fullName: "Демо-Жилец",      pmRole: "resident",         role: "viewer"  },
];

/** Find an existing auth user by email or return null. */
async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  // listUsers paginates — for demo we scan first page (typically <50 users).
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase());
  return u ? { id: u.id } : null;
}

/** Create or fetch the auth user; returns user id. */
async function ensureAuthUser(acc: DemoAccount): Promise<string> {
  const existing = await findUserByEmail(acc.email);
  if (existing) {
    // Reset password so demo always works even if it was changed.
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password: acc.password,
      email_confirm: true,
      user_metadata: { full_name: acc.fullName, pm_role: acc.pmRole },
    });
    if (updErr) throw updErr;
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: acc.email,
    password: acc.password,
    email_confirm: true,
    user_metadata: { full_name: acc.fullName, pm_role: acc.pmRole },
  });
  if (error) throw error;
  if (!data.user) throw new Error(`Failed to create user ${acc.email}`);
  return data.user.id;
}

/** Upsert into user_profiles with role + pm_role. */
async function upsertProfile(userId: string, acc: DemoAccount): Promise<void> {
  const { error } = await admin
    .from("user_profiles")
    .upsert(
      {
        id:        userId,
        email:     acc.email,
        full_name: acc.fullName,
        role:      acc.role,
        pm_role:   acc.pmRole,
      },
      { onConflict: "id" }
    );
  if (error) throw error;
}

async function main() {
  console.log("🌱 Seeding demo users...\n");

  const results: Record<string, string> = {};
  for (const acc of ACCOUNTS) {
    process.stdout.write(`  • ${acc.email.padEnd(20)} → `);
    const id = await ensureAuthUser(acc);
    await upsertProfile(id, acc);
    results[acc.pmRole] = id;
    console.log(`auth.users.id = ${id}`);
  }

  // ── Link resident@test.uz to an existing resident row ────────────────────
  if (results.resident) {
    const { data: residents } = await admin
      .from("residents")
      .select("id, full_name, apartment_id")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);

    if (residents && residents.length > 0) {
      const r = residents[0];
      const { error } = await admin
        .from("residents")
        .update({ user_id: results.resident, email: "resident@test.uz" })
        .eq("id", r.id);
      if (error) {
        console.warn(`  ⚠️  Could not link resident: ${error.message}`);
      } else {
        console.log(`\n  🏠 Linked resident@test.uz → residents.id ${r.id} (${r.full_name})`);
      }
    } else {
      console.log("\n  ⚠️  No active residents to link. Run seed-pm-data.ts first.");
    }
  }

  // ── Link vendor@test.uz to an existing vendor row ────────────────────────
  if (results.vendor) {
    const { data: vendors } = await admin
      .from("vendors")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);

    if (vendors && vendors.length > 0) {
      const v = vendors[0];
      const { error } = await admin
        .from("vendors")
        .update({ user_id: results.vendor, email: "vendor@test.uz" })
        .eq("id", v.id);
      if (error) {
        console.warn(`  ⚠️  Could not link vendor: ${error.message}`);
      } else {
        console.log(`  🔧 Linked vendor@test.uz   → vendors.id ${v.id} (${v.name})`);
      }
    } else {
      console.log("  ⚠️  No active vendors to link. Run seed-pm-data.ts first.");
    }
  }

  console.log("\n✅ Demo users ready.\n");
  console.log("Login at /pm/login with any of:");
  for (const a of ACCOUNTS) {
    console.log(`  ${a.email.padEnd(22)} ${a.password}   (${a.pmRole})`);
  }
}

main().catch((e: unknown) => {
  console.error("❌ Seed failed:");
  console.error(e);
  process.exit(1);
});
