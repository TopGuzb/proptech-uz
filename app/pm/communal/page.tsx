// ─────────────────────────────────────────────────────────────────────────────
// app/pm/communal/page.tsx
//
// PM — реестр общего имущества здания (подъезды, парковки, фасады, кровля,
// детские площадки). Отдельно от /pm/inventory, где учитывается оборудование.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Loader2, Building, Edit2, X, AlertTriangle, CheckCircle2,
  CalendarCheck, Trees, Car, Home, DoorOpen, Layers, Hammer,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Project   { id: string; name: string; }
interface BuildingRow { id: string; name: string; project_id: string; }

type CommunalType =
  | "elevator" | "entrance" | "parking" | "playground"
  | "common_area" | "roof" | "facade" | "other";

type CommunalStatus = "operational" | "maintenance" | "broken" | "retired";

interface CommunalAssetRow {
  id:                    string;
  building_id:           string;
  asset_type:            CommunalType;
  name:                  string;
  description:           string | null;
  status:                CommunalStatus;
  last_inspection_date:  string | null;
  next_inspection_date:  string | null;
  created_at:            string;
}

const TYPE_RU: Record<CommunalType, { label: string; icon: React.ElementType }> = {
  elevator:    { label: "Лифт",            icon: Layers   },
  entrance:    { label: "Подъезд",         icon: DoorOpen },
  parking:     { label: "Парковка",        icon: Car      },
  playground:  { label: "Детская площадка", icon: Trees    },
  common_area: { label: "Общая зона",      icon: Home     },
  roof:        { label: "Кровля",          icon: Building },
  facade:      { label: "Фасад",           icon: Hammer   },
  other:       { label: "Другое",          icon: Building },
};
const ALL_TYPES = Object.keys(TYPE_RU) as CommunalType[];

const STATUS_META: Record<CommunalStatus, { label: string; bg: string; fg: string; border: string; rank: number }> = {
  broken:      { label: "Сломан",       bg: "rgba(239,68,68,0.10)",  fg: "#f87171", border: "rgba(239,68,68,0.30)",  rank: 0 },
  maintenance: { label: "На обслуж.",   bg: "rgba(251,191,36,0.10)", fg: "#fbbf24", border: "rgba(251,191,36,0.30)", rank: 1 },
  operational: { label: "В порядке",    bg: "rgba(16,185,129,0.10)", fg: "#34d399", border: "rgba(16,185,129,0.30)", rank: 2 },
  retired:     { label: "Списано",      bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.10)", rank: 3 },
};

