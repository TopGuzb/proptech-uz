/**
 * PropTech UZ — Sprint 6 Seed
 *
 * Naполняет:
 *  • vendors           — 8 подрядчиков с разными специализациями + рейтингами
 *  • polls + votes     — 3 голосования на каждое здание (1 open, 1 closed, 1 cancelled)
 *  • pm_assets         — 6 единиц общего имущества на здание (лифт, насос, котёл и т.д.)
 *
 * Идемпотентен: пропускает то, что уже есть.
 *
 * Запуск: npx tsx scripts/seed-sprint6.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Data ────────────────────────────────────────────────────────────────────

const VENDORS = [
  { name: "Алишер Каримов",      phone: "+998 90 111 22 33", specializations: ["plumbing", "heating"],            rating: 4.8, completed_jobs: 47, telegram_username: "@alisher_plumb" },
  { name: "Шохрух Ибрагимов",    phone: "+998 91 222 33 44", specializations: ["electrical"],                     rating: 4.9, completed_jobs: 62, telegram_username: "@shokh_elec",  email: "shokh@example.uz" },
  { name: "Бригада «Ремонт-Про»", phone: "+998 71 200 44 55", specializations: ["structural", "plumbing"],         rating: 4.5, completed_jobs: 28 },
  { name: "Лифт-Сервис УЗ",      phone: "+998 71 100 50 60", specializations: ["elevator"],                       rating: 4.7, completed_jobs: 19, email: "service@lift.uz" },
  { name: "Дилшод Назаров",      phone: "+998 93 333 44 55", specializations: ["appliance", "electrical"],        rating: 4.2, completed_jobs: 15 },
  { name: "Клининг «Чистый Дом»", phone: "+998 90 444 55 66", specializations: ["cleaning"],                       rating: 4.6, completed_jobs: 88 },
  { name: "Жасур Усманов",       phone: "+998 99 555 66 77", specializations: ["heating", "plumbing"],            rating: 3.9, completed_jobs: 12 },
  { name: "Сервис-Эксперт",      phone: "+998 71 555 11 22", specializations: ["structural", "electrical", "plumbing"], rating: 4.4, completed_jobs: 33 },
];

const ASSETS_PER_BUILDING = (i: number) => [
  { name: `Лифт пассажирский ${i + 1}`, category: "elevator", manufacturer: "Otis",       serial_number: `OT-${1000 + i}`, location: "Подъезд 1",  status: "operational",   offsets: { installed: -730, warranty: 365,  next_service: 30,  interval: 90  } },
  { name: `Лифт грузовой ${i + 1}`,     category: "elevator", manufacturer: "KONE",       serial_number: `KN-${2000 + i}`, location: "Подъезд 2",  status: "needs_service", offsets: { installed: -1100, warranty: 90,   next_service: -7,  interval: 90  } },
  { name: "Насос ГВС",                  category: "pump",     manufacturer: "Grundfos",   serial_number: `GR-${3000 + i}`, location: "Подвал",     status: "operational",   offsets: { installed: -540, warranty: 180,  next_service: 60,  interval: 180 } },
  { name: "Котёл отопительный",         category: "boiler",   manufacturer: "Vaillant",   serial_number: `VL-${4000 + i}`, location: "Котельная",  status: "operational",   offsets: { installed: -360, warranty: 720,  next_service: 120, interval: 365 } },
  { name: "Система видеонаблюдения",    category: "security", manufacturer: "Hikvision",                                  location: "Холл",       status: "operational",   offsets: { installed: -180, warranty: 540 } },
  { name: "Вентиляция подвала",         category: "hvac",     manufacturer: "Systemair",                                  location: "Подвал",     status: "broken",        offsets: { installed: -1825, next_service: -30 } },
];

interface PollSeed {
  title:       string;
  description: string;
  options:     { id: string; label: string }[];
  status:      "open" | "closed" | "cancelled";
  closes_in_days?: number;
  votes_distribution?: Record<string, number>; // option_id → % of apartments
}

const POLLS: PollSeed[] = [
  {
    title: "Установка системы видеонаблюдения у подъездов",
    description: "Согласовать монтаж 4 камер по периметру дома. Стоимость — 12 млн сум, разбита на 6 мес.",
    options: [{ id: "a", label: "За" }, { id: "b", label: "Против" }, { id: "c", label: "Воздержался" }],
    status: "open",
    closes_in_days: 14,
    votes_distribution: { a: 0.45, b: 0.15, c: 0.05 },
  },
  {
    title: "Повышение тарифа на охрану до 80 000 сум/мес",
    description: "Текущий тариф — 60 000 сум. Решение об индексации с января.",
    options: [{ id: "a", label: "За повышение" }, { id: "b", label: "Оставить как есть" }],
    status: "closed",
    votes_distribution: { a: 0.35, b: 0.45 },
  },
  {
    title: "Замена детской площадки",
    description: "Голосование отменено — администрация нашла спонсора.",
    options: [{ id: "a", label: "За" }, { id: "b", label: "Против" }],
    status: "cancelled",
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Sprint 6 seed starting…\n");

  // 1. Vendors — insert if not present
  console.log("👷 Vendors…");
  const { data: existingVendors } = await sb.from("vendors").select("phone");
  const existingPhones = new Set((existingVendors ?? []).map((v) => v.phone));
  let vendorsCreated = 0;
  for (const v of VENDORS) {
    if (existingPhones.has(v.phone)) continue;
    const { error } = await sb.from("vendors").insert({
      name:              v.name,
      phone:             v.phone,
      specializations:   v.specializations,
      rating:            v.rating,
      total_jobs:        v.completed_jobs,
      completed_jobs:    v.completed_jobs,
      telegram_username: (v as { telegram_username?: string }).telegram_username ?? null,
      email:             (v as { email?: string }).email ?? null,
      is_active:         true,
    });
    if (error) console.warn("  ⚠️", v.name, error.message);
    else vendorsCreated++;
  }
  console.log(`  ✓ ${vendorsCreated} новых, ${existingPhones.size} уже было`);

  // 2. Buildings + apartments
  const { data: buildings } = await sb.from("buildings").select("id, name");
  const buildingList = buildings ?? [];
  if (buildingList.length === 0) {
    console.log("⚠️  Зданий нет — пропускаю polls/assets");
    return;
  }

  // 3. Assets per building
  console.log("\n🏗  Assets…");
  let assetsCreated = 0;
  for (let i = 0; i < buildingList.length; i++) {
    const b = buildingList[i];
    const { data: existing } = await sb.from("pm_assets").select("name").eq("building_id", b.id);
    const existingNames = new Set((existing ?? []).map((a) => a.name));

    for (const tpl of ASSETS_PER_BUILDING(i)) {
      if (existingNames.has(tpl.name)) continue;
      const o = tpl.offsets;
      const today = new Date();
      const dateOffset = (days: number) => {
        const d = new Date(today); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
      };
      const insert: Record<string, unknown> = {
        building_id:           b.id,
        name:                  tpl.name,
        category:              tpl.category,
        manufacturer:          tpl.manufacturer ?? null,
        serial_number:         tpl.serial_number ?? null,
        location:              tpl.location ?? null,
        status:                tpl.status,
      };
      if (o.installed     !== undefined) insert.installed_at          = dateOffset(o.installed);
      if (o.warranty      !== undefined) insert.warranty_until        = dateOffset(o.warranty);
      if (o.next_service  !== undefined) insert.next_service_at       = dateOffset(o.next_service);
      if (o.interval      !== undefined) insert.service_interval_days = o.interval;

      const { error } = await sb.from("pm_assets").insert(insert);
      if (error) console.warn("  ⚠️", b.name, tpl.name, error.message);
      else assetsCreated++;
    }
  }
  console.log(`  ✓ ${assetsCreated} новых единиц`);

  // 4. Polls + simulated votes
  console.log("\n🗳  Polls…");
  let pollsCreated = 0;
  let votesCreated = 0;
  for (const b of buildingList) {
    const { data: existing } = await sb.from("polls").select("title").eq("building_id", b.id);
    const existingTitles = new Set((existing ?? []).map((p) => p.title));

    // Apartments + their first active resident (for vote attribution)
    const { data: apts } = await sb.from("apartments").select("id").eq("building_id", b.id);
    const aptIds = (apts ?? []).map((a) => a.id);
    let aptResidentMap = new Map<string, string>();
    if (aptIds.length > 0) {
      const { data: residents } = await sb
        .from("residents")
        .select("id, apartment_id, is_active")
        .in("apartment_id", aptIds)
        .eq("is_active", true);
      for (const r of residents ?? []) {
        if (!aptResidentMap.has(r.apartment_id)) aptResidentMap.set(r.apartment_id, r.id);
      }
    }

    for (const p of POLLS) {
      if (existingTitles.has(p.title)) continue;
      const closesAt = p.closes_in_days != null
        ? new Date(Date.now() + p.closes_in_days * 24 * 3600 * 1000).toISOString()
        : (p.status === "closed" ? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString() : null);

      const { data: poll, error } = await sb.from("polls").insert({
        building_id: b.id,
        title:       p.title,
        description: p.description,
        options:     p.options,
        status:      p.status,
        quorum_pct:  50,
        closes_at:   closesAt,
      }).select().single();

      if (error || !poll) {
        console.warn("  ⚠️", b.name, p.title, error?.message);
        continue;
      }
      pollsCreated++;

      // Synthesize votes for this poll
      if (p.votes_distribution && aptIds.length > 0) {
        const aptsWithResidents = aptIds.filter((id) => aptResidentMap.has(id));
        let cursor = 0;
        for (const [optionId, share] of Object.entries(p.votes_distribution)) {
          const target = Math.floor(aptsWithResidents.length * share);
          for (let i = 0; i < target && cursor < aptsWithResidents.length; i++, cursor++) {
            const aptId = aptsWithResidents[cursor];
            const residentId = aptResidentMap.get(aptId)!;
            const { error: vErr } = await sb.from("poll_votes").insert({
              poll_id:      poll.id,
              resident_id:  residentId,
              apartment_id: aptId,
              option_id:    optionId,
            });
            if (!vErr) votesCreated++;
          }
        }
      }
    }
  }
  console.log(`  ✓ ${pollsCreated} голосований, ${votesCreated} голосов`);

  console.log("\n✅ Sprint 6 seed готов.");
}

main().catch((e) => { console.error(e); process.exit(1); });
