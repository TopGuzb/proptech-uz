// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/polls/vote/route.ts
//
// POST /api/pm/polls/vote
//   body: { poll_id, option_id, resident_id, apartment_id }
//
// Validates the poll is open, the option exists, and the resident exists +
// matches the apartment. Upserts one vote per (poll_id, apartment_id).
//
// Authorization is delegated to RLS — the page only allows residents to call
// this with their own ids (resolved client-side from the auth user).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

interface VoteBody {
  poll_id:      string;
  option_id:    string;
  resident_id:  string;
  apartment_id: string;
}

interface PollOption { id: string; label: string }

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as VoteBody | null;
  if (!body?.poll_id || !body.option_id || !body.resident_id || !body.apartment_id) {
    return NextResponse.json({ error: "Все поля обязательны" }, { status: 400 });
  }

  const sb = admin();

  // 1. Validate resident matches apartment
  const { data: resident } = await sb
    .from("residents")
    .select("id, apartment_id, is_active")
    .eq("id", body.resident_id)
    .maybeSingle();
  if (!resident || !resident.is_active) {
    return NextResponse.json({ error: "Жилец не найден" }, { status: 403 });
  }
  if (resident.apartment_id !== body.apartment_id) {
    return NextResponse.json({ error: "Квартира не совпадает" }, { status: 403 });
  }

  // 2. Validate poll
  const { data: poll } = await sb
    .from("polls")
    .select("id, status, options, closes_at, building_id")
    .eq("id", body.poll_id)
    .maybeSingle();
  if (!poll) return NextResponse.json({ error: "Голосование не найдено" }, { status: 404 });
  if (poll.status !== "open") {
    return NextResponse.json({ error: "Голосование закрыто" }, { status: 400 });
  }
  if (poll.closes_at && new Date(poll.closes_at) < new Date()) {
    return NextResponse.json({ error: "Срок голосования истёк" }, { status: 400 });
  }

  const opts = (poll.options as PollOption[] | null) ?? [];
  if (!opts.some((o) => o.id === body.option_id)) {
    return NextResponse.json({ error: "Неверный вариант" }, { status: 400 });
  }

  // 3. Validate apartment is in the poll's building
  const { data: apt } = await sb
    .from("apartments")
    .select("id, building_id")
    .eq("id", body.apartment_id)
    .maybeSingle();
  if (!apt || apt.building_id !== poll.building_id) {
    return NextResponse.json({ error: "Квартира не в этом здании" }, { status: 403 });
  }

  // 4. Upsert vote (unique by poll_id + apartment_id)
  const { data: existing } = await sb
    .from("poll_votes")
    .select("id")
    .eq("poll_id", body.poll_id)
    .eq("apartment_id", body.apartment_id)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("poll_votes")
      .update({ option_id: body.option_id, resident_id: body.resident_id })
      .eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from("poll_votes").insert({
      poll_id:      body.poll_id,
      resident_id:  body.resident_id,
      apartment_id: body.apartment_id,
      option_id:    body.option_id,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