export default function PMCommunalPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [buildings,    setBuildings]    = useState<BuildingRow[]>([]);
  const [selectedProj, setSelectedProj] = useState("");
  const [selectedBldg, setSelectedBldg] = useState("");
  const [assets,       setAssets]       = useState<CommunalAssetRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [editing,      setEditing]      = useState<CommunalAssetRow | null>(null);
  const [showForm,     setShowForm]     = useState(false);
  const [typeFilter,   setTypeFilter]   = useState<CommunalType | "all">("all");

  useEffect(() => {
    (async () => {
      const [{ data: projs }, { data: blds }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("buildings").select("id, name, project_id").order("name"),
      ]);
      setProjects((projs as Project[] | null) ?? []);
      setBuildings((blds as BuildingRow[] | null) ?? []);
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

  async function loadAssets() {
    if (!selectedBldg) { setAssets([]); setLoading(false); return; }
    setLoading(true);
    const res  = await fetch(`/api/pm/communal?building_id=${selectedBldg}`);
    const json = await res.json();
    const list = (json.assets as CommunalAssetRow[] | null) ?? [];
    list.sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.name.localeCompare(b.name));
    setAssets(list);
    setLoading(false);
  }
  useEffect(() => { loadAssets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedBldg]);

  const filtered = useMemo(() => {
    if (typeFilter === "all") return assets;
    return assets.filter((a) => a.asset_type === typeFilter);
  }, [assets, typeFilter]);

  const stats = useMemo(() => {
    let ok = 0, maint = 0, broken = 0, dueSoon = 0;
    const now = Date.now();
    const in30 = now + 30 * 24 * 3600 * 1000;
    for (const a of assets) {
      if (a.status === "broken") broken++;
      else if (a.status === "maintenance") maint++;
      else if (a.status === "operational") ok++;
      if (a.next_inspection_date) {
        const t = new Date(a.next_inspection_date).getTime();
        if (t <= in30 && a.status !== "retired") dueSoon++;
      }
    }
    return { ok, maint, broken, dueSoon, total: assets.length };
  }, [assets]);

  function openCreate() { setEditing(null); setShowForm(true); }
  function openEdit(a: CommunalAssetRow) { setEditing(a); setShowForm(true); }
  async function onSaved() { setShowForm(false); await loadAssets(); }

  async function markInspectedToday(a: CommunalAssetRow) {
    const today = new Date().toISOString().slice(0, 10);
    setAssets((rows) => rows.map((r) => (r.id === a.id ? { ...r, last_inspection_date: today } : r)));
    await fetch(`/api/pm/communal?id=${a.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ last_inspection_date: today }),
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
            Общее имущество
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            Подъезды, парковки, площадки, фасады — всё, что в общедомовой собственности
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={!selectedBldg}
          className="rounded-xl px-4 py-2.5 text-sm text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          <Plus className="w-4 h-4" />
          Добавить
        </button>
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
        <Selector
          label="Тип"
          value={typeFilter}
          options={[{ value: "all", label: "Все" }, ...ALL_TYPES.map((t) => ({ value: t, label: TYPE_RU[t].label }))]}
          onChange={(v) => setTypeFilter(v as CommunalType | "all")}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Всего"            value={stats.total}   accent="rgba(255,255,255,0.55)" />
        <SummaryCard label="В порядке"        value={stats.ok}      accent="#34d399" />
        <SummaryCard label="Скоро инспекция"  value={stats.dueSoon} accent="#fbbf24" />
        <SummaryCard label="Сломано"          value={stats.broken}  accent="#f87171" />
      </div>

      {showForm && selectedBldg && (
        <CommunalForm
          buildingId={selectedBldg}
          asset={editing}
          onSaved={onSaved}
          onCancel={() => setShowForm(false)}
        />
      )}

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
          <Building className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">Объекты не зарегистрированы.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((a) => (
            <CommunalCard
              key={a.id}
              asset={a}
              onEdit={() => openEdit(a)}
              onMarkInspected={() => markInspectedToday(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  asset: CommunalAssetRow;
  onEdit: () => void;
  onMarkInspected: () => void;
}
function CommunalCard({ asset, onEdit, onMarkInspected }: CardProps) {
  const meta = STATUS_META[asset.status];
  const TypeIcon = TYPE_RU[asset.asset_type].icon;

  const nextDays = asset.next_inspection_date
    ? Math.floor((new Date(asset.next_inspection_date).getTime() - Date.now()) / (24 * 3600 * 1000))
    : null;
  const overdue  = nextDays != null && nextDays < 0;
  const dueSoon  = nextDays != null && nextDays >= 0 && nextDays <= 30;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "#0d1117",
        border: `1px solid ${overdue ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{ backgroundColor: "rgba(16,185,129,0.10)", border: "1px solid rgba(16,185,129,0.20)" }}
          >
            <TypeIcon className="w-5 h-5" style={{ color: "#34d399" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base text-white font-semibold truncate">{asset.name}</p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              {TYPE_RU[asset.asset_type].label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="text-[11px] px-2 py-0.5 rounded-md"
            style={{ backgroundColor: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
          >
            {meta.label}
          </span>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
            style={{ color: "rgba(255,255,255,0.55)" }}
            title="Редактировать"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {asset.description && (
        <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
          {asset.description}
        </p>
      )}

      <div
        className="grid grid-cols-2 gap-3 pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Последняя инспекция
          </p>
          <p className="text-xs text-white mt-0.5">
            {asset.last_inspection_date
              ? new Date(asset.last_inspection_date).toLocaleDateString("ru-RU")
              : <span style={{ color: "rgba(255,255,255,0.3)" }}>—</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Следующая
          </p>
          {asset.next_inspection_date ? (
            <>
              <p className="text-xs text-white mt-0.5">
                {new Date(asset.next_inspection_date).toLocaleDateString("ru-RU")}
              </p>
              <p
                className="text-[10px] flex items-center gap-1"
                style={{ color: overdue ? "#f87171" : dueSoon ? "#fbbf24" : "rgba(255,255,255,0.45)" }}
              >
                {overdue && <AlertTriangle className="w-3 h-3" />}
                {overdue
                  ? `просрочено на ${-(nextDays!)} дн.`
                  : nextDays != null
                    ? `через ${nextDays} дн.`
                    : ""}
              </p>
            </>
          ) : (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>—</p>
          )}
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button
          onClick={onMarkInspected}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-colors hover:bg-white/[0.06]"
          style={{ color: "#34d399", border: "1px solid rgba(16,185,129,0.20)" }}
        >
          <CheckCircle2 className="w-3 h-3" />
          Инспекция сегодня
        </button>
      </div>
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

interface FormProps {
  buildingId: string;
  asset:      CommunalAssetRow | null;
  onSaved:    () => void;
  onCancel:   () => void;
}
function CommunalForm({ buildingId, asset, onSaved, onCancel }: FormProps) {
  const [name,        setName]        = useState(asset?.name ?? "");
  const [assetType,   setAssetType]   = useState<CommunalType>(asset?.asset_type ?? "entrance");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [status,      setStatus]      = useState<CommunalStatus>(asset?.status ?? "operational");
  const [lastInsp,    setLastInsp]    = useState(asset?.last_inspection_date ?? "");
  const [nextInsp,    setNextInsp]    = useState(asset?.next_inspection_date ?? "");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError("Введите название"); return; }
    setSaving(true); setError(null);
    try {
      const url    = asset ? `/api/pm/communal?id=${asset.id}` : "/api/pm/communal";
      const method = asset ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name:                 name.trim(),
        asset_type:           assetType,
        description:          description.trim() || null,
        status,
        last_inspection_date: lastInsp || null,
        next_inspection_date: nextInsp || null,
      };
      if (!asset) body.building_id = buildingId;

      const res  = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Ошибка"); return; }
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(16,185,129,0.25)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
          {asset ? "Редактировать объект" : "Новый объект общего имущества"}
        </h3>
        <button
          onClick={onCancel}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.06]"
          style={{ color: "rgba(255,255,255,0.55)" }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Название *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Подъезд №1, парковка во дворе…"
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={fs()}
          />
        </Field>
        <Field label="Тип">
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as CommunalType)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={fs()}
          >
            {ALL_TYPES.map((t) => (
              <option key={t} value={t} style={{ backgroundColor: "#0d1117" }}>
                {TYPE_RU[t].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Статус">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CommunalStatus)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={fs()}
          >
            <option value="operational" style={{ backgroundColor: "#0d1117" }}>В порядке</option>
            <option value="maintenance" style={{ backgroundColor: "#0d1117" }}>На обслуживании</option>
            <option value="broken"      style={{ backgroundColor: "#0d1117" }}>Сломан</option>
            <option value="retired"     style={{ backgroundColor: "#0d1117" }}>Списано</option>
          </select>
        </Field>
        <div /> {/* spacer */}
        <Field label="Последняя инспекция">
          <input
            type="date"
            value={lastInsp}
            onChange={(e) => setLastInsp(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...fs(), colorScheme: "dark" }}
          />
        </Field>
        <Field label="Следующая инспекция">
          <input
            type="date"
            value={nextInsp}
            onChange={(e) => setNextInsp(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ ...fs(), colorScheme: "dark" }}
          />
        </Field>
      </div>

      <Field label="Описание">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Состояние, особенности, что нужно сделать…"
          className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none resize-none"
          style={fs()}
        />
      </Field>

      {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm transition-colors"
          style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Отмена
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarCheck className="w-4 h-4" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest block mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
function fs(): React.CSSProperties {
  return { backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };
}

interface SelectorProps {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean;
}
function Selector({ label, value, options, onChange, disabled }: SelectorProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[180px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none disabled:opacity-50"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => <option key={o.value} value={o.value} style={{ backgroundColor: "#0d1117" }}>{o.label}</option>)}
      </select>
    </label>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
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
