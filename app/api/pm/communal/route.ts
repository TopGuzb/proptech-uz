// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/communal/route.ts
//
// Common-property (Общее имущество) registry — distinct from pm_assets:
// pm_assets   = equipment (lifts, pumps, boilers)
// communal_assets = building's shared infrastructure (entrances, parking,
// playgrounds, common areas, roof, facade)
//
//  GET   /api/pm/communal?building_id=xxx
//  POST  /api/pm/communal
//  PATCH /api/pm/communal?id=xxx
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type CommunalType =
  | "elevator" | "entrance" | "parking" | "playground"
  | "common_area" | "roof" | "facade" | "other";
type CommunalStatus = "operational" | "maintenance" | "broken" | "retired";

const VALID_TYPES: Set<CommunalType> = new Set([
  "elevator","entrance","parking","playground","common_area","roof","facade","other",
]);
const VALID_STATUS: Set<CommunalStatus> = new Set([
  "operational","maintenance","broken","retired",
]);

interface CreateBody {
  building_id:            string;
  asset_type:             CommunalType;
  name:                   string;
  description?:           string | null;
  status?:                CommunalStatus;
  last_inspection_date?:  string | null;
  next_inspection_date?:  string | null;
}

interface PatchBody {
  asset_type?:            CommunalType;
  name?:                  string;
  description?:           string | null;
  status?:                CommunalStatus;
  last_inspection_date?:  string | null;
  next_inspection_date?:  string | null;
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
  let q = sb.from("communal_assets").select("*").order("asset_type").order("name");
  if (buildingId) q = q.eq("building_id", buildingId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body?.building_id || !body.name?.trim() || !body.asset_type) {
    return NextResponse.json({ error: "building_id, name, asset_type обязательны" }, { status: 400 });
  }
  if (!VALID_TYPES.has(body.asset_type)) {
    return NextResponse.json({ error: "Неверный тип" }, { status: 400 });
  }

  const insert = {
    building_id:          body.building_id,
    asset_type:           body.asset_type,
    name:                 body.name.trim(),
    description:          body.description?.trim() || null,
    status:               (body.status && VALID_STATUS.has(body.status)) ? body.status : "operational",
    last_inspection_date: body.last_inspection_date || null,
    next_inspection_date: body.next_inspection_date || null,
  };

  const sb = admin();
  const { data, error } = await sb.from("communal_assets").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data }, { status: 201 });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.asset_type !== undefined) {
    if (!VALID_TYPES.has(body.asset_type)) return NextResponse.json({ error: "Неверный тип" }, { status: 400 });
    update.asset_type = body.asset_type;
  }
  if (body.name                 !== undefined) update.name                 = body.name.trim();
  if (body.description          !== undefined) update.description          = body.description?.trim() || null;
  if (body.status               !== undefined) {
    if (!VALID_STATUS.has(body.status)) return NextResponse.json({ error: "Неверный статус" }, { status: 400 });
    update.status = body.status;
  }
  if (body.last_inspection_date !== undefined) update.last_inspection_date = body.last_inspection_date || null;
  if (body.next_inspection_date !== undefined) update.next_inspection_date = body.next_inspection_date || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const sb = admin();
  const { data, error } = await sb.from("communal_assets").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ asset: data });
}
