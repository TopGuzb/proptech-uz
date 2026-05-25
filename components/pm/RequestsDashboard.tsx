// ─────────────────────────────────────────────────────────────────────────────
// components/pm/RequestsDashboard.tsx
//
// Shared list-+-filters view used both by PM (/pm/requests) and Dispatcher
// (/dispatcher/dashboard). Shows 4 metric cards, status/priority filters,
// search and a sortable table. Clicking a row opens RequestDetailDrawer.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Inbox, Loader, CheckCircle2, AlarmClock, Search, Loader2,
  ChevronRight, AlertTriangle, UserPlus,
} from "lucide-react";
import RequestDetailDrawer from "./RequestDetailDrawer";
import AssignVendorModal from "./AssignVendorModal";
import type { RequestPriority, RequestStatus, RequestCategory } from "@/lib/types/database";

interface ApiRequest {
  id:                     string;
  apartment_id:           string;
  building_id:            string | null;
  resident_id:            string | null;
  category:               RequestCategory | null;
  priority:               RequestPriority;
  status:                 RequestStatus;
  title:                  string;
  description:            string;
  assigned_vendor_id:     string | null;
  sla_deadline:           string | null;
  created_at:             string;
  completed_at:           string | null;
  apartment: {
    id: string; number: string; floor: number;
    building: { id: string; name: string; project: { id: string; name: string } | null } | null;
  } | null;
  resident: { id: string; full_name: string; phone: string | null; telegram_username: string | null } | null;
  assigned_vendor: { id: string; name: string; phone: string; specializations: string[] } | null;
}

