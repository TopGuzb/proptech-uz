// ─────────────────────────────────────────────────────────────────────────────
// app/pm/residents/page.tsx
//
// Residents directory. Search by name/phone/email, filter by project /
// building / type. "Открыть" launches the same <ApartmentDetailDrawer> used
// by the chessboard, so the PM has one consistent way to view a unit.
// "+ Добавить жильца" opens <AddResidentModal>.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Loader2, Phone, Mail, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import AddResidentModal from "@/components/pm/AddResidentModal";
import ApartmentDetailDrawer from "@/components/pm/ApartmentDetailDrawer";
import type { ResidentType } from "@/lib/types/database";

interface Project   { id: string; name: string; }
interface Building  { id: string; name: string; project_id: string; }

interface Row {
  id:                 string;
  full_name:          string;
  phone:              string | null;
  email:              string | null;
  telegram_username:  string | null;
  resident_type:      ResidentType;
  apartment_id:       string;
  apartment_number:   string;
  apartment_floor:    number;
  building_id:        string | null;
  building_name:      string | null;
  project_id:         string | null;
  project_name:       string | null;
  open_request_count: number;
}

const TYPE_RU: Record<ResidentType, string> = {
  owner:  "Собственник",
  tenant: "Арендатор",
  family: "Член семьи",
};

const TYPE_COLOR: Record<ResidentType, { bg: string; text: string }> = {
  owner:  { bg: "rgba(16,185,129,0.12)", text: "#6ee7b7" },
  tenant: { bg: "rgba(59,130,246,0.12)", text: "#93c5fd" },
  family: { bg: "rgba(168,85,247,0.12)", text: "#c4b5fd" },
};

