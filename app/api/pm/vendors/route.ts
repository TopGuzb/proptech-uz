// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/vendors/route.ts
//
//  POST  /api/pm/vendors         — create a vendor
//  PATCH /api/pm/vendors?id=xxx  — update a vendor (active flag, fields, rating)
//  GET   /api/pm/vendors         — list with optional ?spec=plumbing&active=1
//
// All operations use the service-role key.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type RequestCategory =
  | "plumbing" | "electrical" | "heating" | "cleaning"
  | "elevator" | "appliance"  | "structural" | "other";

const VALID_SPECS = new Set<RequestCategory>([
  "plumbing", "electrical", "heating", "cleaning",
  "elevator", "appliance", "structural", "other",
]);

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface CreateBody {
  name:               string;
  phone:              string;
  email?:             string | null;
  telegram_username?: string | null;
  specializations?:   string[];
  notes?:             string | null;
}

interface PatchBody {
  name?:              string;
  phone?:             string;
  email?:             string | null;
  telegram_username?: string | null;
  specializations?:   string[];
  notes?:             string | null;
  is_active?:         boolean;
  rating?:            number;
}

function sanitizeSpecs(input: unknown): RequestCategory[] {
  if (!Array.isArray(input)) return [];
  const out: RequestCategory[] = [];
  for (const s of input) {
    if (typeof s === "string" && VALID_SPECS.has(s as RequestCategory)) {
      out.push(s as RequestCategory);
    }
  }
  return Array.from(new Set(out));
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url    = new URL(req.url);
  const spec   = url.searchParams.get("spec");
  const active = url.searchParams.get("active");

  const sb = admin();
  let q = sb.from("vendors").select("*").order("rating", { ascending: false });
  if (active === "1") q = q.eq("is_active", true);
  if (active === "0") q = q.eq("is_active", false);
  if (spec && VALID_SPECS.has(spec as RequestCategory)) {
    q = q.contains("specializations", [spec]);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendors: data ?? [] });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Имя обязательно" }, { status: 400 });
  }
  if (typeof body.phone !== "string" || !body.phone.trim()) {
    return NextResponse.json({ error: "Телефон обязателен" }, { status: 400 });
  }

  const sb = admin();
  const insert = {
    name:              body.name.trim(),
    phone:             body.phone.trim(),
    email:             body.email?.trim() || null,
    telegram_username: body.telegram_username?.trim() || null,
    specializations:   sanitizeSpecs(body.specializations),
    notes:             body.notes?.trim() || null,
    is_active:         true,
    rating:            0,
    total_jobs:        0,
    completed_jobs:    0,
  };

  const { data, error } = await sb.from("vendors").insert(insert).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendor: data }, { status: 201 });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.name              !== undefined) update.name              = body.name.trim();
  if (body.phone             !== undefined) update.phone             = body.phone.trim();
  if (body.email             !== undefined) update.email             = body.email?.trim() || null;
  if (body.telegram_username !== undefined) update.telegram_username = body.telegram_username?.trim() || null;
  if (body.notes             !== undefined) update.notes             = body.notes?.trim() || null;
  if (body.is_active         !== undefined) update.is_active         = !!body.is_active;
  if (body.specializations   !== undefined) update.specializations   = sanitizeSpecs(body.specializations);
  if (body.rating            !== undefined) {
    const r = Number(body.rating);
    if (Number.isFinite(r) && r >= 0 && r <= 5) update.rating = r;
  }
  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length <= 1) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const sb = admin();
  const { data, error } = await sb.from("vendors").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vendor: data });
}