const PRIORITY_COLOR: Record<RequestPriority, { bg: string; text: string; label: string; rank: number }> = {
  emergency: { bg: "rgba(239,68,68,0.18)",   text: "#fca5a5", label: "ЧП",       rank: 0 },
  high:      { bg: "rgba(251,146,60,0.15)",  text: "#fdba74", label: "Срочно",   rank: 1 },
  medium:    { bg: "rgba(59,130,246,0.15)",  text: "#93c5fd", label: "Обычная",  rank: 2 },
  low:       { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", label: "Низкая",   rank: 3 },
};

const STATUS_COLOR: Record<RequestStatus, { bg: string; text: string; label: string }> = {
  open:        { bg: "rgba(251,191,36,0.12)", text: "#fcd34d", label: "Открыта" },
  assigned:    { bg: "rgba(168,85,247,0.12)", text: "#c4b5fd", label: "Назначена" },
  in_progress: { bg: "rgba(59,130,246,0.12)", text: "#93c5fd", label: "В работе" },
  completed:   { bg: "rgba(16,185,129,0.12)", text: "#6ee7b7", label: "Закрыта" },
  cancelled:   { bg: "rgba(100,116,139,0.10)", text: "#64748b", label: "Отменена" },
};

const CATEGORY_RU: Record<string, string> = {
  plumbing:   "Сантехника",
  electrical: "Электрика",
  heating:    "Отопление",
  cleaning:   "Уборка",
  elevator:   "Лифт",
  appliance:  "Бытовая техника",
  structural: "Стройка",
  other:      "Другое",
};

interface Props {
  title:    string;
  subtitle: string;
  accent?:  string;
}

export default function RequestsDashboard({ title, subtitle, accent = "#10b981" }: Props) {
  const [loading,    setLoading]    = useState(true);
  const [requests,   setRequests]   = useState<ApiRequest[]>([]);
  const [statusF,    setStatusF]    = useState<"all" | RequestStatus>("all");
  const [priorityF,  setPriorityF]  = useState<"all" | RequestPriority>("all");
  const [search,     setSearch]     = useState("");
  const [now,        setNow]        = useState(Date.now());
  const [drawerId,   setDrawerId]   = useState<string | null>(null);
  const [assignFor,  setAssignFor]  = useState<ApiRequest | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/pm/maintenance-requests?limit=200", { cache: "no-store" });
    const json = await res.json();
    setRequests((json.requests as ApiRequest[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Tick every minute for SLA timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const metrics = useMemo(() => {
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    let open = 0, inProgress = 0, completedToday = 0, overdue = 0;
    for (const r of requests) {
      if (r.status === "open" || r.status === "assigned") open++;
      if (r.status === "in_progress") inProgress++;
      if (r.status === "completed" && r.completed_at && new Date(r.completed_at).getTime() >= startOfToday.getTime()) {
        completedToday++;
      }
      if (r.sla_deadline && r.status !== "completed" && r.status !== "cancelled") {
        if (new Date(r.sla_deadline).getTime() < now) overdue++;
      }
    }
    return { open, inProgress, completedToday, overdue };
  }, [requests, now]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests
      .filter((r) => statusF   === "all" || r.status   === statusF)
      .filter((r) => priorityF === "all" || r.priority === priorityF)
      .filter((r) => !q || r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      .sort((a, b) => {
        const pa = PRIORITY_COLOR[a.priority].rank;
        const pb = PRIORITY_COLOR[b.priority].rank;
        if (pa !== pb) return pa - pb;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [requests, statusF, priorityF, search]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
          Property Management
        </p>
        <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          {subtitle}
        </p>
      </header>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Inbox}         label="Открытых"        value={metrics.open}           accent="#fbbf24" />
        <MetricCard icon={Loader}        label="В работе"        value={metrics.inProgress}     accent="#3b82f6" />
        <MetricCard icon={CheckCircle2}  label="Завершено сегодня" value={metrics.completedToday} accent="#10b981" />
        <MetricCard icon={AlarmClock}    label="Просрочено SLA"  value={metrics.overdue}        accent="#ef4444" />
      </div>

      {/* Filters */}
      <div
        className="rounded-2xl p-4 flex flex-wrap items-end gap-3"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Поиск
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="По заголовку…"
              className="w-full rounded-xl pl-9 pr-3 py-2 text-sm text-white outline-none"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border:          "1px solid rgba(255,255,255,0.08)",
              }}
            />
          </div>
        </div>

        <FilterSelect
          label="Статус"
          value={statusF}
          onChange={(v) => setStatusF(v as "all" | RequestStatus)}
          options={[
            { value: "all",         label: "Все" },
            { value: "open",        label: "Открыта" },
            { value: "assigned",    label: "Назначена" },
            { value: "in_progress", label: "В работе" },
            { value: "completed",   label: "Закрыта" },
            { value: "cancelled",   label: "Отменена" },
          ]}
        />
        <FilterSelect
          label="Приоритет"
          value={priorityF}
          onChange={(v) => setPriorityF(v as "all" | RequestPriority)}
          options={[
            { value: "all",       label: "Все" },
            { value: "emergency", label: "ЧП" },
            { value: "high",      label: "Срочно" },
            { value: "medium",    label: "Обычная" },
            { value: "low",       label: "Низкая" },
          ]}
        />
      </div>

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {loading ? (
          <div className="py-12 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="py-12 text-center text-sm"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Нет заявок по выбранным фильтрам.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <Th>Приоритет</Th>
                  <Th>Заявка</Th>
                  <Th>Квартира</Th>
                  <Th>Жилец</Th>
                  <Th>Категория</Th>
                  <Th>Статус</Th>
                  <Th>Подрядчик</Th>
                  <Th>SLA</Th>
                  <Th>Создана</Th>
                  <Th>{""}</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <RequestRow
                    key={r.id}
                    request={r}
                    now={now}
                    onOpen={() => setDrawerId(r.id)}
                    onAssign={() => setAssignFor(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RequestDetailDrawer
        requestId={drawerId}
        onClose={() => setDrawerId(null)}
        onUpdated={load}
      />

      <AssignVendorModal
        open={!!assignFor}
        requestId={assignFor?.id ?? null}
        category={assignFor?.category ?? null}
        currentVendorId={assignFor?.assigned_vendor_id ?? null}
        onClose={() => setAssignFor(null)}
        onAssigned={load}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, value, accent,
}: { icon: React.ElementType; label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
          {label}
        </p>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${accent}1F`, border: `1px solid ${accent}3A` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <p className="text-3xl text-white mt-3" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[160px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl px-3 py-2 text-sm text-white outline-none"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          border:          "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ backgroundColor: "#0d1117" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left text-[10px] uppercase tracking-widest font-semibold px-4 py-3"
      style={{ color: "rgba(255,255,255,0.4)" }}
    >
      {children}
    </th>
  );
}

interface RowProps {
  request:  ApiRequest;
  now:      number;
  onOpen:   () => void;
  onAssign: () => void;
}
function RequestRow({ request: r, now, onOpen, onAssign }: RowProps) {
  const p = PRIORITY_COLOR[r.priority];
  const s = STATUS_COLOR[r.status];

  let slaCell: React.ReactNode = (
    <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
  );
  if (r.sla_deadline && r.status !== "completed" && r.status !== "cancelled") {
    const diff = new Date(r.sla_deadline).getTime() - now;
    const overdue = diff < 0;
    const absMin = Math.floor(Math.abs(diff) / 60_000);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    slaCell = (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold"
        style={{ color: overdue ? "#fca5a5" : "#6ee7b7" }}
      >
        {overdue && <AlertTriangle className="w-3 h-3" />}
        {overdue ? `−${h}ч ${m}м` : `${h}ч ${m}м`}
      </span>
    );
  }

  return (
    <tr
      className="transition-colors hover:bg-white/[0.03] cursor-pointer"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: p.bg, color: p.text }}
        >
          {p.label}
        </span>
      </td>
      <td className="px-4 py-3 max-w-xs">
        <p className="text-sm font-semibold text-white truncate">{r.title}</p>
        <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.5)" }}>
          {r.description}
        </p>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
        {r.apartment ? (
          <>
            <span className="text-white font-semibold">№{r.apartment.number}</span>
            <span style={{ color: "rgba(255,255,255,0.45)" }}> · эт. {r.apartment.floor}</span>
            {r.apartment.building && (
              <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                {r.apartment.building.name}
                {r.apartment.building.project ? ` / ${r.apartment.building.project.name}` : ""}
              </div>
            )}
          </>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
        {r.resident?.full_name ?? <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
        {r.category ? (CATEGORY_RU[r.category] ?? r.category) : <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>}
      </td>
      <td className="px-4 py-3">
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: s.bg, color: s.text }}
        >
          {s.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs">
        {r.assigned_vendor ? (
          <span className="text-white">{r.assigned_vendor.name}</span>
        ) : r.status === "completed" || r.status === "cancelled" ? (
          <span style={{ color: "rgba(255,255,255,0.35)" }}>—</span>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(); }}
            className="inline-flex items-center gap-1 text-[11px] font-semibold transition-colors hover:underline"
            style={{ color: "#34d399" }}
          >
            <UserPlus className="w-3 h-3" />
            Назначить
          </button>
        )}
      </td>
      <td className="px-4 py-3">{slaCell}</td>
      <td className="px-4 py-3 text-[11px] whitespace-nowrap" style={{ color: "rgba(255,255,255,0.5)" }}>
        {new Date(r.created_at).toLocaleDateString("ru-RU")}
      </td>
      <td className="px-4 py-3 text-right">
        <ChevronRight className="w-4 h-4 inline-block" style={{ color: "rgba(255,255,255,0.4)" }} />
      </td>
    </tr>
  );
}
