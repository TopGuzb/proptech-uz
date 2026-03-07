"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  ArrowLeft,
  Plus,
  Building2,
  MapPin,
  Layers,
  Home,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  location: string;
  created_at: string;
}

interface Building {
  id: string;
  project_id: string;
  name: string;
  created_at: string;
}

type AptStatus = "available" | "reserved" | "sold";

interface Apartment {
  id: string;
  building_id: string;
  number: string;
  rooms_count: number | null;
  floor: number;
  size_m2: number;
  price: number;
  status: AptStatus;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AptStatus, { bg: string; text: string; dot: string; label: string }> = {
  available: { bg: "#1e1b4b", text: "#a5b4fc", dot: "#6366f1",  label: "Available" },
  reserved:  { bg: "#1c1003", text: "#fbbf24", dot: "#f59e0b",  label: "Reserved"  },
  sold:      { bg: "#052e16", text: "#34d399", dot: "#10b981",  label: "Sold"      },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject]     = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);   // all for this project
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  // Add-building modal
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [buildingName, setBuildingName]       = useState("");
  const [addingBuilding, setAddingBuilding]   = useState(false);
  const [addBuildingError, setAddBuildingError] = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [projectRes, buildingsRes, apartmentsRes] = await Promise.all([
      supabase.from("projects").select("id, name, location, created_at").eq("id", id).single(),
      supabase.from("buildings").select("id, project_id, name, created_at").eq("project_id", id).order("created_at"),
      supabase.from("apartments").select("id, building_id, number, rooms_count, floor, size_m2, price, status").eq("project_id", id),
    ]);

    if (projectRes.error)    { setError(projectRes.error.message); setLoading(false); return; }
    if (buildingsRes.error)  { setError(buildingsRes.error.message); setLoading(false); return; }

    setProject(projectRes.data);
    setBuildings(buildingsRes.data ?? []);
    setApartments((apartmentsRes.data as Apartment[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Derived stats per building ─────────────────────────────────────────────

  function statsFor(buildingId: string) {
    const apts = apartments.filter((a) => a.building_id === buildingId);
    const floors = new Set(apts.map((a) => a.floor)).size;
    return { total: apts.length, floors };
  }

  // ── Floor plan data for selected building ─────────────────────────────────

  const floorMap = (() => {
    if (!selectedBuilding) return {};
    const apts = apartments.filter((a) => a.building_id === selectedBuilding.id);
    return apts.reduce<Record<number, Apartment[]>>((acc, apt) => {
      if (!acc[apt.floor]) acc[apt.floor] = [];
      acc[apt.floor].push(apt);
      return acc;
    }, {});
  })();
  const sortedFloors = Object.keys(floorMap).map(Number).sort((a, b) => b - a);

  // ── Add building ──────────────────────────────────────────────────────────

  async function handleAddBuilding(e: React.FormEvent) {
    e.preventDefault();
    setAddBuildingError(null);
    if (!buildingName.trim()) { setAddBuildingError("Name is required."); return; }
    setAddingBuilding(true);

    const { error: err } = await supabase
      .from("buildings")
      .insert({ project_id: id, name: buildingName.trim() });

    setAddingBuilding(false);
    if (err) { setAddBuildingError(err.message); return; }

    setBuildingName("");
    setShowAddBuilding(false);
    fetchAll();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <button
          onClick={() => router.push("/projects")}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "#64748b" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs" style={{ color: "#475569" }}>Projects</span>
          <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "#334155" }} />
          <span className="text-sm font-semibold text-white truncate">
            {loading ? "…" : project?.name}
          </span>
        </div>
      </header>

      <main className="px-6 py-6 w-full space-y-6">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Project info */}
        {project && !loading && (
          <div
            className="rounded-xl border p-5 flex items-center gap-4"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0"
              style={{ backgroundColor: "#1e1b4b" }}>
              <Building2 className="w-6 h-6" style={{ color: "#6366f1" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white">{project.name}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3" style={{ color: "#475569" }} />
                <span className="text-xs" style={{ color: "#64748b" }}>{project.location}</span>
              </div>
            </div>
            <div className="ml-auto flex gap-5 text-center shrink-0">
              <div>
                <p className="text-xl font-bold text-white">{buildings.length}</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Buildings</p>
              </div>
              <div>
                <p className="text-xl font-bold text-white">{apartments.length}</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Units</p>
              </div>
            </div>
          </div>
        )}

        {/* Buildings section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Buildings</h2>
            <button
              onClick={() => { setBuildingName(""); setAddBuildingError(null); setShowAddBuilding(true); }}
              className="flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: "#6366f1" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add building
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-xl border animate-pulse"
                  style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }} />
              ))}
            </div>
          ) : buildings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border"
              style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
              <Building2 className="w-7 h-7" style={{ color: "#1e2536" }} />
              <p className="text-sm" style={{ color: "#475569" }}>No buildings yet. Add one to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {buildings.map((b) => {
                const { total, floors } = statsFor(b.id);
                const active = selectedBuilding?.id === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedBuilding(active ? null : b)}
                    className="rounded-xl border p-4 text-left flex flex-col gap-3 transition-all hover:border-indigo-500/40"
                    style={{
                      backgroundColor: active ? "#1a1040" : "#0d1117",
                      borderColor: active ? "#6366f1" : "#1e2536",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg"
                        style={{ backgroundColor: active ? "#6366f1" : "#1e1b4b" }}>
                        <Building2 className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white truncate">{b.name}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#64748b" }}>
                          <Layers className="w-3 h-3" />
                          {floors} fl.
                        </span>
                        <span className="flex items-center gap-1 text-xs" style={{ color: "#64748b" }}>
                          <Home className="w-3 h-3" />
                          {total} apt.
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Floor plan */}
        {selectedBuilding && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-white">
                Floor plan — {selectedBuilding.name}
              </h2>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}
              >
                {sortedFloors.length} floors
              </span>
            </div>

            {sortedFloors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 gap-2 rounded-xl border"
                style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
                <Home className="w-6 h-6" style={{ color: "#1e2536" }} />
                <p className="text-sm" style={{ color: "#475569" }}>No apartments in this building yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedFloors.map((floor) => (
                  <FloorRow key={floor} floor={floor} apartments={floorMap[floor]} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add building modal */}
      {showAddBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="w-full max-w-sm rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">Add building</h2>
              <button onClick={() => setShowAddBuilding(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddBuilding} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Building name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Block A"
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>
              {addBuildingError && (
                <p className="text-sm" style={{ color: "#fca5a5" }}>{addBuildingError}</p>
              )}
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddBuilding(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Cancel
                </button>
                <button type="submit" disabled={addingBuilding}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#6366f1" }}>
                  {addingBuilding ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</> : "Add building"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ── Floor row ─────────────────────────────────────────────────────────────────

function FloorRow({ floor, apartments }: { floor: number; apartments: Apartment[] }) {
  return (
    <div className="flex gap-3">
      {/* Floor label */}
      <div
        className="flex items-center justify-center w-12 rounded-lg shrink-0 text-xs font-bold"
        style={{ backgroundColor: "#0d1117", border: "1px solid #1e2536", color: "#475569" }}
      >
        {floor}
      </div>

      {/* Apartment cards */}
      <div className="flex flex-wrap gap-2 flex-1">
        {apartments
          .slice()
          .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
          .map((apt) => (
            <ApartmentCard key={apt.id} apt={apt} />
          ))}
      </div>
    </div>
  );
}

// ── Apartment card (floor plan) ───────────────────────────────────────────────

function ApartmentCard({ apt }: { apt: Apartment }) {
  const cfg = STATUS_CFG[apt.status] ?? STATUS_CFG.available;

  return (
    <div
      className="rounded-lg border p-3 flex flex-col gap-1.5 w-32 shrink-0 transition-colors"
      style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
    >
      {/* Number + status dot */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white font-mono">{apt.number}</span>
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: cfg.dot }}
          title={cfg.label}
        />
      </div>

      {/* Rooms + size */}
      <p className="text-xs" style={{ color: "#64748b" }}>
        {apt.rooms_count != null ? `${apt.rooms_count}br · ` : ""}
        {apt.size_m2} m²
      </p>

      {/* Price */}
      <p className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
        ${apt.price.toLocaleString()}
      </p>

      {/* Status badge */}
      <span
        className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium"
        style={{ backgroundColor: cfg.bg, color: cfg.text }}
      >
        {cfg.label}
      </span>
    </div>
  );
}
