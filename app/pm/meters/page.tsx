// ─────────────────────────────────────────────────────────────────────────────
// app/pm/meters/page.tsx
//
// PM-facing meter inventory.
//   • Cascading project + building selector
//   • Table per apartment × meter type with last reading + last cost
//   • Highlights apartments with stale or missing readings (>45 days)
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { UZ_TARIFFS, type MeterType } from "@/lib/pm/tariffs";

interface Project   { id: string; name: string; }
interface Building  { id: string; name: string; project_id: string; }
interface Apartment { id: string; number: string; floor: number; building_id: string; }

interface MeterRow {
  id:           string;
  apartment_id: string;
  meter_type:   MeterType;
  unit:         string | null;
}

interface ReadingRow {
  meter_id:         string;
  reading_value:    number;
  reading_date:     string;
  consumption_diff: number | null;
  cost_amount:      number | null;
}

const TYPE_ORDER: MeterType[] = ["electricity", "gas", "water_cold", "water_hot", "heating"];

const ACCENT: Record<MeterType, string> = {
  electricity: "#fbbf24",
  gas:         "#f97316",
  water_cold:  "#3b82f6",
  water_hot:   "#ef4444",
  heating:     "#a855f7",
};

const STALE_DAYS = 45;

export default function PMMetersPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [buildings,    setBuildings]    = useState<Building[]>([]);
  const [apartments,   setApartments]   = useState<Apartment[]>([]);
  const [meters,       setMeters]       = useState<MeterRow[]>([]);
  const [readings,     setReadings]     = useState<ReadingRow[]>([]);
  const [selectedProj, setSelectedProj] = useState("");
  const [selectedBldg, setSelectedBldg] = useState("");
  const [loading,      setLoading]      = useState(true);

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

  useEffect(() => {
    if (!selectedProj) { setSelectedBldg(""); return; }
    const first = buildings.find((b) => b.project_id === selectedProj);
    setSelectedBldg(first?.id ?? "");
  }, [selectedProj, buildings]);

  const filteredBuildings = useMemo(
    () => buildings.filter((b) => b.project_id === selectedProj),
    [buildings, selectedProj],
  );

  useEffect(() => {
    if (!selectedBldg) { setApartments([]); setMeters([]); setReadings([]); setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: apts } = await supabase
        .from("apartments")
        .select("id, number, floor, building_id")
        .eq("building_id", selectedBldg)
        .order("floor", { ascending: false })
        .order("number");

      const aptList = (apts as Apartment[] | null) ?? [];
      setApartments(aptList);
      const aptIds = aptList.map((a) => a.id);
      if (aptIds.length === 0) { setMeters([]); setReadings([]); setLoading(false); return; }

      const { data: ms } = await supabase
        .from("utility_meters")
        .select("id, apartment_id, meter_type, unit")
        .in("apartment_id", aptIds)
        .eq("is_active", true);
      const meterList = (ms as MeterRow[] | null) ?? [];
      setMeters(meterList);

      const meterIds = meterList.map((m) => m.id);
      if (meterIds.length === 0) { setReadings([]); setLoading(false); return; }

      const { data: rs } = await supabase
        .from("meter_readings")
        .select("meter_id, reading_value, reading_date, consumption_diff, cost_amount")
        .in("meter_id", meterIds)
        .order("reading_date", { ascending: false });
      setReadings((rs as ReadingRow[] | null) ?? []);
      setLoading(false);
    })();
  }, [selectedBldg]);

  // index: latest reading per meter_id
  const latestByMeter = useMemo(() => {
    const map = new Map<string, ReadingRow>();
    for (const r of readings) {
      if (!map.has(r.meter_id)) map.set(r.meter_id, r);
    }
    return map;
  }, [readings]);

  const metersByApt = useMemo(() => {
    const map = new Map<string, Map<MeterType, MeterRow>>();
    for (const m of meters) {
      const inner = map.get(m.apartment_id) ?? new Map();
      inner.set(m.meter_type, m);
      map.set(m.apartment_id, inner);
    }
    return map;
  }, [meters]);

  const stats = useMemo(() => {
    const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
    let missing = 0, stale = 0, fresh = 0;
    for (const apt of apartments) {
      for (const t of TYPE_ORDER) {
        const m = metersByApt.get(apt.id)?.get(t);
        if (!m) { missing++; continue; }
        const r = latestByMeter.get(m.id);
        if (!r) { missing++; continue; }
        if (new Date(r.reading_date).getTime() < cutoff) stale++;
        else fresh++;
      }
    }
    return { missing, stale, fresh };
  }, [apartments, metersByApt, latestByMeter]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
          Property Management
        </p>
        <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Счётчики
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Показания по всем счётчикам выбранного здания
        </p>
      </header>

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Свежие"   value={stats.fresh}   accent="#34d399" />
        <SummaryCard label="Просрочены (>45 дней)" value={stats.stale}   accent="#fbbf24" />
        <SummaryCard label="Без показаний" value={stats.missing} accent="#ef4444" />
      </div>

      {loading ? (
        <div
          className="rounded-2xl p-12 flex items-center justify-center"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : apartments.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <Gauge className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">В выбранном здании нет квартир.</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <Th>Кв.</Th>
                  <Th>Этаж</Th>
                  {TYPE_ORDER.map((t) => (
                    <th
                      key={t}
                      className="px-3 py-3 text-[10px] uppercase tracking-widest font-medium text-left"
                      style={{ color: ACCENT[t] }}
                    >
                      {UZ_TARIFFS[t].label_ru}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {apartments.map((apt) => (
                  <tr key={apt.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-4 py-3 text-white font-medium">№{apt.number}</td>
                    <td className="px-4 py-3 text-white/55 text-xs">{apt.floor} эт.</td>
                    {TYPE_ORDER.map((t) => {
                      const m = metersByApt.get(apt.id)?.get(t);
                      const r = m ? latestByMeter.get(m.id) : undefined;
                      return (
                        <td key={t} className="px-3 py-3">
                          <MeterCell type={t} meter={m} reading={r} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function MeterCell({
  type, meter, reading,
}: { type: MeterType; meter?: MeterRow; reading?: ReadingRow }) {
  if (!meter || !reading) {
    return (
      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.25)" }}>—</span>
    );
  }

  const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
  const isStale = new Date(reading.reading_date).getTime() < cutoff;
  const unit = meter.unit ?? UZ_TARIFFS[type].unit;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className="text-white text-[13px] font-medium">
          {Number(reading.reading_value).toLocaleString("ru-RU")}
        </span>
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{unit}</span>
        {isStale && <AlertTriangle className="w-3 h-3" style={{ color: "#fbbf24" }} />}
      </div>
      <span className="text-[10px]" style={{ color: isStale ? "#fbbf24" : "rgba(255,255,255,0.45)" }}>
        {new Date(reading.reading_date).toLocaleDateString("ru-RU")}
        {reading.cost_amount != null && (
          <> · {Number(reading.cost_amount).toLocaleString("ru-RU")} сум</>
        )}
      </span>
    </div>
  );
}

interface SelectorProps {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean;
}
function Selector({ label, value, options, onChange, disabled }: SelectorProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[200px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none disabled:opacity-50"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ backgroundColor: "#0d1117" }}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</p>
      <p className="text-2xl text-white mt-2" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="px-4 py-3 text-[10px] uppercase tracking-widest font-medium text-left"
      style={{ color: "rgba(255,255,255,0.4)" }}
    >
      {children}
    </th>
  );
}
