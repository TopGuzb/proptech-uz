// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/polls/route.ts
//
//  POST  /api/pm/polls         — create poll
//  PATCH /api/pm/polls?id=xxx  — update (status / closes_at / etc.)
//  GET   /api/pm/polls?building_id=xxx — list with vote counts
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PollStatus = "open" | "closed" | "cancelled";

interface PollOption {
  id:    string;
  label: string;
}

interface CreateBody {
  building_id: string;
  title:       string;
  description?: string | null;
  options:     PollOption[];
  quorum_pct?: number;
  closes_at?:  string | null;
}

interface PatchBody {
  title?:       string;
  description?: string | null;
  status?:      PollStatus;
  quorum_pct?:  number;
  closes_at?:   string | null;
  ai_summary?:  string | null;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

function sanitizeOptions(raw: unknown): PollOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PollOption[] = [];
  for (const o of raw) {
    if (
      o && typeof o === "object" &&
      typeof (o as Record<string, unknown>).id    === "string" &&
      typeof (o as Record<string, unknown>).label === "string"
    ) {
      const opt = o as PollOption;
      if (opt.id.trim() && opt.label.trim()) {
        out.push({ id: opt.id.trim(), label: opt.label.trim() });
      }
    }
  }
  return out;
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const buildingId = new URL(req.url).searchParams.get("building_id");
  const sb = admin();

  let q = sb.from("polls").select("*").order("created_at", { ascending: false });
  if (buildingId) q = q.eq("building_id", buildingId);

  const { data: polls, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = polls ?? [];
  if (list.length === 0) return NextResponse.json({ polls: [] });

  const ids = list.map((p) => p.id);
  const { data: votes } = await sb
    .from("poll_votes")
    .select("poll_id, option_id")
    .in("poll_id", ids);

  // tally
  const tally = new Map<string, Record<string, number>>();
  for (const v of votes ?? []) {
    const inner = tally.get(v.poll_id) ?? {};
    inner[v.option_id] = (inner[v.option_id] ?? 0) + 1;
    tally.set(v.poll_id, inner);
  }

  const enriched = list.map((p) => ({
    ...p,
    vote_counts: tally.get(p.id) ?? {},
    total_votes: Object.values(tally.get(p.id) ?? {}).reduce((s, n) => s + n, 0),
  }));

  return NextResponse.json({ polls: enriched });
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body || !body.building_id || !body.title?.trim()) {
    return NextResponse.json({ error: "building_id и title обязательны" }, { status: 400 });
  }
  const opts = sanitizeOptions(body.options);
  if (opts.length < 2) {
    return NextResponse.json({ error: "Нужно минимум 2 варианта" }, { status: 400 });
  }
  // Unique option ids
  const seen = new Set<string>();
  for (const o of opts) {
    if (seen.has(o.id)) {
      return NextResponse.json({ error: `Дубликат option id: ${o.id}` }, { status: 400 });
    }
    seen.add(o.id);
  }

  const quorum = Math.max(0, Math.min(100, Number(body.quorum_pct ?? 50)));

  const sb = admin();
  const { data, error } = await sb
    .from("polls")
    .insert({
      building_id: body.building_id,
      title:       body.title.trim(),
      description: body.description?.trim() || null,
      options:     opts,
      quorum_pct:  quorum,
      closes_at:   body.closes_at || null,
      status:      "open",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ poll: data }, { status: 201 });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title       !== undefined) update.title       = body.title.trim();
  if (body.description !== undefined) update.description = body.description?.trim() || null;
  if (body.status      !== undefined) update.status      = body.status;
  if (body.quorum_pct  !== undefined) update.quorum_pct  = Math.max(0, Math.min(100, Number(body.quorum_pct)));
  if (body.closes_at   !== undefined) update.closes_at   = body.closes_at || null;
  if (body.ai_summary  !== undefined) update.ai_summary  = body.ai_summary;

  const sb = admin();
  const { data, error } = await sb.from("polls").update(update).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ poll: data });
}
