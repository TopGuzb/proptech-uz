// ─────────────────────────────────────────────────────────────────────────────
// app/pm/inventory/page.tsx
//
// PM-facing equipment / common-property registry.
//   • Building selector
//   • Inline create / edit form
//   • Asset cards grouped by status (broken first, then needs_service, then ok)
//   • Service-due indicator + warranty countdown
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Boxes, Edit2, X, AlertTriangle, ShieldCheck, Wrench, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Project   { id: string; name: string; }
interface Building  { id: string; name: string; project_id: string; }

type AssetCategory = "elevator"|"pump"|"boiler"|"hvac"|"electrical"|"plumbing"|"security"|"other";
type AssetStatus   = "operational"|"needs_service"|"broken"|"retired";

interface AssetRow {
  id:                    string;
  building_id:           string;
  name:                  string;
  category:              AssetCategory;
  serial_number:         string | null;
  manufacturer:          string | null;
  installed_at:          string | null;
  warranty_until:        string | null;
  next_service_at:       string | null;
  service_interval_days: number | null;
  location:              string | null;
  notes:                 string | null;
  status:                AssetStatus;
  created_at:            string;
  updated_at:            string;
}

const CAT_RU: Record<AssetCategory, string> = {
  elevator:   "Лифт",
  pump:       "Насос",
  boiler:     "Котёл",
  hvac:       "Вентиляция",
  electrical: "Электрика",
  plumbing:   "Сантехника",
  security:   "Охрана",
  other:      "Другое",
};
const ALL_CATS = Object.keys(CAT_RU) as AssetCategory[];

const STATUS_META: Record<AssetStatus, { label: string; bg: string; fg: string; border: string; rank: number }> = {
  broken:        { label: "Сломан",    bg: "rgba(239,68,68,0.10)",  fg: "#f87171", border: "rgba(239,68,68,0.30)", rank: 0 },
  needs_service: { label: "ТО",        bg: "rgba(251,191,36,0.10)", fg: "#fbbf24", border: "rgba(251,191,36,0.30)", rank: 1 },
  operational:   { label: "В строю",   bg: "rgba(16,185,129,0.10)", fg: "#34d399", border: "rgba(16,185,129,0.30)", rank: 2 },
  retired:       { label: "Списан",    bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.5)", border: "rgba(255,255,255,0.10)", rank: 3 },
};