export default function ResidentsPage() {
  const [loading,   setLoading]   = useState(true);
  const [rows,      setRows]      = useState<Row[]>([]);
  const [projects,  setProjects]  = useState<Project[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);

  const [filterProject,  setFilterProject]  = useState<string>("");
  const [filterBuilding, setFilterBuilding] = useState<string>("");
  const [filterType,     setFilterType]     = useState<string>("");
  const [search,         setSearch]         = useState<string>("");

  const [addOpen,    setAddOpen]    = useState(false);
  const [drawerId,   setDrawerId]   = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [{ data: projs }, { data: blds }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("buildings").select("id, name, project_id").order("name"),
      ]);
      setProjects((projs as Project[] | null) ?? []);
      setBuildings((blds as Building[] | null) ?? []);

      const { data: residents } = await supabase
        .from("residents")
        .select(`
          id, full_name, phone, email, telegram_username, resident_type, apartment_id,
          apartment:apartments (
            id, number, floor, building_id,
            building:buildings (
              id, name, project_id,
              project:projects ( id, name )
            )
          )
        `)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      const list = (residents as unknown as RawResident[] | null) ?? [];
      const aptIds = list.map((r) => r.apartment_id);

      const requestCountByApt = new Map<string, number>();
      if (aptIds.length > 0) {
        const { data: openReqs } = await supabase
          .from("maintenance_requests")
          .select("apartment_id, status")
          .in("apartment_id", aptIds)
          .in("status", ["open", "assigned", "in_progress"]);
        for (const r of (openReqs as { apartment_id: string }[] | null) ?? []) {
          requestCountByApt.set(r.apartment_id, (requestCountByApt.get(r.apartment_id) ?? 0) + 1);
        }
      }

      const mapped: Row[] = list.map((r) => ({
        id:                 r.id,
        full_name:          r.full_name,
        phone:              r.phone,
        email:              r.email,
        telegram_username:  r.telegram_username,
        resident_type:      r.resident_type,
        apartment_id:       r.apartment_id,
        apartment_number:   r.apartment?.number ?? "—",
        apartment_floor:    r.apartment?.floor  ?? 0,
        building_id:        r.apartment?.building?.id          ?? null,
        building_name:      r.apartment?.building?.name        ?? null,
        project_id:         r.apartment?.building?.project?.id   ?? null,
        project_name:       r.apartment?.building?.project?.name ?? null,
        open_request_count: requestCountByApt.get(r.apartment_id) ?? 0,
      }));

      setRows(mapped);
      setLoading(false);
    })();
  }, [reloadTick]);

  const filteredBuildings = useMemo(
    () => filterProject ? buildings.filter((b) => b.project_id === filterProject) : buildings,
    [buildings, filterProject]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterProject  && r.project_id  !== filterProject)  return false;
      if (filterBuilding && r.building_id !== filterBuilding) return false;
      if (filterType     && r.resident_type !== filterType)   return false;
      if (q) {
        const haystack = [r.full_name, r.phone ?? "", r.email ?? "", r.telegram_username ?? ""]
          .join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterProject, filterBuilding, filterType, search]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
            Property Management
          </p>
          <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Жильцы
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            {visible.length} {pluralize(visible.length, ["жилец", "жильца", "жильцов"])}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          <Plus className="w-4 h-4" />
          Добавить жильца
        </button>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <SearchBox value={search} onChange={setSearch} />
        <FilterSelect
          label="Проект"
          value={filterProject}
          onChange={(v) => { setFilterProject(v); setFilterBuilding(""); }}
          options={[{ value: "", label: "Все" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <FilterSelect
          label="Здание"
          value={filterBuilding}
          onChange={setFilterBuilding}
          options={[{ value: "", label: "Все" }, ...filteredBuildings.map((b) => ({ value: b.id, label: b.name }))]}
        />
        <FilterSelect
          label="Тип"
          value={filterType}
          onChange={setFilterType}
          options={[
            { value: "",       label: "Все" },
            { value: "owner",  label: "Собственник" },
            { value: "tenant", label: "Арендатор" },
            { value: "family", label: "Член семьи" },
          ]}
        />
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {loading ? (
          <div className="p-12 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Жильцы не найдены
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <Th>ФИО</Th>
                  <Th>Контакты</Th>
                  <Th>Тип</Th>
                  <Th>Квартира</Th>
                  <Th>Здание</Th>
                  <Th>Заявки</Th>
                  <Th> </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(16,185,129,0.04)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
                  >
                    <Td>
                      <p className="text-white font-medium">{r.full_name}</p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {r.project_name ?? "—"}
                      </p>
                    </Td>
                    <Td>
                      <div className="space-y-0.5 text-[12px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {r.phone && (
                          <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{r.phone}</div>
                        )}
                        {r.email && (
                          <div className="flex items-center gap-1.5"><Mail  className="w-3 h-3" />{r.email}</div>
                        )}
                        {r.telegram_username && (
                          <div className="flex items-center gap-1.5"><Send className="w-3 h-3" />@{r.telegram_username}</div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: TYPE_COLOR[r.resident_type].bg, color: TYPE_COLOR[r.resident_type].text }}
                      >
                        {TYPE_RU[r.resident_type]}
                      </span>
                    </Td>
                    <Td>
                      <p className="text-white">№{r.apartment_number}</p>
                      <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {r.apartment_floor} эт.
                      </p>
                    </Td>
                    <Td>
                      <p className="text-white">{r.building_name ?? "—"}</p>
                    </Td>
                    <Td>
                      {r.open_request_count > 0 ? (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fcd34d" }}
                        >
                          {r.open_request_count} активных
                        </span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>—</span>
                      )}
                    </Td>
                    <Td>
                      <button
                        onClick={() => setDrawerId(r.apartment_id)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        style={{
                          backgroundColor: "rgba(16,185,129,0.10)",
                          color:           "#6ee7b7",
                          border:          "1px solid rgba(16,185,129,0.25)",
                        }}
                      >
                        Открыть
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddResidentModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => setReloadTick((t) => t + 1)}
      />
      <ApartmentDetailDrawer
        apartmentId={drawerId}
        onClose={() => setDrawerId(null)}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface RawResident {
  id:                 string;
  full_name:          string;
  phone:              string | null;
  email:              string | null;
  telegram_username:  string | null;
  resident_type:      ResidentType;
  apartment_id:       string;
  apartment: {
    id:          string;
    number:      string;
    floor:       number;
    building_id: string | null;
    building: {
      id:         string;
      name:       string;
      project_id: string | null;
      project: {
        id:   string;
        name: string;
      } | null;
    } | null;
  } | null;
}

function pluralize(n: number, forms: [string, string, string]): string {
  const m10  = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11)              return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 flex-1 min-w-[260px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        Поиск
      </span>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ФИО, телефон, email…"
          className="w-full rounded-xl pl-10 pr-3 py-2.5 text-sm text-white outline-none transition-all"
          style={{
            backgroundColor: "#0d1117",
            border:          "1px solid rgba(255,255,255,0.08)",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
          onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
      </div>
    </label>
  );
}

interface FilterSelectProps {
  label:    string;
  value:    string;
  onChange: (v: string) => void;
  options:  { value: string; label: string }[];
}
function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[180px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all"
        style={{
          backgroundColor: "#0d1117",
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
