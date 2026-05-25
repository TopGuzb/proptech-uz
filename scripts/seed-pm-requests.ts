/**
 * PropTech UZ — Maintenance Requests Seed
 *
 * Creates ~10 demo maintenance requests covering all priorities + statuses
 * so the dispatcher dashboard, SLA timer and chessboard have realistic
 * data to display.
 *
 * Run: npx tsx scripts/seed-pm-requests.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Priority = "low" | "medium" | "high" | "emergency";
type Status   = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

const SLA_HOURS: Record<Priority, number> = {
  emergency: 2, high: 4, medium: 24, low: 72,
};

interface Resident { id: string; apartment_id: string; }
interface Apartment { id: string; building_id: string | null; }
interface Vendor { id: string; specializations: string[]; }

interface Template {
  title:       string;
  description: string;
  category:    string;
  priority:    Priority;
  status:      Status;
}

const TEMPLATES: Template[] = [
  {
    title:       "Прорвало трубу в санузле",
    description: "Холодная вода течёт из-под ванны на пол. Закрыли стояк, ждём мастера.",
    category:    "plumbing",
    priority:    "emergency",
    status:      "assigned",
  },
  {
    title:       "Запах газа на кухне",
    description: "С утра почувствовали запах газа возле плиты. Окна открыли, плитой не пользуемся.",
    category:    "structural",
    priority:    "emergency",
    status:      "open",
  },
  {
    title:       "Не работает лифт",
    description: "Лифт остановился между 5 и 6 этажом. В кабине никого, но кнопки не реагируют.",
    category:    "elevator",
    priority:    "high",
    status:      "in_progress",
  },
  {
    title:       "Мерцает свет во всей квартире",
    description: "Лампочки в коридоре и спальне моргают весь вечер. Розетки работают нестабильно.",
    category:    "electrical",
    priority:    "high",
    status:      "assigned",
  },
  {
    title:       "Холодные радиаторы в спальне",
    description: "Батарея на одной стене холодная, на другой тёплая. Воздух в системе?",
    category:    "heating",
    priority:    "high",
    status:      "open",
  },
  {
    title:       "Капает кран на кухне",
    description: "Из-под смесителя постоянно капает. Подложили тряпку, но к концу дня лужа.",
    category:    "plumbing",
    priority:    "medium",
    status:      "open",
  },
  {
    title:       "Не работает розетка в кухне",
    description: "Розетка возле микроволновки перестала работать. Соседние работают.",
    category:    "electrical",
    priority:    "medium",
    status:      "assigned",
  },
  {
    title:       "Не закрывается дверь подъезда",
    description: "Доводчик ослаб, дверь не доводится до конца. Зимой будет дуть.",
    category:    "structural",
    priority:    "medium",
    status:      "in_progress",
  },
  {
    title:       "Перегорела лампочка в подъезде",
    description: "На площадке между 3 и 4 этажами темно вечером.",
    category:    "electrical",
    priority:    "low",
    status:      "completed",
  },
  {
    title:       "Замена воздушного фильтра в холодильнике",
    description: "Прошло уже больше года, появился запах. Нужна плановая замена.",
    category:    "appliance",
    priority:    "low",
    status:      "completed",
  },
];

function pickVendor(vendors: Vendor[], category: string): Vendor | null {
  const exact = vendors.filter((v) => v.specializations.includes(category));
  if (exact.length > 0) return exact[Math.floor(Math.random() * exact.length)];
  return vendors[Math.floor(Math.random() * vendors.length)] ?? null;
}

async function main() {
  console.log("🌱 Seeding maintenance requests…\n");

  const { data: residents } = await supabase
    .from("residents")
    .select("id, apartment_id")
    .eq("is_active", true)
    .limit(20);

  const residentList = (residents as Resident[] | null) ?? [];
  if (residentList.length === 0) {
    console.error("❌ No residents found. Run seed-pm-data.ts first.");
    process.exit(1);
  }

  const aptIds = residentList.map((r) => r.apartment_id);
  const { data: apartments } = await supabase
    .from("apartments")
    .select("id, building_id")
    .in("id", aptIds);
  const aptMap = new Map<string, Apartment>();
  for (const a of (apartments as Apartment[] | null) ?? []) aptMap.set(a.id, a);

  const { data: vendors } = await supabase.from("vendors").select("id, specializations");
  const vendorList = (vendors as Vendor[] | null) ?? [];
  if (vendorList.length === 0) {
    console.error("❌ No vendors found. Run seed-pm-data.ts first.");
    process.exit(1);
  }

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < TEMPLATES.length; i++) {
    const tpl      = TEMPLATES[i];
    const resident = residentList[i % residentList.length];
    const apt      = aptMap.get(resident.apartment_id);
    if (!apt) continue;

    const createdOffsetH =
      tpl.status === "completed" ? 24 + Math.random() * 72 :
      tpl.status === "in_progress" ? 2  + Math.random() * 6  :
      tpl.status === "assigned"    ? 1  + Math.random() * 4  :
                                     Math.random() * 2;
    const createdAt   = new Date(Date.now() - createdOffsetH * 3600 * 1000);
    const slaDeadline = new Date(createdAt.getTime() + SLA_HOURS[tpl.priority] * 3600 * 1000);

    let assignedAt:  string | null = null;
    let startedAt:   string | null = null;
    let completedAt: string | null = null;
    let assignedVendorId: string | null = null;

    if (tpl.status !== "open") {
      const v = pickVendor(vendorList, tpl.category);
      assignedVendorId = v?.id ?? null;
      assignedAt       = new Date(createdAt.getTime() + 30 * 60 * 1000).toISOString();
    }
    if (tpl.status === "in_progress" || tpl.status === "completed") {
      startedAt = new Date(createdAt.getTime() + 90 * 60 * 1000).toISOString();
    }
    if (tpl.status === "completed") {
      completedAt = new Date(createdAt.getTime() + 4 * 3600 * 1000).toISOString();
    }

    rows.push({
      apartment_id:       apt.id,
      building_id:        apt.building_id,
      resident_id:        resident.id,
      category:           tpl.category,
      priority:           tpl.priority,
      status:             tpl.status,
      title:              tpl.title,
      description:        tpl.description,
      assigned_vendor_id: assignedVendorId,
      sla_deadline:       slaDeadline.toISOString(),
      created_at:         createdAt.toISOString(),
      assigned_at:        assignedAt,
      started_at:         startedAt,
      completed_at:       completedAt,
      resolution_notes:   tpl.status === "completed" ? "Выполнено в срок." : null,
      cost_amount:        tpl.status === "completed" ? Math.round(Math.random() * 400 + 100) * 1000 : null,
    });
  }

  const { data: inserted, error } = await supabase
    .from("maintenance_requests")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("❌ Insert failed:", error);
    process.exit(1);
  }

  console.log(`✅ Created ${inserted?.length ?? 0} maintenance requests`);
  console.log("\n🎉 Done!");
}

main().catch((err) => {
  console.error("💥 Seed failed:", err);
  process.exit(1);
});
