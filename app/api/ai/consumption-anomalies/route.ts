// ─────────────────────────────────────────────────────────────────────────────
// app/api/ai/consumption-anomalies/route.ts
//
// GET /api/ai/consumption-anomalies?apartment_id=&building_id=
//
// Computes consumption anomalies across meter_readings:
//   • For each meter, take the last reading and compare to the 6-month avg.
//   • Anomaly = |delta| > 30% of avg, with at least 3 historical readings.
// Then asks Claude to write a short Russian explanation per anomaly so PMs
// see human-readable reasons next to the numbers.
//
// Returns: { anomalies: [{ apartment_id, meter_type, last_value, avg_value,
//                          deviation_pct, direction, ai_explanation }] }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { anthropic, CLAUDE_MODEL, extractText } from "@/lib/ai/claude";

export const runtime = "nodejs";

type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

interface MeterRow {
  id:           string;
  apartment_id: string;
  meter_type:   MeterType;
  unit:         string | null;
  apartment:    { number: string; building_id: string | null } | null;
}

interface ReadingRow {
  meter_id:         string;
  reading_value:    number;
  reading_date:     string;
  consumption_diff: number | null;
}

interface Anomaly {
  apartment_id:    string;
  apartment_label: string;
  meter_type:      MeterType;
  unit:            string;
  last_value:      number;
  last_diff:       number;
  avg_value:       number;
  deviation_pct:   number;
  direction:       "up" | "down";
  reading_date:    string;
  ai_explanation:  string;
}

const ANOMALY_THRESHOLD = 0.30; // 30%

const TYPE_LABEL: Record<MeterType, string> = {
  electricity: "электричество",
  gas:         "газ",
  water_cold:  "холодная вода",
  water_hot:   "горячая вода",
  heating:     "отопление",
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const url         = new URL(req.url);
  const apartmentId = url.searchParams.get("apartment_id");
  const buildingId  = url.searchParams.get("building_id");
  const limit       = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);

  const sb = admin();

  // 1. Pull meters (optionally scoped)
  let metersQ = sb
    .from("utility_meters")
    .select("id, apartment_id, meter_type, unit, apartment:apartments(number, building_id)")
    .eq("is_active", true);

  if (apartmentId) metersQ = metersQ.eq("apartment_id", apartmentId);

  const { data: metersData, error: metersErr } = await metersQ;
  if (metersErr) return NextResponse.json({ error: metersErr.message }, { status: 500 });

  let meters = ((metersData as unknown) as MeterRow[] | null) ?? [];
  if (buildingId) meters = meters.filter((m) => m.apartment?.building_id === buildingId);
  if (meters.length === 0) return NextResponse.json({ anomalies: [] });

  // 2. Pull readings for those meters from last 6 months
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 3600 * 1000).toISOString();
  const meterIds     = meters.map((m) => m.id);

  const { data: readingsData, error: readingsErr } = await sb
    .from("meter_readings")
    .select("meter_id, reading_value, reading_date, consumption_diff")
    .in("meter_id", meterIds)
    .gte("reading_date", sixMonthsAgo)
    .order("reading_date", { ascending: false });

  if (readingsErr) return NextResponse.json({ error: readingsErr.message }, { status: 500 });
  const readings = (readingsData as ReadingRow[] | null) ?? [];

  // 3. Group readings by meter and compute anomalies
  const byMeter = new Map<string, ReadingRow[]>();
  for (const r of readings) {
    const arr = byMeter.get(r.meter_id) ?? [];
    arr.push(r);
    byMeter.set(r.meter_id, arr);
  }

  const candidates: Omit<Anomaly, "ai_explanation">[] = [];
  for (const m of meters) {
    const list = byMeter.get(m.id) ?? [];
    if (list.length < 3) continue;

    const last = list[0];
    const lastDiff = last.consumption_diff;
    if (lastDiff == null) continue;

    const historical = list.slice(1).map((r) => r.consumption_diff).filter((v): v is number => v != null);
    if (historical.length < 2) continue;

    const avg = historical.reduce((s, v) => s + v, 0) / historical.length;
    if (avg <= 0) continue;

    const deviation = (lastDiff - avg) / avg;
    if (Math.abs(deviation) < ANOMALY_THRESHOLD) continue;

    candidates.push({
      apartment_id:    m.apartment_id,
      apartment_label: m.apartment ? `№${m.apartment.number}` : "—",
      meter_type:      m.meter_type,
      unit:            m.unit ?? "",
      last_value:      last.reading_value,
      last_diff:       lastDiff,
      avg_value:       Math.round(avg * 100) / 100,
      deviation_pct:   Math.round(deviation * 1000) / 10, // 1 decimal
      direction:       deviation > 0 ? "up" : "down",
      reading_date:    last.reading_date,
    });
  }

  candidates.sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct));
  const top = candidates.slice(0, limit);

  if (top.length === 0) return NextResponse.json({ anomalies: [] });

  // 4. Ask Claude to explain (single call, batched)
  const prompt = `Ты — аналитик ЖКХ. Получаешь список аномалий потребления по
квартирам (рост или падение относительно 6-месячного среднего). Для каждой
аномалии напиши КРАТКОЕ (1 предложение, до 100 символов) объяснение на
русском, что могло вызвать такое изменение, и предложение что проверить.
Верни СТРОГО JSON-массив строк в том же порядке, без пояснений и markdown.

Аномалии:
${top.map((a, i) =>
  `${i + 1}. Кв.${a.apartment_label}, ${TYPE_LABEL[a.meter_type]}: текущее ${a.last_diff} ${a.unit}, среднее ${a.avg_value} ${a.unit} (${a.direction === "up" ? "+" : ""}${a.deviation_pct}%)`
).join("\n")}`;

  let explanations: string[] = [];
  try {
    const message = await anthropic.messages.create({
      model:      CLAUDE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });
    const raw   = extractText(message);
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (Array.isArray(parsed)) {
        explanations = parsed.map((v) => typeof v === "string" ? v : "");
      }
    }
  } catch {
    // best-effort — fall through with empty explanations
  }

  const anomalies: Anomaly[] = top.map((a, i) => ({
    ...a,
    ai_explanation: explanations[i] ?? "",
  }));

  return NextResponse.json({ anomalies });
}
