"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FPFloor {
  id: string;
  floor_number: number;
}

export interface FPApartment {
  id: string;
  floor_id: string | null;
  number: string;
  rooms_count: number | null;
  size_m2: number;
  price: number;
  status: "available" | "reserved" | "sold";
}

export interface FPManager {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface FloorPlanProps {
  floors: FPFloor[];
  apartments: FPApartment[];
  managers?: FPManager[];
  onRefresh: () => void;
}

// ── Status config ─────────────────────────────────────────────────────────────

const S = {
  available: { bg: "#0f1535", border: "#6366f1", dot: "#6366f1", text: "#a5b4fc", label: "Свободна"       },
  reserved:  { bg: "#150d01", border: "#f59e0b", dot: "#f59e0b", text: "#fbbf24", label: "Забронирована"  },
  sold:      { bg: "#041a0e", border: "#10b981", dot: "#10b981", text: "#34d399", label: "Продана"        },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloorPlan({ floors, apartments, managers = [], onRefresh }: FloorPlanProps) {
  const [selected, setSelected] = useState<FPApartment | null>(null);
  const [saving,   setSaving]   = useState(false);

  // Sort floors top → bottom
  const sortedFloors = [...floors].sort((a, b) => b.floor_number - a.floor_number);

  function aptsFor(floorId: string) {
    return apartments
      .filter((a) => a.floor_id === floorId)
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }

  // ── Building-level stats ───────────────────────────────────────────────────

  const total     = apartments.length;
  const sold      = apartments.filter((a) => a.status === "sold").length;
  const reserved  = apartments.filter((a) => a.status === "reserved").length;
  const available = total - sold - reserved;
  const revenue   = apartments.filter((a) => a.status === "sold").reduce((s, a) => s + a.price, 0);

  // ── Status update ─────────────────────────────────────────────────────────

  async function updateStatus(aptId: string, status: "available" | "reserved" | "sold") {
    setSaving(true);
    const { error } = await supabase.from("apartments").update({ status }).eq("id", aptId);
    setSaving(false);
    if (!error) {
      setSelected((prev) => prev ? { ...prev, status } : null);
      onRefresh();
    }
  }

  async function assignManager(aptId: string, managerId: string) {
    await supabase.from("apartments").update({ assigned_manager_id: managerId }).eq("id", aptId);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Building overview bar */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        {/* Stats row */}
        <div className="flex items-center gap-6 mb-3">
          {[
            { label: "Всего",           value: total,     color: "white"   },
            { label: "Продано",         value: sold,      color: "#34d399" },
            { label: "Забронировано",   value: reserved,  color: "#fbbf24" },
            { label: "Свободно",        value: available, color: "#a5b4fc" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>{label}</p>
            </div>
          ))}
          {revenue > 0 && (
            <div className="text-center ml-auto">
              <p className="text-lg font-bold text-white">
                ${revenue >= 1_000_000 ? `${(revenue / 1_000_000).toFixed(1)}M` : `${(revenue / 1000).toFixed(0)}k`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Выручка</p>
            </div>
          )}
        </div>

        {/* Building progress bar */}
        {total > 0 && (
          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1e2536" }}>
            <div className="h-full flex">
              <div style={{ width: `${(sold / total) * 100}%`,     backgroundColor: "#10b981" }} className="transition-all" />
              <div style={{ width: `${(reserved / total) * 100}%`, backgroundColor: "#f59e0b" }} className="transition-all" />
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-5 mt-2.5">
          {(["sold", "reserved", "available"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: S[s].dot }} />
              <span className="text-xs" style={{ color: "#64748b" }}>{S[s].label}</span>
            </div>
          ))}
          <span className="ml-auto text-xs" style={{ color: "#334155" }}>
            {total > 0 ? `${Math.round((sold / total) * 100)}% продано` : "Нет квартир"}
          </span>
        </div>
      </div>

      {/* Floor rows */}
      {sortedFloors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 rounded-xl border"
          style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
          <p className="text-sm" style={{ color: "#475569" }}>Добавьте этажи для отображения плана</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedFloors.map((floor) => {
            const floorApts = aptsFor(floor.id);
            const fSold     = floorApts.filter((a) => a.status === "sold").length;
            const fReserved = floorApts.filter((a) => a.status === "reserved").length;
            const fTotal    = floorApts.length;
            const fPct      = fTotal > 0 ? Math.round((fSold / fTotal) * 100) : 0;

            return (
              <div key={floor.id} className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: "#080b14", borderColor: "#1e2536" }}>
                {/* Floor header */}
                <div className="flex items-center justify-between px-4 py-2 border-b"
                  style={{ borderColor: "#0d1117" }}>
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold shrink-0"
                      style={{ backgroundColor: "#0d1117", color: "#6366f1" }}
                    >
                      {floor.floor_number}
                    </div>
                    <span className="text-xs" style={{ color: "#475569" }}>
                      Этаж {floor.floor_number}
                      {fTotal > 0 && ` · ${fSold}/${fTotal} продано`}
                    </span>
                  </div>
                  {/* Floor mini progress bar */}
                  {fTotal > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1e2536" }}>
                        <div className="h-full flex">
                          <div style={{ width: `${(fSold / fTotal) * 100}%`,     backgroundColor: "#10b981" }} />
                          <div style={{ width: `${(fReserved / fTotal) * 100}%`, backgroundColor: "#f59e0b" }} />
                        </div>
                      </div>
                      <span className="text-xs font-mono w-7 text-right" style={{ color: "#334155" }}>
                        {fPct}%
                      </span>
                    </div>
                  )}
                </div>

                {/* Apartment cards */}
                <div className="p-3">
                  {floorApts.length === 0 ? (
                    <p className="text-xs text-center py-3" style={{ color: "#334155" }}>
                      Нет квартир на этом этаже
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {floorApts.map((apt) => {
                        const cfg = S[apt.status];
                        return (
                          <button
                            key={apt.id}
                            onClick={() => setSelected(apt)}
                            className="rounded-lg border p-2.5 flex flex-col gap-1 w-28 text-left transition-all hover:scale-[1.03] hover:shadow-lg active:scale-100"
                            style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                          >
                            {/* Number + dot */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold font-mono" style={{ color: cfg.text }}>
                                {apt.number}
                              </span>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: cfg.dot }} />
                            </div>
                            {/* Rooms + size */}
                            <p className="text-xs leading-tight" style={{ color: cfg.text, opacity: 0.75 }}>
                              {apt.rooms_count != null ? `${apt.rooms_count}к` : ""}
                              {apt.rooms_count != null && apt.size_m2 > 0 ? " · " : ""}
                              {apt.size_m2 > 0 ? `${apt.size_m2}м²` : ""}
                            </p>
                            {/* Price */}
                            {apt.price > 0 && (
                              <p className="text-xs font-semibold" style={{ color: cfg.text }}>
                                ${apt.price >= 1000 ? `${(apt.price / 1000).toFixed(0)}k` : apt.price}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Apartment detail popup ── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-sm rounded-2xl border"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "#1e2536" }}>
              <div>
                <h3 className="text-base font-bold text-white">
                  Квартира {selected.number}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  {selected.rooms_count != null ? `${selected.rooms_count}-комн.` : ""}
                  {selected.rooms_count != null && selected.size_m2 > 0 ? " · " : ""}
                  {selected.size_m2 > 0 ? `${selected.size_m2} м²` : ""}
                </p>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-0">
              {[
                { label: "Цена",        value: selected.price > 0 ? `$${selected.price.toLocaleString()}` : "—" },
                { label: "Цена за м²",  value: selected.size_m2 > 0 && selected.price > 0 ? `$${Math.round(selected.price / selected.size_m2).toLocaleString()}` : "—" },
                { label: "Площадь",     value: selected.size_m2 > 0 ? `${selected.size_m2} м²` : "—" },
              ].map(({ label, value }, i, arr) => (
                <div key={label}
                  className="flex justify-between items-center py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid #1e2536" : undefined }}>
                  <span className="text-xs" style={{ color: "#64748b" }}>{label}</span>
                  <span className="text-sm font-medium text-white">{value}</span>
                </div>
              ))}
            </div>

            {/* Status change */}
            <div className="px-5 pb-4">
              <p className="text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>Статус</p>
              <div className="grid grid-cols-3 gap-2">
                {(["available", "reserved", "sold"] as const).map((s) => {
                  const cfg    = S[s];
                  const active = selected.status === s;
                  return (
                    <button key={s}
                      disabled={saving}
                      onClick={() => updateStatus(selected.id, s)}
                      className="py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: active ? cfg.bg    : "#080b14",
                        borderColor:     active ? cfg.border : "#1e2536",
                        color:           active ? cfg.text  : "#475569",
                      }}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Assign to manager */}
            {managers.length > 0 && (
              <div className="px-5 pb-4">
                <p className="text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>Назначить менеджеру</p>
                <div className="relative">
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && assignManager(selected.id, e.target.value)}
                    className="w-full appearance-none rounded-lg px-3 py-2.5 pr-8 text-sm text-white outline-none"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  >
                    <option value="" style={{ backgroundColor: "#0d1117" }}>Выбрать менеджера…</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id} style={{ backgroundColor: "#0d1117" }}>
                        {m.full_name ?? m.email ?? m.id}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5"
                    style={{ color: "#475569" }} />
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <button onClick={() => setSelected(null)}
                className="w-full py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
