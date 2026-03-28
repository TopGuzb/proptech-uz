import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface ApartmentType {
  rooms: number;
  count: number;
  size_m2: number;
  price: number;
}

interface BulkRequest {
  building_id: string;
  project_id: string;
  floors_count: number;
  apartment_types: ApartmentType[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BulkRequest;
    const { building_id, project_id, floors_count, apartment_types } = body;

    if (!building_id || !project_id) {
      return NextResponse.json({ error: "building_id and project_id required" }, { status: 400 });
    }
    if (!floors_count || floors_count < 1 || floors_count > 99) {
      return NextResponse.json({ error: "floors_count must be 1–99" }, { status: 400 });
    }
    if (!apartment_types?.length) {
      return NextResponse.json({ error: "apartment_types required" }, { status: 400 });
    }

    // ── Get existing floors ────────────────────────────────────────────────────

    const { data: existingFloors, error: fetchErr } = await supabase
      .from("floors")
      .select("id, floor_number")
      .eq("building_id", building_id);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const existingNums = new Set((existingFloors ?? []).map((f) => f.floor_number as number));

    // ── Create missing floors ──────────────────────────────────────────────────

    const floorsToCreate = [];
    for (let i = 1; i <= floors_count; i++) {
      if (!existingNums.has(i)) {
        floorsToCreate.push({ building_id, floor_number: i });
      }
    }

    if (floorsToCreate.length > 0) {
      const { error: floorErr } = await supabase.from("floors").insert(floorsToCreate);
      if (floorErr) return NextResponse.json({ error: floorErr.message }, { status: 500 });
    }

    // ── Fetch all floors (1..floors_count) with their IDs ─────────────────────

    const { data: allFloors, error: allErr } = await supabase
      .from("floors")
      .select("id, floor_number")
      .eq("building_id", building_id)
      .lte("floor_number", floors_count)
      .gte("floor_number", 1)
      .order("floor_number");

    if (allErr) return NextResponse.json({ error: allErr.message }, { status: 500 });

    // ── Build apartment records ────────────────────────────────────────────────

    const apartmentsToInsert: Record<string, unknown>[] = [];

    for (const floor of allFloors ?? []) {
      let idx = 1;
      for (const type of apartment_types) {
        for (let c = 0; c < type.count; c++) {
          // Number format: 101, 102… 201, 202…
          const num = `${floor.floor_number}${String(idx).padStart(2, "0")}`;
          apartmentsToInsert.push({
            building_id,
            project_id,
            floor_id:    floor.id,
            floor:       floor.floor_number,
            number:      num,
            rooms_count: type.rooms,
            size_m2:     type.size_m2,
            price:       type.price,
            status:      "available",
          });
          idx++;
        }
      }
    }

    const { data: created, error: aptErr } = await supabase
      .from("apartments")
      .insert(apartmentsToInsert)
      .select("id");

    if (aptErr) return NextResponse.json({ error: aptErr.message }, { status: 500 });

    return NextResponse.json({
      created_floors:      floorsToCreate.length,
      created_apartments:  (created ?? []).length,
      total:               (created ?? []).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
