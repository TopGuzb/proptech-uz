"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import { Search, Home, ChevronDown, Plus, X, Loader2, Calculator } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApartmentStatus = "available" | "reserved" | "sold";

interface Apartment {
  id: string;
  number: string;
  floor: number;
  rooms_count: number | null;
  size_m2: number;
  price: number;
  status: ApartmentStatus;
}

interface ProjectOption { id: string; name: string; }
interface BuildingOption { id: string; name: string; project_id: string; }

interface CreateForm {
  project_id: string;
  building_id: string;
  number: string;
  rooms_count: string;   // "1" | "2" | "3" | "4"
  floor: string;
  size_m2: string;
  price: string;
  status: ApartmentStatus;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ApartmentStatus, { bg: string; text: string; label: string }> = {
  available: { bg: "#1e1b4b", text: "#a5b4fc", label: "Available" },
  reserved:  { bg: "#1c1003", text: "#fbbf24", label: "Reserved"  },
  sold:      { bg: "#052e16", text: "#34d399", label: "Sold"       },
};

const ALL_STATUSES: ApartmentStatus[] = ["available", "reserved", "sold"];

const STATUS_FILTER_OPTIONS = [
  { value: "all",       label: "All statuses" },
  { value: "available", label: "Available"    },
  { value: "reserved",  label: "Reserved"     },
  { value: "sold",      label: "Sold"         },
];

const ROOMS_OPTIONS = [
  { value: "1", label: "1 room"  },
  { value: "2", label: "2 rooms" },
  { value: "3", label: "3 rooms" },
  { value: "4", label: "4+ rooms" },
];

const EMPTY_FORM: CreateForm = {
  project_id: "", building_id: "", number: "",
  rooms_count: "2", floor: "", size_m2: "", price: "", status: "available",
};

// ── Helper ────────────────────────────────────────────────────────────────────

function inputStyle(focused = false): React.CSSProperties {
  return {
    backgroundColor: "#080b14",
    border: `1px solid ${focused ? "#6366f1" : "#1e2536"}`,
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApartmentsPage() {
  const [apartments, setApartments]   = useState<Apartment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ApartmentStatus>("all");
  const [updating, setUpdating]       = useState<Set<string>>(new Set());

  // Create modal state
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [projects, setProjects]       = useState<ProjectOption[]>([]);
  const [buildings, setBuildings]     = useState<BuildingOption[]>([]);

  // ── Fetch apartments ───────────────────────────────────────────────────────

  const fetchApartments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("apartments")
      .select("id, number, floor, rooms_count, size_m2, price, status")
      .order("floor", { ascending: true })
      .order("number", { ascending: true });
    if (e) setError(e.message);
    else setApartments((data as Apartment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchApartments(); }, [fetchApartments]);

  // ── Fetch projects + buildings for modal ───────────────────────────────────

  async function openCreateModal() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreate(true);

    const [projRes, bldRes] = await Promise.all([
      supabase.from("projects").select("id, name").order("name"),
      supabase.from("buildings").select("id, name, project_id").order("name"),
    ]);
    setProjects(projRes.data ?? []);
    setBuildings(bldRes.data ?? []);
  }

  const filteredBuildings = buildings.filter(
    (b) => !form.project_id || b.project_id === form.project_id
  );

  // ── Price per m² ──────────────────────────────────────────────────────────

  const pricePerM2 = (() => {
    const p = parseFloat(form.price);
    const s = parseFloat(form.size_m2);
    if (!isNaN(p) && !isNaN(s) && s > 0) return (p / s).toFixed(0);
    return null;
  })();

  // ── Status update ──────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, newStatus: ApartmentStatus) {
    setUpdating((prev) => new Set(prev).add(id));
    const { error: e } = await supabase.from("apartments").update({ status: newStatus }).eq("id", id);
    setUpdating((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (e) { setError(e.message); return; }
    setApartments((prev) => prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a)));
  }

  // ── Create apartment ───────────────────────────────────────────────────────

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const floor  = parseInt(form.floor);
    const size   = parseFloat(form.size_m2);
    const price  = parseFloat(form.price);

    if (!form.number.trim())       { setFormError("Unit number is required."); return; }
    if (isNaN(floor) || floor < 1) { setFormError("Floor must be a positive number."); return; }
    if (isNaN(size)  || size  <= 0) { setFormError("Size must be a positive number."); return; }
    if (isNaN(price) || price <= 0) { setFormError("Price must be a positive number."); return; }

    setSubmitting(true);

    const payload: Record<string, unknown> = {
      number:      form.number.trim(),
      rooms_count: parseInt(form.rooms_count),
      floor,
      size_m2:     size,
      price,
      status:      form.status,
    };
    if (form.project_id)  payload.project_id  = form.project_id;
    if (form.building_id) payload.building_id = form.building_id;

    const { error: insertError } = await supabase.from("apartments").insert(payload);
    setSubmitting(false);

    if (insertError) { setFormError(insertError.message); return; }

    setShowCreate(false);
    fetchApartments();
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = apartments.filter((a) => {
    const matchSearch  = !search || a.number.toLowerCase().includes(search.toLowerCase()) || String(a.floor).includes(search);
    const matchStatus  = statusFilter === "all" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = apartments.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {}
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white">Apartments</h1>
          <p className="text-xs" style={{ color: "#475569" }}>
            {loading ? "Loading…" : `${filtered.length} of ${apartments.length} units`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
            <Search className="w-3.5 h-3.5" style={{ color: "#475569" }} />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs text-white outline-none placeholder:text-slate-600 w-36"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-2 rounded-lg transition-opacity hover:opacity-80"
            style={{ backgroundColor: "#6366f1" }}
          >
            <Plus className="w-4 h-4" />
            New unit
          </button>
        </div>
      </header>

      <main className="px-6 py-6 w-full space-y-5">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Status filter pills */}
        <div className="flex items-center gap-3 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
            const active = statusFilter === value;
            const count  = value === "all" ? apartments.length : (counts[value] ?? 0);
            return (
              <button key={value}
                onClick={() => setStatusFilter(value as typeof statusFilter)}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  backgroundColor: active ? "#1e1b4b" : "transparent",
                  borderColor: active ? "#6366f1" : "#1e2536",
                  color: active ? "#a5b4fc" : "#64748b",
                }}>
                {label}
                <span className="inline-flex items-center justify-center rounded-full w-4 h-4 text-xs font-semibold"
                  style={{ backgroundColor: active ? "#6366f1" : "#1e2536", color: active ? "white" : "#475569" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: "#6366f1", borderTopColor: "transparent" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Home className="w-8 h-8" style={{ color: "#1e2536" }} />
              <p className="text-sm" style={{ color: "#475569" }}>No apartments match your filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2536" }}>
                    {["Number", "Floor", "Rooms", "Size (m²)", "Price (USD)", "$/m²", "Status", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium" style={{ color: "#475569" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((apt, i) => {
                    const cfg = STATUS_CONFIG[apt.status];
                    const isUpdating = updating.has(apt.id);
                    const ppm2 = apt.size_m2 > 0 ? Math.round(apt.price / apt.size_m2).toLocaleString() : "—";
                    return (
                      <tr key={apt.id} className="transition-colors hover:bg-white/[0.02]"
                        style={{ borderBottom: i < filtered.length - 1 ? "1px solid #1e2536" : undefined, opacity: isUpdating ? 0.6 : 1 }}>
                        <td className="px-5 py-3.5 text-sm font-semibold text-white font-mono">{apt.number}</td>
                        <td className="px-5 py-3.5 text-sm" style={{ color: "#94a3b8" }}>{apt.floor}</td>
                        <td className="px-5 py-3.5 text-sm" style={{ color: "#94a3b8" }}>
                          {apt.rooms_count != null ? `${apt.rooms_count}${apt.rooms_count >= 4 ? "+" : ""}` : "—"}
                        </td>
                        <td className="px-5 py-3.5 text-sm" style={{ color: "#94a3b8" }}>{apt.size_m2}</td>
                        <td className="px-5 py-3.5 text-sm font-medium text-white">${apt.price.toLocaleString()}</td>
                        <td className="px-5 py-3.5 text-xs font-mono" style={{ color: "#64748b" }}>${ppm2}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="relative inline-flex items-center">
                            <select value={apt.status} disabled={isUpdating}
                              onChange={(e) => handleStatusChange(apt.id, e.target.value as ApartmentStatus)}
                              className="appearance-none text-xs pr-6 pl-2.5 py-1.5 rounded-lg outline-none cursor-pointer disabled:cursor-not-allowed"
                              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536", color: "#64748b" }}>
                              {ALL_STATUSES.map((s) => (
                                <option key={s} value={s} style={{ backgroundColor: "#0d1117" }}>
                                  {STATUS_CONFIG[s].label}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1.5 pointer-events-none w-3 h-3" style={{ color: "#475569" }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Create apartment modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-lg rounded-2xl border p-6 max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">New apartment</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Row: project + building */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Project</label>
                  <div className="relative">
                    <select value={form.project_id}
                      onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value, building_id: "" }))}
                      className="w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-sm text-white outline-none"
                      style={inputStyle()}>
                      <option value="" style={{ backgroundColor: "#0d1117" }}>Select…</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id} style={{ backgroundColor: "#0d1117" }}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5" style={{ color: "#475569" }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Building</label>
                  <div className="relative">
                    <select value={form.building_id}
                      onChange={(e) => setForm((f) => ({ ...f, building_id: e.target.value }))}
                      className="w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-sm text-white outline-none"
                      style={inputStyle()}>
                      <option value="" style={{ backgroundColor: "#0d1117" }}>Select…</option>
                      {filteredBuildings.map((b) => (
                        <option key={b.id} value={b.id} style={{ backgroundColor: "#0d1117" }}>{b.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5" style={{ color: "#475569" }} />
                  </div>
                </div>
              </div>

              {/* Row: unit number + floor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Unit number</label>
                  <input type="text" required placeholder="e.g. A-214"
                    value={form.number}
                    onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={inputStyle()}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Floor</label>
                  <input type="number" required min={1} placeholder="e.g. 5"
                    value={form.floor}
                    onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={inputStyle()}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
              </div>

              {/* Row: rooms + status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Rooms</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {ROOMS_OPTIONS.map(({ value, label }) => (
                      <button key={value} type="button"
                        onClick={() => setForm((f) => ({ ...f, rooms_count: value }))}
                        className="py-2 rounded-lg text-xs font-medium border transition-colors"
                        style={{
                          backgroundColor: form.rooms_count === value ? "#1e1b4b" : "#080b14",
                          borderColor:     form.rooms_count === value ? "#6366f1" : "#1e2536",
                          color:           form.rooms_count === value ? "#a5b4fc" : "#64748b",
                        }}>
                        {value === "4" ? "4+" : value}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Status</label>
                  <div className="relative">
                    <select value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ApartmentStatus }))}
                      className="w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-sm text-white outline-none"
                      style={inputStyle()}>
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s} style={{ backgroundColor: "#0d1117" }}>
                          {STATUS_CONFIG[s].label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5" style={{ color: "#475569" }} />
                  </div>
                </div>
              </div>

              {/* Row: size + price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Size (m²)</label>
                  <input type="number" required min={1} step="0.1" placeholder="e.g. 65.5"
                    value={form.size_m2}
                    onChange={(e) => setForm((f) => ({ ...f, size_m2: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={inputStyle()}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Price (USD)</label>
                  <input type="number" required min={1} placeholder="e.g. 75000"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={inputStyle()}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
              </div>

              {/* Price per m² calculator */}
              <div
                className="flex items-center gap-2.5 rounded-lg px-4 py-3"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
              >
                <Calculator className="w-4 h-4 shrink-0" style={{ color: "#475569" }} />
                <span className="text-xs" style={{ color: "#64748b" }}>Price per m²:</span>
                {pricePerM2 ? (
                  <span className="text-sm font-semibold ml-auto" style={{ color: "#a5b4fc" }}>
                    ${pricePerM2} / m²
                  </span>
                ) : (
                  <span className="text-xs ml-auto" style={{ color: "#334155" }}>
                    Enter size and price
                  </span>
                )}
              </div>

              {formError && <p className="text-sm" style={{ color: "#fca5a5" }}>{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#6366f1" }}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Create apartment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
