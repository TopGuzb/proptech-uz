// ─────────────────────────────────────────────────────────────────────────────
// app/pm/dashboard/page.tsx
//
// Property Management home. Shows:
//   • Project + building selectors (cascading)
//   • 4 metric cards: total apartments, active residents, open requests,
//     overdue invoices total
//   • <ResidentsChessboard> — visual grid of all apartments in the
//     selected building, colored by status. Clicking a cell opens
//     <ApartmentDetailDrawer>.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Home, Users, Wrench, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import ResidentsChessboard, { ChessboardApartment, ChessboardStatus } from "@/components/pm/ResidentsChessboard";
import ApartmentDetailDrawer from "@/components/pm/ApartmentDetailDrawer";
import ConsumptionAnomalies from "@/components/pm/ConsumptionAnomalies";

interface Project  { id: string; name: string; }
interface Building { id: string; name: string; project_id: string; }

interface RawApartment {
  id:          string;
  number:      string;
  floor:       number;
  size_m2:     number | null;
  rooms_count: number | null;
  building_id: string | null;
}

export default function PMDashboardPage() {
  const [loading,        setLoading]        = useState(true);
  const [projects,       setProjects]       = useState<Project[]>([]);
  const [buildings,      setBuildings]      = useState<Building[]>([]);
  const [selectedProj,   setSelectedProj]   = useState<string>("");
  const [selectedBldg,   setSelectedBldg]   = useState<string>("");
  const [apartments,     setApartments]     = useState<ChessboardApartment[]>([]);
  const [openDrawerId,   setOpenDrawerId]   = useState<string | null>(null);
  const [metrics,        setMetrics]        = useState({
    total_apartments:  0,
    active_residents:  0,
    open_requests:     0,
    overdue_amount:    0,
  });

  // Load project + building lists
  useEffect(() => {
    (async () => {
      const [{ data: projs }, { data: blds }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("buildings").select("id, name, project_id").order("name"),
      ]);
      setProjects((projs as Project[] | null) ?? []);
      setBuildings((blds as Building[] | null) ?? []);
      if (projs && projs.length > 0) setSelectedProj(projs[0].id);
    })();
  }, []);

  // Auto-pick first building when project changes
  useEffect(() => {
    if (!selectedProj) { setSelectedBldg(""); return; }
    const first = buildings.find((b) => b.project_id === selectedProj);
    setSelectedBldg(first?.id ?? "");
  }, [selectedProj, buildings]);

  const filteredBuildings = useMemo(
    () => buildings.filter((b) => b.project_id === selectedProj),
    [buildings, selectedProj]
  );

  // Load chessboard data for selected building
  useEffect(() => {
    if (!selectedBldg) {
      setApartments([]);
      setMetrics({ total_apartments: 0, active_residents: 0, open_requests: 0, overdue_amount: 0 });
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      const { data: apts } = await supabase
        .from("apartments")
        .select("id, number, floor, size_m2, rooms_count, building_id")
        .eq("building_id", selectedBldg)
        .order("floor", { ascending: false })
        .order("number");

      const aptList = (apts as RawApartment[] | null) ?? [];
      const aptIds  = aptList.map((a) => a.id);

      if (aptIds.length === 0) {
        setApartments([]);
        setMetrics({ total_apartments: 0, active_residents: 0, open_requests: 0, overdue_amount: 0 });
        setLoading(false);
        return;
      }

      const [{ data: residents }, { data: requests }, { data: invoices }] = await Promise.all([
        supabase
          .from("residents")
          .select("apartment_id, full_name")
          .in("apartment_id", aptIds)
          .eq("is_active", true),
        supabase
          .from("maintenance_requests")
          .select("apartment_id, priority, status")
          .in("apartment_id", aptIds)
          .in("status", ["open", "assigned", "in_progress"]),
        supabase
          .from("pm_invoices")
          .select("apartment_id, total_amount, status")
          .in("apartment_id", aptIds)
          .eq("status", "overdue"),
      ]);

      const residentByApt = new Map<string, string>();
      for (const r of (residents as { apartment_id: string; full_name: string }[] | null) ?? []) {
        residentByApt.set(r.apartment_id, r.full_name);
      }

      const requestsByApt = new Map<string, { hasEmergency: boolean; count: number }>();
      for (const req of (requests as { apartment_id: string; priority: string; status: string }[] | null) ?? []) {
        const cur = requestsByApt.get(req.apartment_id) ?? { hasEmergency: false, count: 0 };
        cur.count++;
        if (req.priority === "emergency") cur.hasEmergency = true;
        requestsByApt.set(req.apartment_id, cur);
      }

      const overdueByApt   = new Set<string>();
      let   overdueTotal   = 0;
      for (const inv of (invoices as { apartment_id: string; total_amount: number; status: string }[] | null) ?? []) {
        overdueByApt.add(inv.apartment_id);
        overdueTotal += Number(inv.total_amount) || 0;
      }

      const board: ChessboardApartment[] = aptList.map((a) => {
        const reqInfo  = requestsByApt.get(a.id);
        const isEmpty  = !residentByApt.has(a.id);
        let status: ChessboardStatus = "empty";
        if (!isEmpty) {
          if (reqInfo?.hasEmergency)         status = "emergency";
          else if (reqInfo && reqInfo.count) status = "open_request";
          else if (overdueByApt.has(a.id))   status = "overdue";
          else                               status = "ok";
        }
        return {
          id:            a.id,
          number:        a.number,
          floor:         a.floor,
          size_m2:       a.size_m2,
          rooms_count:   a.rooms_count,
          status,
          resident_name: residentByApt.get(a.id) ?? null,
        };
      });

      setApartments(board);
      setMetrics({
        total_apartments: aptList.length,
        active_residents: residentByApt.size,
        open_requests:    Array.from(requestsByApt.values()).reduce((s, x) => s + x.count, 0),
        overdue_amount:   overdueTotal,
      });
      setLoading(false);
    })();
  }, [selectedBldg]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
          Property Management
        </p>
        <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Обзор
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Управление жильцами, заявками, счетами и общим имуществом
        </p>
      </header>

      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <Selector
          label="Проект"
          value={selectedProj}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setSelectedProj}
        />
        <Selector
          label="Здание"
          value={selectedBldg}
          options={filteredBuildings.map((b) => ({ value: b.id, label: b.name }))}
          onChange={setSelectedBldg}
          disabled={filteredBuildings.length === 0}
        />
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={Home}        label="Квартир"           value={metrics.total_apartments.toString()}       accent="#10b981" />
        <MetricCard icon={Users}       label="Активных жильцов"  value={metrics.active_residents.toString()}       accent="#14b8a6" />
        <MetricCard icon={Wrench}      label="Открытых заявок"   value={metrics.open_requests.toString()}          accent="#fbbf24" />
        <MetricCard icon={AlertCircle} label="Просроченные счета" value={`${metrics.overdue_amount.toLocaleString("ru-RU")} UZS`} accent="#ef4444" />
      </div>

      {/* Chessboard */}
      <section>
        <h2 className="text-lg text-white mb-4" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
          Шахматка жильцов
        </h2>
        {loading ? (
          <div
            className="rounded-2xl p-12 flex items-center justify-center"
            style={{
              backgroundColor: "#0d1117",
              border:          "1px solid rgba(255,255,255,0.06)",
              color:           "rgba(255,255,255,0.4)",
            }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <ResidentsChessboard apartments={apartments} onSelect={setOpenDrawerId} />
        )}
      </section>

      {/* AI consumption anomalies */}
      {selectedBldg && <ConsumptionAnomalies buildingId={selectedBldg} />}

      <ApartmentDetailDrawer
        apartmentId={openDrawerId}
        onClose={() => setOpenDrawerId(null)}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface SelectorProps {
  label:    string;
  value:    string;
  options:  { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}
function Selector({ label, value, options, onChange, disabled }: SelectorProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[200px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all disabled:opacity-50"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ backgroundColor: "#0d1117" }}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

interface MetricProps {
  icon:   React.ElementType;
  label:  string;
  value:  string;
  accent: string;
}
function MetricCard({ icon: Icon, label, value, accent }: MetricProps) {
  return (
    <div
      className="rounded-2xl p-5 transition-all"
      style={{
        backgroundColor: "#0d1117",
        border:          "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${accent}1F`, border: `1px solid ${accent}3A` }}
        >
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</p>
      </div>
      <p className="text-2xl text-white mt-3" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}
