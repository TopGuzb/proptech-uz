// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/assets/route.ts
//
//  POST  /api/pm/assets         — create asset
//  PATCH /api/pm/assets?id=xxx  — update asset
//  GET   /api/pm/assets?building_id=xxx
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AssetCategory =
  | "elevator" | "pump" | "boiler" | "hvac"
  | "electrical" | "plumbing" | "security" | "other";

type AssetStatus = "operational" | "needs_service" | "broken" | "retired";

const VALID_CAT: Set<AssetCategory> = new Set([
  "elevator","pump","boiler","hvac","electrical","plumbing","security","other",
]);
const VALID_ST: Set<AssetStatus> = new Set([
  "operational","needs_service","broken","retired",
]);

interface CreateBody {
  building_id:           string;
  name:                  string;
  category:              AssetCategory;
  serial_number?:        string | null;
  manufacturer?:         string | null;
  installed_at?:         string | null;
  warranty_until?:       string | null;
  next_service_at?:      string | null;
  service_interval_days?: number | null;
  location?:             string | null;
  notes?:                string | null;
  status?:               AssetStatus;
}

interface PatchBody {
  name?:                 string;
  category?:             AssetCategory;
  serial_number?:        string | null;
  manufacturer?:         string | null;
  installed_at?:         string | null;
  warranty_until?:       string | null;
  next_service_at?:      string | null;
  service_interval_days?: number | null;
  location?:             string | null;
  notes?:                string | null;
  status?:               AssetStatus;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const buildingId = new URL(req.url).searchParams.get("building_id");
  const sb = admin();
  let q = sb.from("pm_assets").select("*").order("status").order("name");
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body?.building_id || !body.name?.trim() || !body.category) {
    return NextResponse.json({ error: "building_id, name, category обязательны" }, { status: 400 });
  }
  if (!VALID_CAT.has(body.category)) {
    return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
  }

  const insert = {
    building_id:           body.building_id,
    name:                  body.name.trim(),
    category:              body.category,
    serial_number:         body.serial_number?.trim() || null,
    manufacturer:          body.manufacturer?.trim() || null,
    installed_at:          body.installed_at || null,
    warranty_until:        body.warranty_until || null,
    next_service_at:       body.next_service_at || null,
    service_interval_days: body.service_interval_days ?? null,
    location:              body.location?.trim() || null,
    notes:                 body.notes?.trim() || null,
    status:                (body.status && VALID_ST.has(body.status)) ? body.status : "operational",
  };

  const sb = admin();
  const { data, error } = await sb.from("pm_assets").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data }, { status: 201 });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name                  !== undefined) update.name                  = body.name.trim();
  if (body.category              !== undefined) {
    if (!VALID_CAT.has(body.category)) return NextResponse.json({ error: "Неверная категория" }, { status: 400 });
    update.category = body.category;
  }
  if (body.serial_number         !== undefined) update.serial_number         = body.serial_number?.trim() || null;
  if (body.manufacturer          !== undefined) update.manufacturer          = body.manufacturer?.trim() || null;
  if (body.installed_at          !== undefined) update.installed_at          = body.installed_at || null;
  if (body.warranty_until        !== undefined) update.warranty_until        = body.warranty_until || null;
  if (body.next_service_at       !== undefined) update.next_service_at       = body.next_service_at || null;
  if (body.service_interval_days !== undefined) update.service_interval_days = body.service_interval_days ?? null;
  if (body.location              !== undefined) update.location              = body.location?.trim() || null;
  if (body.notes                 !== undefined) update.notes                 = body.notes?.trim() || null;
  if (body.status                !== undefined) {
    if (!VALID_ST.has(body.status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
    update.status = body.status;
  }

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const sb = admin();
  const { data, error } = await sb.from("pm_assets").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}
