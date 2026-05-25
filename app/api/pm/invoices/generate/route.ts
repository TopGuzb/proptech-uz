// ─────────────────────────────────────────────────────────────────────────────
// app/api/pm/invoices/generate/route.ts
//
// POST /api/pm/invoices/generate
//   body: { building_id, period_start, period_end }
//
// For each apartment in the building:
//   • Sum cost_amount of meter_readings within [period_start, period_end]
//     → utilities_amount
//   • Compute pm_fee = apartment.size_m2 * PM_FEE_PER_M2
//   • Compute total = pm_fee + utilities_amount + maintenance_amount(=0 MVP)
//   • Insert pm_invoices row (status='draft', due_date = period_end + 14 days)
//
// Skips apartments that already have an invoice for the same period.
// Returns { created: [...], skipped: [...] }.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PM_FEE_PER_M2 } from "@/lib/pm/tariffs";

export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

interface Body {
  building_id:   string;
  period_start:  string;  // YYYY-MM-DD
  period_end:    string;  // YYYY-MM-DD
}

interface ApartmentRow {
  id:      string;
  number:  string;
  size_m2: number | null;
}
interface ResidentRow { id: string; apartment_id: string; }
interface ReadingRow  { apartment_id: string; cost_amount: number | null; reading_date: string; }
interface InvoiceRow  { apartment_id: string; }

function isYmd(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }

function makeInvoiceNumber(apartmentNumber: string, periodEnd: string) {
  const yyyymm = periodEnd.replace(/-/g, "").slice(0, 6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INV-${yyyymm}-${apartmentNumber}-${rand}`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Body | null;

  if (!body?.building_id || !body.period_start || !body.period_end ||
      !isYmd(body.period_start) || !isYmd(body.period_end) ||
      body.period_start > body.period_end) {
    return NextResponse.json(
      { error: "building_id, period_start, period_end (YYYY-MM-DD) обязательны" },
      { status: 400 },
    );
  }

  const sb = admin();

  // 1. Apartments in building
  const { data: aptsData, error: aptsErr } = await sb
    .from("apartments")
    .select("id, number, size_m2")
    .eq("building_id", body.building_id);

  if (aptsErr) return NextResponse.json({ error: aptsErr.message }, { status: 500 });
  const apartments = (aptsData as ApartmentRow[] | null) ?? [];
  if (apartments.length === 0) return NextResponse.json({ created: [], skipped: [] });

  const aptIds = apartments.map((a) => a.id);

  // 2. Existing invoices for this period (avoid duplicates)
  const { data: existing } = await sb
    .from("pm_invoices")
    .select("apartment_id")
    .in("apartment_id", aptIds)
    .eq("billing_period_start", body.period_start)
    .eq("billing_period_end",   body.period_end);

  const alreadyInvoiced = new Set<string>(
    ((existing as InvoiceRow[] | null) ?? []).map((x) => x.apartment_id),
  );

  // 3. Active residents (link to first found one)
  const { data: residentsData } = await sb
    .from("residents")
    .select("id, apartment_id")
    .in("apartment_id", aptIds)
    .eq("is_active", true);

  const residentByApt = new Map<string, string>();
  for (const r of (residentsData as ResidentRow[] | null) ?? []) {
    if (!residentByApt.has(r.apartment_id)) residentByApt.set(r.apartment_id, r.id);
  }

  // 4. Readings in period (sum cost per apartment)
  const { data: readingsData } = await sb
    .from("meter_readings")
    .select("apartment_id, cost_amount, reading_date")
    .in("apartment_id", aptIds)
    .gte("reading_date", body.period_start)
    .lte("reading_date", body.period_end);

  const utilitiesByApt = new Map<string, number>();
  for (const r of (readingsData as ReadingRow[] | null) ?? []) {
    const cur = utilitiesByApt.get(r.apartment_id) ?? 0;
    utilitiesByApt.set(r.apartment_id, cur + Number(r.cost_amount ?? 0));
  }

  // 5. Build invoice rows
  const dueDate = new Date(body.period_end);
  dueDate.setDate(dueDate.getDate() + 14);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const rows: Record<string, unknown>[] = [];
  const skipped: { apartment_id: string; reason: string }[] = [];

  for (const apt of apartments) {
    if (alreadyInvoiced.has(apt.id)) {
      skipped.push({ apartment_id: apt.id, reason: "already_invoiced" });
      continue;
    }
    const utilities = Math.round(utilitiesByApt.get(apt.id) ?? 0);
    const pmFee     = Math.round((apt.size_m2 ?? 0) * PM_FEE_PER_M2);
    const total     = pmFee + utilities;

    if (total === 0) {
      skipped.push({ apartment_id: apt.id, reason: "zero_amount" });
      continue;
    }

    rows.push({
      apartment_id:         apt.id,
      resident_id:          residentByApt.get(apt.id) ?? null,
      invoice_number:       makeInvoiceNumber(apt.number, body.period_end),
      billing_period_start: body.period_start,
      billing_period_end:   body.period_end,
      pm_fee:               pmFee,
      utilities_amount:     utilities,
      maintenance_amount:   0,
      total_amount:         total,
      currency:             "UZS",
      status:               "draft",
      due_date:             dueDateStr,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ created: [], skipped });
  }

  const { data: created, error: insErr } = await sb
    .from("pm_invoices")
    .insert(rows)
    .select("id, apartment_id, invoice_number, total_amount, status, due_date");

  if (insErr) {
    return NextResponse.json({ error: insErr.message, skipped }, { status: 500 });
  }

  return NextResponse.json({ created: created ?? [], skipped });
}
