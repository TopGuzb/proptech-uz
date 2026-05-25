// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/maintenance-requests/[id]/route.ts
//
//  PATCH /api/pm/maintenance-requests/{id}  — update status / vendor / etc.
//
// Side-effects on status transitions:
//   open       → assigned     : set assigned_at = now()
//   *          → in_progress  : set started_at  = now() (if not yet)
//   *          → completed    : set completed_at = now() and bump
//                               vendors.completed_jobs (+1) when a vendor
//                               was assigned.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Status = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface PatchBody {
  status?:               Status;
  assigned_vendor_id?:   string | null;
  resolution_notes?:     string | null;
  cost_amount?:          number | null;
  resident_rating?:      number | null;
  resident_feedback?:    string | null;
}

export async function PATCH(
  req:    NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return NextResponse.json({ error: "Empty body" }, { status: 400 });

  const sb = admin();

  // Fetch current row to compute side-effects
  const { data: current, error: fetchErr } = await sb
    .from("maintenance_requests")
    .select("id, status, assigned_at, started_at, completed_at, assigned_vendor_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: "Заявка не найдена" }, { status: 404 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};

  if (body.assigned_vendor_id !== undefined) {
    update.assigned_vendor_id = body.assigned_vendor_id;
    // Auto-promote status to "assigned" when assigning vendor on an open request
    if (body.assigned_vendor_id && current.status === "open" && !body.status) {
      update.status       = "assigned";
      update.assigned_at  = now;
    }
  }

  if (body.status && body.status !== current.status) {
    update.status = body.status;
    if (body.status === "assigned"    && !current.assigned_at)  update.assigned_at  = now;
    if (body.status === "in_progress" && !current.started_at)   update.started_at   = now;
    if (body.status === "completed"   && !current.completed_at) update.completed_at = now;
  }

  if (body.resolution_notes  !== undefined) update.resolution_notes  = body.resolution_notes;
  if (body.cost_amount       !== undefined) update.cost_amount       = body.cost_amount;
  if (body.resident_rating   !== undefined) update.resident_rating   = body.resident_rating;
  if (body.resident_feedback !== undefined) update.resident_feedback = body.resident_feedback;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }

  const { data: updated, error: updErr } = await sb
    .from("maintenance_requests")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // On completion, bump the vendor's completed_jobs counter
  if (update.status === "completed" && current.assigned_vendor_id) {
    const { data: v } = await sb
      .from("vendors")
      .select("completed_jobs")
      .eq("id", current.assigned_vendor_id)
      .maybeSingle();
    if (v) {
      await sb
        .from("vendors")
        .update({ completed_jobs: (v.completed_jobs ?? 0) + 1 })
        .eq("id", current.assigned_vendor_id);
    }
  }

  return NextResponse.json({ request: updated });
}
