// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/maintenance-requests/route.ts
//
//  POST  /api/pm/maintenance-requests   → create request
//  GET   /api/pm/maintenance-requests   → list with filters & joins
//
// Server-side uses SUPABASE_SERVICE_ROLE_KEY so RLS doesn't block legitimate
// API calls. Authorization happens upstream (middleware + UI gates).
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Priority = "low" | "medium" | "high" | "emergency";
type Status   = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

const SLA_HOURS: Record<Priority, number> = {
  emergency: 2,
  high:      4,
  medium:    24,
  low:       72,
};

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface CreateBody {
  apartment_id: string;
  title:        string;
  description:  string;
  category?:    string | null;
  priority?:    Priority;
  resident_id?: string | null;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as CreateBody | null;

  if (!body || !body.apartment_id || !body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json(
      { error: "apartment_id, title и description обязательны" },
      { status: 400 }
    );
  }

  let priority: Priority = body.priority ?? "medium";
  let category: string | null = body.category ?? null;

  // ── AI auto-triage (best-effort; never blocks creation) ───────────────────
  let aiCategory: string | null = null;
  let aiPriority: Priority | null = null;
  let aiSummary:  string | null = null;
  try {
    const origin = req.nextUrl.origin;
    const aiRes = await fetch(`${origin}/api/ai/categorize-request`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ title: body.title, description: body.description }),
    });
    if (aiRes.ok) {
      const ai = (await aiRes.json()) as {
        category?: string; priority?: Priority; summary?: string;
      };
      aiCategory = ai.category ?? null;
      aiPriority = ai.priority ?? null;
      aiSummary  = ai.summary  ?? null;

      // If user didn't pick category/priority, accept AI's choice.
      if (!category && aiCategory) category = aiCategory;
      if (!body.priority && aiPriority) priority = aiPriority;
    }
  } catch {
    // swallow — AI is non-critical
  }

  const slaDeadline = new Date(Date.now() + SLA_HOURS[priority] * 3600 * 1000).toISOString();

  const sb = admin();

  // Resolve building_id via apartment
  const { data: apt, error: aptErr } = await sb
    .from("apartments")
    .select("building_id")
    .eq("id", body.apartment_id)
    .maybeSingle();

  if (aptErr) return NextResponse.json({ error: aptErr.message }, { status: 500 });
  if (!apt)   return NextResponse.json({ error: "Квартира не найдена" }, { status: 404 });

  const { data: request, error: insErr } = await sb
    .from("maintenance_requests")
    .insert({
      apartment_id:           body.apartment_id,
      building_id:            apt.building_id,
      resident_id:            body.resident_id ?? null,
      title:                  body.title.trim(),
      description:            body.description.trim(),
      category,
      priority,
      status:                 "open" as Status,
      sla_deadline:           slaDeadline,
      ai_category_suggested:  aiCategory,
      ai_priority_suggested:  aiPriority,
      ai_summary:             aiSummary,
    })
    .select()
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ request });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status       = url.searchParams.get("status");
  const priority     = url.searchParams.get("priority");
  const apartmentId  = url.searchParams.get("apartment_id");
  const limit        = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);

  const sb = admin();

  let q = sb
    .from("maintenance_requests")
    .select(`
      id, apartment_id, building_id, resident_id, category, priority, status,
      title, description, ai_category_suggested, ai_priority_suggested, ai_summary,
      assigned_vendor_id, assigned_dispatcher_id, sla_deadline, resolution_notes,
      cost_amount, resident_rating, resident_feedback,
      created_at, assigned_at, started_at, completed_at,
      apartment:apartments (
        id, number, floor,
        building:buildings (
          id, name,
          project:projects ( id, name )
        )
      ),
      resident:residents ( id, full_name, phone, telegram_username ),
      assigned_vendor:vendors!maintenance_requests_assigned_vendor_id_fkey (
        id, name, phone, specializations
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status)      q = q.eq("status",       status);
  if (priority)    q = q.eq("priority",     priority);
  if (apartmentId) q = q.eq("apartment_id", apartmentId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}
