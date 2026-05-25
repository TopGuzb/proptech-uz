// ─────────────────────────────────────────────────────────────────────────────
// app/vendor/dashboard/page.tsx
//
// Vendor portal — shows requests assigned to a specific vendor, with inline
// status transitions (assigned → in_progress → completed). For the MVP demo
// the vendor is picked via a top-level selector so any of the seeded vendors
// can be viewed quickly. In production the selector would be replaced by
// auth-based filtering on vendors.user_id.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Wrench, CheckCircle2, Clock, AlertTriangle, Phone, MapPin,
  PlayCircle, Flag, Star,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Vendor, MaintenanceRequest, RequestPriority, RequestStatus, RequestCategory,
} from "@/lib/types/database";

interface ApartmentInfo {
  id: string; number: string; floor: number;
  building: { name: string; project: { name: string } | null } | null;
}
interface ResidentInfo {
  id: string; full_name: string; phone: string | null;
}
interface VendorRequest extends MaintenanceRequest {
  apartment: ApartmentInfo | null;
  resident:  ResidentInfo  | null;
}

const PRIORITY_META: Record<RequestPriority, { label: string; bg: string; fg: string; rank: number }> = {
  emergency: { label: "ЧП",      bg: "rgba(239,68,68,0.18)",  fg: "#fca5a5", rank: 0 },
  high:      { label: "Срочно",  bg: "rgba(251,146,60,0.15)", fg: "#fdba74", rank: 1 },
  medium:    { label: "Обычно",  bg: "rgba(59,130,246,0.15)", fg: "#93c5fd", rank: 2 },
  low:       { label: "Низкая",  bg: "rgba(100,116,139,0.15)", fg: "#94a3b8", rank: 3 },
};

const STATUS_META: Record<RequestStatus, { label: string; bg: string; fg: string }> = {
  open:        { label: "Открыта",   bg: "rgba(251,191,36,0.12)", fg: "#fcd34d" },
  assigned:    { label: "Назначена", bg: "rgba(168,85,247,0.12)", fg: "#c4b5fd" },
  in_progress: { label: "В работе",  bg: "rgba(59,130,246,0.12)", fg: "#93c5fd" },
  completed:   { label: "Закрыта",   bg: "rgba(16,185,129,0.12)", fg: "#6ee7b7" },
  cancelled:   { label: "Отменена",  bg: "rgba(100,116,139,0.10)", fg: "#64748b" },
};

const CATEGORY_RU: Record<RequestCategory, string> = {
  plumbing:   "Сантехника",
  electrical: "Электрика",
  heating:    "Отопление",
  cleaning:   "Уборка",
  elevator:   "Лифт",
  appliance:  "Бытовая техника",
  structural: "Стройка",
  other:      "Другое",
};

