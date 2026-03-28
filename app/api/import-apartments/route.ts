import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface ImportRow {
  number: string;
  floor: number;
  rooms: number;
  size_m2: number;
  price: number;
  status: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { building_id, project_id, rows } = body as {
      building_id: string;
      project_id: string;
      rows: ImportRow[];
    };

    if (!building_id || !project_id) {
      return NextResponse.json({ error: "building_id and project_id required" }, { status: 400 });
    }
    if (!rows?.length) {
      return NextResponse.json({ error: "rows array is empty" }, { status: 400 });
    }

    // ── Find or create floors for every unique floor number in the import ──────

    const floorNums = [...new Set(rows.map((r) => Number(r.floor)).filter((n) => !isNaN(n) && n > 0))];

    const { data: existingFloors, error: fetchErr } = await supabase
      .from("floors")
      .select("id, floor_number")
      .eq("building_id", building_id);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const floorMap = new Map<number, string>(
      (existingFloors ?? []).map((f) => [f.floor_number as number, f.id as string])
    );

    const missing = floorNums.filter((n) => !floorMap.has(n));

    if (missing.length > 0) {
      const { data: newFloors, error: floorErr } = await supabase
        .from("floors")
        .insert(missing.map((n) => ({ building_id, floor_number: n })))
        .select("id, floor_number");

      if (floorErr) return NextResponse.json({ error: floorErr.message }, { status: 500 });

      for (const f of newFloors ?? []) {
        floorMap.set(f.floor_number as number, f.id as string);
      }
    }

    // ── Build and insert apartment records ────────────────────────────────────

    const validStatuses = new Set(["available", "reserved", "sold"]);
    const toInsert: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const floorNum = Number(row.floor);
      const floorId  = floorMap.get(floorNum);

      if (!row.number?.toString().trim()) {
        errors.push(`Row ${i + 1}: number is required`);
        continue;
      }
      if (!floorId) {
        errors.push(`Row ${i + 1}: invalid floor "${row.floor}"`);
        continue;
      }

      toInsert.push({
        building_id,
        project_id,
        floor_id:    floorId,
        floor:       floorNum,
        number:      String(row.number).trim(),
        rooms_count: Number(row.rooms) || 1,
        size_m2:     Number(row.size_m2) || 0,
        price:       Number(row.price) || 0,
        status:      validStatuses.has(row.status) ? row.status : "available",
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ imported: 0, errors, total: rows.length });
    }

    const { data: created, error: aptErr } = await supabase
      .from("apartments")
      .insert(toInsert)
      .select("id");

    if (aptErr) return NextResponse.json({ error: aptErr.message }, { status: 500 });

    return NextResponse.json({
      imported: (created ?? []).length,
      errors,
      total: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
