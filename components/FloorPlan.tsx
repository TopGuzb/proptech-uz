"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { X, ChevronDown, User, Loader2, ArrowRight } from "lucide-react";

// ── Internal types ─────────────────────────────────────────────────────────────

interface Floor {
  id: string;
  floor_number: number;
}

interface Apartment {
  id: string;
  floor_id: string | null;
  number: string;
  rooms_count: number | null;
  size_m2: number;
  price: number;
  status: "available" | "reserved" | "sold";
  client_id: string | null;
}

interface Manager {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface LinkedBuyer {
  id: string;
  full_name: string;
  phone: string | null;
  assigned_to: string | null;
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface FloorPlanProps {
  building_id: string;
  /** Increment to force a re-fetch from the parent (e.g. after bulk generate) */
  refreshKey?: number;
}

// ── Status config ──────────────────────────────────────────────────────────────

const S = {
  available: { bg: "#0f1535", border: "#6366f1", dot: "#6366f1", text: "#a5b4fc", label: "Свободна"      },
  reserved:  { bg: "#150d01", border: "#f59e0b", dot: "#f59e0b", text: "#fbbf24", label: "Забронирована" },
  sold:      { bg: "#041a0e", border: "#10b981", dot: "#10b981", text: "#34d399", label: "Продана"       },
} as const;

// ── Component ──────────────────────────────────────────────────────────────────

export default function FloorPlan({ building_id, refreshKey }: FloorPlanProps) {
  const router = useRouter();

  const [floors,     setFloors]     = useState<Floor[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  const [managers,   setManagers]   = useState<Manager[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [selected,     setSelected]     = useState<Apartment | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [linkedBuyer,  setLinkedBuyer]  = useState<LinkedBuyer | null>(null);
  const [loadingBuyer, setLoadingBuyer] = useState(false);

  // ── Fetch all data ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [floorsRes, aptsRes, mgrsRes] = await Promise.all([
      supabase
        .from("floors")
        .select("id, floor_number")
        .eq("building_id", building_id)
        .order("floor_number"),
      supabase
        .from("apartments")
        .select("id, floor_id, number, rooms_count, size_m2, price, status, client_id")
        .eq("building_id", building_id),
      supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .eq("role", "manager"),
    ]);
    setFloors((floorsRes.data as Floor[]) ?? []);
    setApartments((aptsRes.data as Apartment[]) ?? []);
    setManagers((mgrsRes.data as Manager[]) ?? []);
    setLoading(false);
  }, [building_id]);

  // Re-fetch on building change or when parent increments refreshKey
  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // ── Fetch linked buyer when popup opens ───────────────────────────────────

