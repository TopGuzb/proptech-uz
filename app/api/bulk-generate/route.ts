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

    // ── Step 1: get existing floors for this building ──────────────────────────

    const { data: existingFloors, error: fetchErr } = await supabase
      .from("floors")
      .select("id, floor_number")
      .eq("building_id", building_id)
      .gte("floor_number", 1)
      .lte("floor_number", floors_count);

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    // Build floor_number → id map from existing floors
    const floorMap = new Map<number, string>(
      (existingFloors ?? []).map((f) => [f.floor_number as number, f.id as string])
    );

    // ── Step 2: insert missing floors, capture IDs immediately ────────────────

    const missingNums: number[] = [];
    for (let i = 1; i <= floors_count; i++) {
      if (!floorMap.has(i)) missingNums.push(i);
    }

    let createdFloorsCount = 0;

    if (missingNums.length > 0) {
      const { data: newFloors, error: floorErr } = await supabase
        .from("floors")
        .insert(missingNums.map((n) => ({ building_id, floor_number: n })))
        .select("id, floor_number");

      if (floorErr) return NextResponse.json({ error: floorErr.message }, { status: 500 });

      // Add newly created floors to the map
      for (const f of newFloors ?? []) {
        floorMap.set(f.floor_number as number, f.id as string);
      }

      createdFloorsCount = (newFloors ?? []).length;
    }

    // ── Step 3: build apartment records using the map ─────────────────────────

    const apartmentsToInsert: Record<string, unknown>[] = [];

    for (let floorNum = 1; floorNum <= floors_count; floorNum++) {
      const floorId = floorMap.get(floorNum);
      if (!floorId) continue; // skip if floor somehow missing

      let idx = 1;
      for (const type of apartment_types) {
        for (let c = 0; c < type.count; c++) {
          // Format: floor*100 + index  →  101, 102, 201, 202…
          const aptNumber = `${floorNum * 100 + idx}`;
          apartmentsToInsert.push({
            building_id,
            project_id,
            floor_id:    floorId,
            floor:       floorNum,
            number:      aptNumber,
            rooms_count: type.rooms,
            size_m2:     type.size_m2,
            price:       type.price,
            status:      "available",
          });
          idx++;
        }
      }
    }

    // ── Step 4: insert apartments ──────────────────────────────────────────────

    const { data: created, error: aptErr } = await supabase
      .from("apartments")
      .insert(apartmentsToInsert)
      .select("id");

    if (aptErr) return NextResponse.json({ error: aptErr.message }, { status: 500 });

    return NextResponse.json({
      created_floors:     createdFloorsCount,
      created_apartments: (created ?? []).length,
      total:              (created ?? []).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
