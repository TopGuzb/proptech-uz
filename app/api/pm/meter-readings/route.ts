// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/meter-readings/route.ts
//
//  POST /api/pm/meter-readings
//    body: { apartment_id, meter_type, reading_value, unit?, photo_url?,
//            source?: 'manual'|'photo_ai'|'smart_meter' }
//    Auto-creates a utility_meters row if none exists for this apartment+type.
//    Computes consumption_diff vs the previous reading and cost via tariffs.
//
//  GET  /api/pm/meter-readings?apartment_id=…
//    Returns last 12 months of readings grouped by meter, joined with meter
//    metadata for charts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { UZ_TARIFFS, costFor, type MeterType } from "@/lib/pm/tariffs";

export const runtime = "nodejs";

const VALID_TYPES: MeterType[] = ["electricity","gas","water_cold","water_hot","heating"];
const VALID_SOURCES = ["manual","photo_ai","smart_meter"] as const;
type Source = typeof VALID_SOURCES[number];

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface CreateBody {
  apartment_id:  string;
  meter_type:    MeterType;
  reading_value: number;
  unit?:         string;
  photo_url?:    string;
  reading_date?: string;
  source?:       Source;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;

  if (!body || !body.apartment_id || !VALID_TYPES.includes(body.meter_type) ||
      typeof body.reading_value !== "number" || body.reading_value < 0) {
    return NextResponse.json(
      { error: "apartment_id, meter_type и reading_value обязательны" },
      { status: 400 },
    );
  }

  const sb = admin();

  // 1. Find or create the meter for this apartment+type
  let { data: meter } = await sb
    .from("utility_meters")
    .select("id, unit, initial_reading")
    .eq("apartment_id", body.apartment_id)
    .eq("meter_type",   body.meter_type)
    .eq("is_active",    true)
    .maybeSingle();

  if (!meter) {
    const tariff = UZ_TARIFFS[body.meter_type];
    const { data: created, error: createErr } = await sb
      .from("utility_meters")
      .insert({
        apartment_id:    body.apartment_id,
        meter_type:      body.meter_type,
        unit:            body.unit ?? tariff.unit,
        initial_reading: 0,
        is_active:       true,
      })
      .select("id, unit, initial_reading")
      .single();

    if (createErr) {
      return NextResponse.json(
        { error: `Не удалось создать счётчик: ${createErr.message}` },
        { status: 500 },
      );
    }
    meter = created;
  }

  // 2. Find previous reading (for diff)
  const { data: prev } = await sb
    .from("meter_readings")
    .select("reading_value, reading_date")
    .eq("meter_id", meter.id)
    .order("reading_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevValue = prev?.reading_value ?? meter.initial_reading ?? 0;
  const diff      = Math.max(0, body.reading_value - Number(prevValue));
  const cost      = costFor(body.meter_type, diff);

  // 3. Insert reading
  const source: Source = VALID_SOURCES.includes(body.source as Source)
    ? (body.source as Source)
    : "manual";

  const { data: reading, error: insErr } = await sb
    .from("meter_readings")
    .insert({
      meter_id:         meter.id,
      apartment_id:     body.apartment_id,
      reading_value:    body.reading_value,
      reading_date:     body.reading_date ?? new Date().toISOString().slice(0, 10),
      consumption_diff: diff,
      cost_amount:      cost,
      source,
      photo_url:        body.photo_url ?? null,
    })
    .select()
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ reading, meter, consumption_diff: diff, cost_amount: cost });
}

export async function GET(req: NextRequest) {
  const url         = new URL(req.url);
  const apartmentId = url.searchParams.get("apartment_id");
  const months      = Math.min(Number(url.searchParams.get("months") ?? 12), 36);

  if (!apartmentId) {
    return NextResponse.json({ error: "apartment_id обязателен" }, { status: 400 });
  }

  const sb     = admin();
  const cutoff = new Date(Date.now() - months * 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: meters, error: mErr } = await sb
    .from("utility_meters")
    .select("id, meter_type, unit")
    .eq("apartment_id", apartmentId)
    .eq("is_active", true);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const meterIds = (meters ?? []).map((m: { id: string }) => m.id);
  if (meterIds.length === 0) {
    return NextResponse.json({ meters: [], readings: [] });
  }

  const { data: readings, error: rErr } = await sb
    .from("meter_readings")
    .select("id, meter_id, reading_value, reading_date, consumption_diff, cost_amount, source, photo_url")
    .in("meter_id", meterIds)
    .gte("reading_date", cutoff)
    .order("reading_date", { ascending: true });

  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ meters: meters ?? [], readings: readings ?? [] });
}