export default function PMInventoryPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [buildings,    setBuildings]    = useState<Building[]>([]);
  const [selectedProj, setSelectedProj] = useState("");
  const [selectedBldg, setSelectedBldg] = useState("");
  const [assets,       setAssets]       = useState<AssetRow[]>([]);
  const [loading,      setLoading]      = useState(true);

  const [editing,      setEditing]      = useState<AssetRow | null>(null);
  const [showForm,     setShowForm]     = useState(false);

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

  async function loadAssets() {
    if (!selectedBldg) { setAssets([]); setLoading(false); return; }
    setLoading(true);
    const res  = await fetch(`/api/pm/assets?building_id=${selectedBldg}`);
    const json = await res.json();
    const list = (json.assets as AssetRow[] | null) ?? [];
    list.sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank || a.name.localeCompare(b.name));
    setAssets(list);
    setLoading(false);
  }
  useEffect(() => { loadAssets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedBldg]);

  const stats = useMemo(() => {
    let broken = 0, dueSoon = 0, ok = 0;
    const now = Date.now();
    const in14 = now + 14 * 24 * 3600 * 1000;
    for (const a of assets) {
      if (a.status === "broken") broken++;
      else if (a.status === "needs_service") dueSoon++;
      else if (a.status === "operational") {
        if (a.next_service_at) {
          const t = new Date(a.next_service_at).getTime();
          if (t <= in14) dueSoon++;
          else ok++;
        } else ok++;
      }
    }
    return { broken, dueSoon, ok, total: assets.length };
  }, [assets]);

  function openCreate() { setEditing(null);  setShowForm(true); }
  function openEdit(a: AssetRow) { setEditing(a); setShowForm(true); }
  async function onSaved() { setShowForm(false); await loadAssets(); }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
            Property Management
          </p>
          <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Инвентарь
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            Реестр оборудования и общего имущества
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
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Всего"     value={stats.total}   accent="rgba(255,255,255,0.55)" />
        <SummaryCard label="В строю"   value={stats.ok}      accent="#34d399" />
        <SummaryCard label="ТО / Скоро" value={stats.dueSoon} accent="#fbbf24" />
        <SummaryCard label="Сломано"   value={stats.broken}  accent="#f87171" />
      </div>

      {showForm && selectedBldg && (
        <AssetForm
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
      ) : assets.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <Boxes className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">В этом здании ничего не зарегистрировано.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} onEdit={() => openEdit(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Asset card ───────────────────────────────────────────────────────────────

function AssetCard({ asset, onEdit }: { asset: AssetRow; onEdit: () => void }) {
  const meta = STATUS_META[asset.status];

  const warrantyDays = asset.warranty_until
    ? Math.floor((new Date(asset.warranty_until).getTime() - Date.now()) / (24 * 3600 * 1000))
    : null;
  const serviceDays  = asset.next_service_at
    ? Math.floor((new Date(asset.next_service_at).getTime() - Date.now()) / (24 * 3600 * 1000))
    : null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base text-white font-semibold truncate">{asset.name}</p>
            <span
              className="text-[10px] px-2 py-0.5 rounded shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}
            >
              {CAT_RU[asset.category]}
            </span>
          </div>
          <div className="text-xs mt-1 space-x-3" style={{ color: "rgba(255,255,255,0.55)" }}>
            {asset.manufacturer && <span>{asset.manufacturer}</span>}
            {asset.serial_number && <span>S/N: {asset.serial_number}</span>}
            {asset.location && <span>📍 {asset.location}</span>}
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

      <div className="grid grid-cols-2 gap-2 text-xs">
        {asset.next_service_at && (
          <InfoRow
            icon={<Wrench className="w-3 h-3" />}
            label="ТО"
            value={new Date(asset.next_service_at).toLocaleDateString("ru-RU")}
            warn={serviceDays != null && serviceDays <= 14}
            sub={serviceDays != null
              ? (serviceDays >= 0 ? `через ${serviceDays} дн.` : `просрочено на ${-serviceDays} дн.`)
              : undefined}
          />
        )}
        {asset.warranty_until && (
          <InfoRow
            icon={<ShieldCheck className="w-3 h-3" />}
            label="Гарантия"
            value={new Date(asset.warranty_until).toLocaleDateString("ru-RU")}
            warn={warrantyDays != null && warrantyDays < 0}
            sub={warrantyDays != null
              ? (warrantyDays >= 0 ? `${warrantyDays} дн. осталось` : "истекла")
              : undefined}
          />
        )}
        {asset.installed_at && (
          <InfoRow
            label="Установка"
            value={new Date(asset.installed_at).toLocaleDateString("ru-RU")}
          />
        )}
      </div>

      {asset.notes && (
        <p className="text-xs mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)" }}>
          {asset.notes}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  icon, label, value, sub, warn,
}: { icon?: React.ReactNode; label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {icon} {label}
      </span>
      <p className="text-white mt-0.5">{value}</p>
      {sub && (
        <p className="text-[10px]" style={{ color: warn ? "#f87171" : "rgba(255,255,255,0.45)" }}>
          {warn && <AlertTriangle className="w-3 h-3 inline mr-1" />}
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

interface FormProps {
  buildingId: string;
  asset:      AssetRow | null;
  onSaved:    () => void;
  onCancel:   () => void;
}
function AssetForm({ buildingId, asset, onSaved, onCancel }: FormProps) {
  const [name,            setName]            = useState(asset?.name ?? "");
  const [category,        setCategory]        = useState<AssetCategory>(asset?.category ?? "other");
  const [serialNumber,    setSerialNumber]    = useState(asset?.serial_number ?? "");
  const [manufacturer,    setManufacturer]    = useState(asset?.manufacturer ?? "");
  const [location,        setLocation]        = useState(asset?.location ?? "");
  const [installedAt,     setInstalledAt]     = useState(asset?.installed_at ?? "");
  const [warrantyUntil,   setWarrantyUntil]   = useState(asset?.warranty_until ?? "");
  const [nextServiceAt,   setNextServiceAt]   = useState(asset?.next_service_at ?? "");
  const [serviceInterval, setServiceInterval] = useState<number | "">(asset?.service_interval_days ?? "");
  const [notes,           setNotes]           = useState(asset?.notes ?? "");
  const [status,          setStatus]          = useState<AssetStatus>(asset?.status ?? "operational");
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  async function save() {
    if (!name.trim()) { setError("Введите название"); return; }
    setSaving(true); setError(null);
    try {
      const url    = asset ? `/api/pm/assets?id=${asset.id}` : "/api/pm/assets";
      const method = asset ? "PATCH" : "POST";
      const body: Record<string, unknown> = {
        name:                  name.trim(),
        category,
        serial_number:         serialNumber.trim() || null,
        manufacturer:          manufacturer.trim() || null,
        location:              location.trim() || null,
        installed_at:          installedAt   || null,
        warranty_until:        warrantyUntil || null,
        next_service_at:       nextServiceAt || null,
        service_interval_days: serviceInterval === "" ? null : Number(serviceInterval),
        notes:                 notes.trim() || null,
        status,
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
          {asset ? "Редактировать" : "Новый объект"}
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
          <input value={name} onChange={(e) => setName(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()} />
        </Field>
        <Field label="Категория">
          <select value={category} onChange={(e) => setCategory(e.target.value as AssetCategory)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()}>
            {ALL_CATS.map((c) => <option key={c} value={c} style={{ backgroundColor: "#0d1117" }}>{CAT_RU[c]}</option>)}
          </select>
        </Field>
        <Field label="Производитель">
          <input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()} />
        </Field>
        <Field label="Серийный номер">
          <input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()} />
        </Field>
        <Field label="Местоположение">
          <input value={location} onChange={(e) => setLocation(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()} />
        </Field>
        <Field label="Статус">
          <select value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()}>
            <option value="operational"   style={{ backgroundColor: "#0d1117" }}>В строю</option>
            <option value="needs_service" style={{ backgroundColor: "#0d1117" }}>Требует ТО</option>
            <option value="broken"        style={{ backgroundColor: "#0d1117" }}>Сломан</option>
            <option value="retired"       style={{ backgroundColor: "#0d1117" }}>Списан</option>
          </select>
        </Field>
        <Field label="Установка">
          <input type="date" value={installedAt} onChange={(e) => setInstalledAt(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={{ ...fs(), colorScheme: "dark" }} />
        </Field>
        <Field label="Гарантия до">
          <input type="date" value={warrantyUntil} onChange={(e) => setWarrantyUntil(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={{ ...fs(), colorScheme: "dark" }} />
        </Field>
        <Field label="Следующее ТО">
          <input type="date" value={nextServiceAt} onChange={(e) => setNextServiceAt(e.target.value)}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={{ ...fs(), colorScheme: "dark" }} />
        </Field>
        <Field label="Интервал ТО (дни)">
          <input type="number" min={0} value={serviceInterval}
                 onChange={(e) => setServiceInterval(e.target.value === "" ? "" : Number(e.target.value))}
                 className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none" style={fs()} />
        </Field>
      </div>

      <Field label="Заметки">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none resize-none" style={fs()} />
      </Field>

      {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
                className="px-4 py-2 rounded-xl text-sm transition-colors"
                style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}>
          Отмена
        </button>
        <button onClick={save} disabled={saving}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}>
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Сохранить
        </button>
      </div>
    </div>
  );
}

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

// ── Selector / SummaryCard ───────────────────────────────────────────────────

interface SelectorProps {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean;
}
function Selector({ label, value, options, onChange, disabled }: SelectorProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[200px]">
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
