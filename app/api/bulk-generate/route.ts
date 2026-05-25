// ─────────────────────────────────────────────────────────────────────────────
// app/api/bulk-generate/route.ts
//
// Endpoint:  POST /api/bulk-generate
// Called by: app/projects/[id]/page.tsx  (the "Bulk Generate" modal — admins
//            create whole buildings of apartments in one shot).
//
// Input body:  { building_id, project_id, floors_count, apartment_types[] }
//   apartment_types example:  [{ rooms: 2, count: 4, size_m2: 65, price: 80000 }]
//                  → on every floor we create 4 two-room apartments.
//
// Pipeline:
//   1. Look up which floors (1..floors_count) already exist for this building.
//   2. INSERT the missing floors and capture their new IDs.
//   3. For every floor, walk apartment_types and build apartment rows.
//      Apartment numbers follow  floor*100 + index   (so 1F → 101,102…).
//   4. INSERT all apartments in a single batch.
//
// Returns the number of floors and apartments actually created.
//
// Performance note:
//   The whole job is THREE round-trips total — one SELECT for existing floors,
//   one INSERT for the missing floors, one INSERT for all the apartments.
//   A naive per-floor loop would scale linearly with floors_count and choke
//   on big buildings (this endpoint can produce 400+ apartments at once).
//   The Map<number,string> lets us look up floor IDs in O(1) without
//   re-querying the DB after each insert.
//
// Why apartment numbers use floor*100 + index:
//   It's the convention Tashkent developers already use on paper — apartment
//   305 is unambiguously floor 3, unit 5. Matching that mental model means no
//   training cost for sales managers using the platform.
// ─────────────────────────────────────────────────────────────────────────────

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

    // Build floor_number → id map from existing floors. Using a Map gives us
    // O(1) lookups in the apartment-building loop below; we'd otherwise be
    // running a DB query per floor or doing N² array.find() calls.
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
