// ─────────────────────────────────────────────────────────────────────────────
// components/pm/AssignVendorModal.tsx
//
// Lists active vendors filtered by category. One click assigns the vendor
// to the request via PATCH /api/pm/maintenance-requests/[id]. The vendor
// list is fetched lazily when the modal opens.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Search, Star, Phone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Vendor, RequestCategory } from "@/lib/types/database";

interface Props {
  open:        boolean;
  requestId:   string | null;
  category:    RequestCategory | null;
  currentVendorId?: string | null;
  onClose:     () => void;
  onAssigned:  () => void;
}

export default function AssignVendorModal({
  open, requestId, category, currentVendorId, onClose, onAssigned,
}: Props) {
  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch(""); setError(null);
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vendors")
        .select("*")
        .eq("is_active", true)
        .order("rating", { ascending: false });
      setVendors((data as Vendor[] | null) ?? []);
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      const matchSearch = !q || v.name.toLowerCase().includes(q) || v.phone.includes(q);
      const matchCat    = !category || v.specializations.includes(category);
      return matchSearch && matchCat;
    });
  }, [vendors, search, category]);

  // Vendors that match the category go first, others below
  const matchingCategory = filtered.filter((v) => !category || v.specializations.includes(category));
  const otherVendors     = category
    ? vendors.filter((v) => !v.specializations.includes(category) &&
        (!search.trim() || v.name.toLowerCase().includes(search.trim().toLowerCase())))
    : [];

  async function assign(vendorId: string) {
    if (!requestId) return;
    setSavingId(vendorId);
    setError(null);
    try {
      const res = await fetch(`/api/pm/maintenance-requests/${requestId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ assigned_vendor_id: vendorId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось назначить");
        return;
      }
      onAssigned();
      onClose();
    } finally {
      setSavingId(null);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60]"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        className="fixed top-1/2 left-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-full max-w-xl rounded-2xl"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.08)",
          maxHeight:       "85vh",
          overflow:        "hidden",
          display:         "flex",
          flexDirection:   "column",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div>
            <h2 className="text-xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              Назначить подрядчика
            </h2>
            {category && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                Категория: {CATEGORY_RU[category] ?? category}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Имя или телефон…"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border:          "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
        </div>

        <div className="px-6 py-4 overflow-y-auto" style={{ flex: 1 }}>
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: "rgba(255,255,255,0.4)" }}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : matchingCategory.length === 0 && otherVendors.length === 0 ? (
            <div
              className="rounded-xl p-6 text-sm text-center"
              style={{
                backgroundColor: "rgba(100,116,139,0.06)",
                border:          "1px dashed rgba(100,116,139,0.25)",
                color:           "rgba(255,255,255,0.4)",
              }}
            >
              Нет подходящих подрядчиков.
            </div>
          ) : (
            <div className="space-y-2">
              {matchingCategory.map((v) => (
                <VendorRow
                  key={v.id}
                  vendor={v}
                  saving={savingId === v.id}
                  isCurrent={v.id === currentVendorId}
                  matchesCategory
                  onAssign={() => assign(v.id)}
                />
              ))}

              {otherVendors.length > 0 && (
                <p
                  className="text-[10px] uppercase tracking-widest mt-4 mb-2"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  Другие подрядчики
                </p>
              )}
              {otherVendors.map((v) => (
                <VendorRow
                  key={v.id}
                  vendor={v}
                  saving={savingId === v.id}
                  isCurrent={v.id === currentVendorId}
                  matchesCategory={false}
                  onAssign={() => assign(v.id)}
                />
              ))}
            </div>
          )}

          {error && (
            <div
              className="mt-3 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border:          "1px solid rgba(239,68,68,0.25)",
                color:           "#fca5a5",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface RowProps {
  vendor:           Vendor;
  saving:           boolean;
  isCurrent:        boolean;
  matchesCategory:  boolean;
  onAssign:         () => void;
}
function VendorRow({ vendor, saving, isCurrent, matchesCategory, onAssign }: RowProps) {
  return (
    <div
      className="rounded-xl p-3 flex items-center gap-3"
      style={{
        backgroundColor: matchesCategory ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.03)",
        border:          `1px solid ${matchesCategory ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white truncate">{vendor.name}</p>
          {isCurrent && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}
            >
              Текущий
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" />
            {vendor.phone}
          </span>
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" style={{ color: "#fbbf24" }} />
            {vendor.rating.toFixed(1)} · {vendor.completed_jobs} работ
          </span>
        </div>
        {vendor.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {vendor.specializations.map((s) => (
              <span
                key={s}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  color:           "rgba(255,255,255,0.55)",
                }}
              >
                {CATEGORY_RU[s as RequestCategory] ?? s}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onAssign}
        disabled={saving || isCurrent}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white shrink-0 disabled:opacity-50"
        style={{ background: isCurrent
          ? "rgba(255,255,255,0.06)"
          : "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
      >
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : isCurrent ? <CheckCircle2 className="w-3.5 h-3.5" />
          : null}
        {isCurrent ? "Назначен" : "Назначить"}
      </button>
    </div>
  );
}

const CATEGORY_RU: Record<string, string> = {
  plumbing:   "Сантехника",
  electrical: "Электрика",
  heating:    "Отопление",
  cleaning:   "Уборка",
  elevator:   "Лифт",
  appliance:  "Бытовая техника",
  structural: "Строительные дефекты",
  other:      "Другое",
};
