// ─────────────────────────────────────────────────────────────────────────────
// app/pm/vendors/page.tsx
//
// PM-facing vendor directory.
//   • Search (name / phone)
//   • Filter by specialization
//   • Active / archived tabs
//   • Add new vendor (AddVendorModal)
//   • Click row → edit
//   • Inline rating editor (5-star)
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Star, Phone, Mail, MessageCircle, Loader2, HardHat, Edit2, ToggleRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Vendor, RequestCategory } from "@/lib/types/database";
import AddVendorModal from "@/components/pm/AddVendorModal";

const SPEC_RU: Record<RequestCategory, string> = {
  plumbing:   "Сантехника",
  electrical: "Электрика",
  heating:    "Отопление",
  cleaning:   "Уборка",
  elevator:   "Лифт",
  appliance:  "Бытовая техника",
  structural: "Стройдефекты",
  other:      "Другое",
};

const ALL_SPECS = Object.keys(SPEC_RU) as RequestCategory[];

export default function PMVendorsPage() {
  const [vendors,    setVendors]    = useState<Vendor[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [specFilter, setSpecFilter] = useState<RequestCategory | "all">("all");
  const [showActive, setShowActive] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<Vendor | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("vendors")
      .select("*")
      .order("rating", { ascending: false })
      .order("name");
    setVendors((data as Vendor[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (showActive ? !v.is_active : v.is_active) return false;
      if (specFilter !== "all" && !v.specializations.includes(specFilter)) return false;
      if (q && !v.name.toLowerCase().includes(q) && !v.phone.includes(q)) return false;
      return true;
    });
  }, [vendors, search, specFilter, showActive]);

  const stats = useMemo(() => {
    const active   = vendors.filter((v) => v.is_active).length;
    const archived = vendors.length - active;
    let avgRating  = 0;
    if (active > 0) {
      avgRating = vendors.filter((v) => v.is_active).reduce((s, v) => s + (v.rating || 0), 0) / active;
    }
    const totalJobs = vendors.reduce((s, v) => s + (v.completed_jobs || 0), 0);
    return { active, archived, avgRating, totalJobs };
  }, [vendors]);

  async function setRating(v: Vendor, rating: number) {
    const next = v.rating === rating ? 0 : rating;
    setVendors((rows) => rows.map((r) => (r.id === v.id ? { ...r, rating: next } : r)));
    await fetch(`/api/pm/vendors?id=${v.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ rating: next }),
    });
  }

  async function toggleActive(v: Vendor) {
    const next = !v.is_active;
    setVendors((rows) => rows.map((r) => (r.id === v.id ? { ...r, is_active: next } : r)));
    await fetch(`/api/pm/vendors?id=${v.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ is_active: next }),
    });
  }

  function openCreate() { setEditing(null);  setModalOpen(true); }
  function openEdit(v: Vendor) { setEditing(v); setModalOpen(true); }
  function onSaved(v: Vendor) {
    setVendors((rows) => {
      const exists = rows.some((r) => r.id === v.id);
      return exists ? rows.map((r) => (r.id === v.id ? v : r)) : [v, ...rows];
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
            Property Management
          </p>
          <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Подрядчики
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            База электриков, сантехников и сервисных бригад
          </p>
        </div>
        <button
          onClick={openCreate}
          className="rounded-xl px-4 py-2.5 text-sm text-white font-semibold flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          <Plus className="w-4 h-4" />
          Добавить
        </button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Активные"    value={String(stats.active)}              accent="#34d399" />
        <SummaryCard label="В архиве"    value={String(stats.archived)}            accent="rgba(255,255,255,0.5)" />
        <SummaryCard label="Средн. рейтинг" value={stats.avgRating.toFixed(1)}     accent="#fbbf24" />
        <SummaryCard label="Всего работ" value={String(stats.totalJobs)}           accent="#60a5fa" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <TabBtn active={showActive}  onClick={() => setShowActive(true)}>Активные</TabBtn>
          <TabBtn active={!showActive} onClick={() => setShowActive(false)}>Архив</TabBtn>
        </div>

        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Имя или телефон…"
            className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        <select
          value={specFilter}
          onChange={(e) => setSpecFilter(e.target.value as RequestCategory | "all")}
          className="rounded-xl px-3 py-2 text-sm text-white outline-none"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <option value="all">Все специализации</option>
          {ALL_SPECS.map((s) => (
            <option key={s} value={s}>{SPEC_RU[s]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div
          className="rounded-2xl p-12 flex items-center justify-center"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <HardHat className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">Подрядчиков нет. Добавь первого.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((v) => (
            <VendorCard
              key={v.id}
              vendor={v}
              onEdit={() => openEdit(v)}
              onRating={(r) => setRating(v, r)}
              onToggleActive={() => toggleActive(v)}
            />
          ))}
        </div>
      )}

      <AddVendorModal
        open={modalOpen}
        vendor={editing}
        onClose={() => setModalOpen(false)}
        onSaved={onSaved}
      />
    </div>
  );
}

// ── Vendor card ──────────────────────────────────────────────────────────────

interface CardProps {
  vendor: Vendor;
  onEdit: () => void;
  onRating: (r: number) => void;
  onToggleActive: () => void;
}
function VendorCard({ vendor, onEdit, onRating, onToggleActive }: CardProps) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "#0d1117",
        border:          "1px solid rgba(255,255,255,0.06)",
        opacity:         vendor.is_active ? 1 : 0.55,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-base text-white font-semibold truncate">{vendor.name}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>
            {vendor.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{vendor.email}</span>}
            {vendor.telegram_username && (
              <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{vendor.telegram_username}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <IconBtn onClick={onEdit} title="Редактировать"><Edit2 className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn onClick={onToggleActive} title={vendor.is_active ? "В архив" : "Восстановить"}>
            <ToggleRight className="w-3.5 h-3.5" />
          </IconBtn>
        </div>
      </div>

      {vendor.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {vendor.specializations.map((s) => (
            <span
              key={s}
              className="text-[10px] px-2 py-0.5 rounded"
              style={{
                backgroundColor: "rgba(16,185,129,0.08)",
                color:           "#6ee7b7",
                border:          "1px solid rgba(16,185,129,0.2)",
              }}
            >
              {SPEC_RU[s as RequestCategory] ?? s}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((r) => (
            <button
              key={r}
              onClick={() => onRating(r)}
              className="hover:scale-110 transition-transform"
              title={`Поставить ${r}`}
            >
              <Star
                className="w-4 h-4"
                style={{
                  color: r <= Math.round(vendor.rating) ? "#fbbf24" : "rgba(255,255,255,0.15)",
                  fill:  r <= Math.round(vendor.rating) ? "#fbbf24" : "transparent",
                }}
              />
            </button>
          ))}
          <span className="text-xs ml-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            {vendor.rating.toFixed(1)}
          </span>
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
          {vendor.completed_jobs} / {vendor.total_jobs || vendor.completed_jobs} работ
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</p>
      <p className="text-2xl text-white mt-1.5" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-sm transition-colors"
      style={{
        backgroundColor: active ? "rgba(16,185,129,0.10)" : "transparent",
        color:           active ? "#6ee7b7" : "rgba(255,255,255,0.55)",
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
      style={{ color: "rgba(255,255,255,0.55)" }}
    >
      {children}
    </button>
  );
}