export default function VendorDashboardPage() {
  const [vendors,        setVendors]        = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [requests,       setRequests]       = useState<VendorRequest[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState<"active" | "completed" | "all">("active");

  // 1. Load vendors + try to auto-pick by current user's email/user_id
  useEffect(() => {
    (async () => {
      const { data: vs } = await supabase
        .from("vendors")
        .select("*")
        .eq("is_active", true)
        .order("name");
      const list = (vs as Vendor[] | null) ?? [];
      setVendors(list);

      const { data: { user } } = await supabase.auth.getUser();
      let pick: string | null = null;
      if (user) {
        // Try by user_id first
        const byUid = list.find((v) => v.user_id === user.id);
        if (byUid) pick = byUid.id;
        else if (user.email) {
          const byEmail = list.find((v) => v.email && v.email.toLowerCase() === user.email!.toLowerCase());
          if (byEmail) pick = byEmail.id;
        }
      }
      setSelectedVendor(pick ?? list[0]?.id ?? "");
    })();
  }, []);

  // 2. Load this vendor's requests
  async function loadRequests() {
    if (!selectedVendor) { setRequests([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("maintenance_requests")
      .select(`
        *,
        apartment:apartments(id, number, floor, building:buildings(name, project:projects(name))),
        resident:residents(id, full_name, phone)
      `)
      .eq("assigned_vendor_id", selectedVendor)
      .order("created_at", { ascending: false });
    setRequests((data as VendorRequest[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { loadRequests(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedVendor]);

  const filtered = useMemo(() => {
    if (filter === "active")    return requests.filter((r) => r.status !== "completed" && r.status !== "cancelled");
    if (filter === "completed") return requests.filter((r) => r.status === "completed");
    return requests;
  }, [requests, filter]);

  const stats = useMemo(() => {
    let assigned = 0, inProg = 0, completed = 0, overdueCount = 0;
    const now = Date.now();
    for (const r of requests) {
      if (r.status === "assigned")    assigned++;
      if (r.status === "in_progress") inProg++;
      if (r.status === "completed")   completed++;
      if (r.sla_deadline && r.status !== "completed" && r.status !== "cancelled") {
        if (new Date(r.sla_deadline).getTime() < now) overdueCount++;
      }
    }
    return { assigned, inProg, completed, overdueCount };
  }, [requests]);

  async function changeStatus(id: string, status: RequestStatus) {
    setRequests((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch(`/api/pm/maintenance-requests/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
    await loadRequests();
  }

  const currentVendor = vendors.find((v) => v.id === selectedVendor);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#a78bfa" }}>
            Vendor Portal
          </p>
          <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Мои заявки
          </h1>
          {currentVendor && (
            <div className="flex items-center gap-3 mt-2 text-sm" style={{ color: "rgba(255,255,255,0.65)" }}>
              <span className="flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" style={{ color: "#fbbf24", fill: "#fbbf24" }} />
                {currentVendor.rating.toFixed(1)}
              </span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
              <span>{currentVendor.completed_jobs} работ выполнено</span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
              <span>{currentVendor.specializations.map((s) => CATEGORY_RU[s as RequestCategory] ?? s).join(", ")}</span>
            </div>
          )}
        </div>

        <label className="flex flex-col gap-1.5 min-w-[260px]">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Подрядчик
          </span>
          <select
            value={selectedVendor}
            onChange={(e) => setSelectedVendor(e.target.value)}
            className="rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {vendors.length === 0 && <option value="">—</option>}
            {vendors.map((v) => (
              <option key={v.id} value={v.id} style={{ backgroundColor: "#0d1117" }}>
                {v.name} · ★ {v.rating.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Назначено"   value={stats.assigned}     icon={Clock}            accent="#c4b5fd" />
        <Stat label="В работе"    value={stats.inProg}       icon={PlayCircle}       accent="#93c5fd" />
        <Stat label="Закрыто"     value={stats.completed}    icon={CheckCircle2}     accent="#34d399" />
        <Stat label="Просрочено"  value={stats.overdueCount} icon={AlertTriangle}    accent="#f87171" />
      </div>

      <div className="flex rounded-xl overflow-hidden w-fit" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <TabBtn active={filter === "active"}    onClick={() => setFilter("active")}>Активные ({requests.filter((r) => r.status !== "completed" && r.status !== "cancelled").length})</TabBtn>
        <TabBtn active={filter === "completed"} onClick={() => setFilter("completed")}>Закрытые ({stats.completed})</TabBtn>
        <TabBtn active={filter === "all"}       onClick={() => setFilter("all")}>Все ({requests.length})</TabBtn>
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
          <Wrench className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">
            {filter === "active" ? "Активных заявок нет." : filter === "completed" ? "Закрытых заявок нет." : "Заявок нет."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <RequestRow key={r.id} request={r} onStatusChange={changeStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Request row ──────────────────────────────────────────────────────────────

function RequestRow({
  request,
  onStatusChange,
}: {
  request: VendorRequest;
  onStatusChange: (id: string, s: RequestStatus) => void;
}) {
  const sMeta = STATUS_META[request.status];
  const pMeta = PRIORITY_META[request.priority];
  const overdue = request.sla_deadline
    && request.status !== "completed"
    && request.status !== "cancelled"
    && new Date(request.sla_deadline).getTime() < Date.now();

  const apartmentLabel = request.apartment
    ? `кв. ${request.apartment.number}${request.apartment.building ? ` · ${request.apartment.building.name}` : ""}`
    : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "#0d1117",
        border: `1px solid ${overdue ? "rgba(239,68,68,0.30)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base text-white font-semibold">{request.title}</p>
            <span
              className="text-[10px] px-2 py-0.5 rounded-md"
              style={{ backgroundColor: pMeta.bg, color: pMeta.fg }}
            >
              {pMeta.label}
            </span>
            {request.category && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-md"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
              >
                {CATEGORY_RU[request.category]}
              </span>
            )}
          </div>
          <p className="text-xs mt-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>
            {request.description}
          </p>
        </div>
        <span
          className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
          style={{ backgroundColor: sMeta.bg, color: sMeta.fg }}
        >
          {sMeta.label}
        </span>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-xs mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" }}>
        {apartmentLabel && (
          <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3" />{apartmentLabel}</span>
        )}
        {request.resident && (
          <span className="flex items-center gap-1.5">
            <Phone className="w-3 h-3" />{request.resident.full_name}
            {request.resident.phone && <span style={{ color: "rgba(255,255,255,0.4)" }}>· {request.resident.phone}</span>}
          </span>
        )}
        {request.sla_deadline && (
          <span
            className="flex items-center gap-1.5"
            style={{ color: overdue ? "#f87171" : "rgba(255,255,255,0.55)" }}
          >
            {overdue && <AlertTriangle className="w-3 h-3" />}
            <Clock className="w-3 h-3" />
            до {new Date(request.sla_deadline).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 mt-3">
        {(request.status === "open" || request.status === "assigned") && (
          <button
            onClick={() => onStatusChange(request.id, "in_progress")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)" }}
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Принять в работу
          </button>
        )}
        {request.status === "in_progress" && (
          <button
            onClick={() => onStatusChange(request.id, "completed")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-white"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
          >
            <Flag className="w-3.5 h-3.5" />
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Stat({
  label, value, icon: Icon, accent,
}: { label: string; value: number; icon: React.ElementType; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</p>
      </div>
      <p className="text-2xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
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
        backgroundColor: active ? "rgba(99,102,241,0.12)" : "transparent",
        color:           active ? "#c4b5fd" : "rgba(255,255,255,0.55)",
      }}
    >
      {children}
    </button>
  );
}