  useEffect(() => {
    if (!selected?.client_id || selected.status === "available") {
      setLinkedBuyer(null);
      return;
    }
    setLoadingBuyer(true);
    supabase
      .from("clients")
      .select("id, full_name, phone, assigned_to")
      .eq("id", selected.client_id)
      .single()
      .then(({ data }) => {
        setLinkedBuyer((data as LinkedBuyer) ?? null);
        setLoadingBuyer(false);
      });
  }, [selected?.id, selected?.client_id, selected?.status]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const sortedFloors = [...floors].sort((a, b) => b.floor_number - a.floor_number);

  function aptsFor(floorId: string) {
    return apartments
      .filter((a) => a.floor_id === floorId)
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  }

  const total     = apartments.length;
  const sold      = apartments.filter((a) => a.status === "sold").length;
  const reserved  = apartments.filter((a) => a.status === "reserved").length;
  const available = total - sold - reserved;
  const revenue   = apartments
    .filter((a) => a.status === "sold")
    .reduce((s, a) => s + a.price, 0);

  // ── Status update ─────────────────────────────────────────────────────────

  async function updateStatus(aptId: string, status: "available" | "reserved" | "sold") {
    setSaving(true);
    const { error } = await supabase.from("apartments").update({ status }).eq("id", aptId);
    setSaving(false);
    if (!error) {
      setSelected((prev) => prev ? { ...prev, status } : null);
      // Update local state immediately — no full re-fetch needed
      setApartments((prev) => prev.map((a) => a.id === aptId ? { ...a, status } : a));
    }
  }

  async function assignManager(aptId: string, managerId: string) {
    await supabase.from("apartments").update({ assigned_manager_id: managerId }).eq("id", aptId);
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Building stats bar ── */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        <div className="flex items-center gap-6 mb-3 flex-wrap">
          {[
            { label: "Всего",         value: total,     color: "white"   },
            { label: "Продано",       value: sold,      color: "#34d399" },
            { label: "Забронировано", value: reserved,  color: "#fbbf24" },
            { label: "Свободно",      value: available, color: "#a5b4fc" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-lg font-bold" style={{ color }}>{value}</p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>{label}</p>
            </div>
          ))}
          {revenue > 0 && (
            <div className="text-center ml-auto">
              <p className="text-lg font-bold text-white">
                ${revenue >= 1_000_000
                  ? `${(revenue / 1_000_000).toFixed(1)}M`
                  : `${(revenue / 1000).toFixed(0)}k`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Выручка</p>
            </div>
          )}
        </div>

        {/* Overall progress bar */}
        {total > 0 && (
          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#1e2536" }}>
            <div className="h-full flex">
              <div
                className="transition-all"
                style={{ width: `${(sold / total) * 100}%`, backgroundColor: "#10b981" }}
              />
              <div
                className="transition-all"
                style={{ width: `${(reserved / total) * 100}%`, backgroundColor: "#f59e0b" }}
              />
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

      {/* ── Floor rows ── */}
      {sortedFloors.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-14 gap-3 rounded-xl border"
          style={{ borderColor: "#1e2536", borderStyle: "dashed" }}
        >
          <p className="text-sm" style={{ color: "#475569" }}>
            Нет этажей. Добавьте вручную или используйте массовое создание.
          </p>
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
              <div
                key={floor.id}
                className="rounded-xl border overflow-hidden"
                style={{ backgroundColor: "#080b14", borderColor: "#1e2536" }}
              >
                {/* Floor header */}
                <div
                  className="flex items-center justify-between px-4 py-2 border-b"
                  style={{ borderColor: "#0d1117" }}
                >
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
                  {/* Floor mini progress */}
                  {fTotal > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="w-20 h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: "#1e2536" }}
                      >
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
                            className="rounded-lg border p-2.5 flex flex-col gap-1 w-[4.5rem] text-left transition-all hover:scale-[1.04] hover:shadow-lg active:scale-100"
                            style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
                          >
                            {/* Number + status dot */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold font-mono leading-none" style={{ color: cfg.text }}>
                                {apt.number}
                              </span>
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: cfg.dot }}
                              />
                            </div>
                            {/* Rooms + size */}
                            <p
                              className="text-[10px] leading-tight"
                              style={{ color: cfg.text, opacity: 0.75 }}
                            >
                              {apt.rooms_count != null ? `${apt.rooms_count}к` : ""}
                              {apt.rooms_count != null && apt.size_m2 > 0 ? "·" : ""}
                              {apt.size_m2 > 0 ? `${apt.size_m2}м²` : ""}
                            </p>
                            {/* Price */}
                            {apt.price > 0 && (
                              <p className="text-[10px] font-semibold leading-none" style={{ color: cfg.text }}>
                                ${apt.price >= 1000
                                  ? `${(apt.price / 1000).toFixed(0)}k`
                                  : apt.price}
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
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border overflow-y-auto max-h-[90vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b sticky top-0"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
            >
              <div>
                <h3 className="text-base font-bold text-white">Квартира {selected.number}</h3>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  {selected.rooms_count != null ? `${selected.rooms_count}-комн.` : ""}
                  {selected.rooms_count != null && selected.size_m2 > 0 ? " · " : ""}
                  {selected.size_m2 > 0 ? `${selected.size_m2} м²` : ""}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: "#475569" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Details */}
            <div className="px-5 py-4 space-y-0">
              {[
                {
                  label: "Цена",
                  value: selected.price > 0 ? `$${selected.price.toLocaleString()}` : "—",
                },
                {
                  label: "Цена за м²",
                  value: selected.size_m2 > 0 && selected.price > 0
                    ? `$${Math.round(selected.price / selected.size_m2).toLocaleString()}`
                    : "—",
                },
                {
                  label: "Площадь",
                  value: selected.size_m2 > 0 ? `${selected.size_m2} м²` : "—",
                },
              ].map(({ label, value }, i, arr) => (
                <div
                  key={label}
                  className="flex justify-between items-center py-2.5"
                  style={{ borderBottom: i < arr.length - 1 ? "1px solid #1e2536" : undefined }}
                >
                  <span className="text-xs" style={{ color: "#64748b" }}>{label}</span>
                  <span className="text-sm font-medium text-white">{value}</span>
                </div>
              ))}
            </div>

            {/* Status buttons */}
            <div className="px-5 pb-4">
              <p className="text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>Статус</p>
              <div className="grid grid-cols-3 gap-2">
                {(["available", "reserved", "sold"] as const).map((s) => {
                  const cfg    = S[s];
                  const active = selected.status === s;
                  return (
                    <button
                      key={s}
                      disabled={saving}
                      onClick={() => updateStatus(selected.id, s)}
                      className="py-2 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
                      style={{
                        backgroundColor: active ? cfg.bg     : "#080b14",
                        borderColor:     active ? cfg.border : "#1e2536",
                        color:           active ? cfg.text   : "#475569",
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Linked buyer */}
            {(selected.status === "sold" || selected.status === "reserved") && (
              <div className="px-5 pb-4 border-t pt-4" style={{ borderColor: "#1e2536" }}>
                <p className="text-xs font-medium mb-2.5" style={{ color: "#94a3b8" }}>Покупатель</p>
                {loadingBuyer ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#6366f1" }} />
                    <span className="text-xs" style={{ color: "#475569" }}>Загрузка…</span>
                  </div>
                ) : linkedBuyer ? (
                  <div className="space-y-2">
                    <div
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}
                      >
                        {linkedBuyer.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">{linkedBuyer.full_name}</p>
                        {linkedBuyer.phone && (
                          <p className="text-xs truncate" style={{ color: "#64748b" }}>{linkedBuyer.phone}</p>
                        )}
                        {linkedBuyer.assigned_to && (() => {
                          const mgr = managers.find((m) => m.id === linkedBuyer.assigned_to);
                          return mgr ? (
                            <p className="text-xs truncate" style={{ color: "#475569" }}>
                              Менеджер: {mgr.full_name ?? mgr.email}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>
                    <button
                      onClick={() => router.push(`/clients/${linkedBuyer.id}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-colors hover:border-indigo-500/40"
                      style={{ borderColor: "#1e2536", color: "#a5b4fc", backgroundColor: "#0f0a30" }}
                    >
                      <User className="w-3 h-3" />
                      Открыть профиль клиента
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "#334155" }}>
                    {selected.client_id ? "Клиент не найден" : "Клиент не привязан"}
                  </p>
                )}
              </div>
            )}

            {/* Assign manager */}
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
                  <ChevronDown
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3.5 h-3.5"
                    style={{ color: "#475569" }}
                  />
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <button
                onClick={() => setSelected(null)}
                className="w-full py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
