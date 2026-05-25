// ─────────────────────────────────────────────────────────────────────────────
// components/pm/AddResidentModal.tsx
//
// Modal that creates a new resident record. Apartment is picked via cascading
// dropdowns: project → building → floor → apartment. The component fetches
// only what it needs at each step to avoid loading thousands of apartments
// upfront.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ResidentType } from "@/lib/types/database";

interface Project   { id: string; name: string; }
interface Building  { id: string; name: string; project_id: string; }
interface Apartment { id: string; number: string; floor: number; building_id: string; }

interface Props {
  open:     boolean;
  onClose:  () => void;
  onCreated: () => void;
}

export default function AddResidentModal({ open, onClose, onCreated }: Props) {
  const [projects,   setProjects]   = useState<Project[]>([]);
  const [buildings,  setBuildings]  = useState<Building[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);

  const [projectId,    setProjectId]    = useState("");
  const [buildingId,   setBuildingId]   = useState("");
  const [floor,        setFloor]        = useState<string>("");
  const [apartmentId,  setApartmentId]  = useState("");

  const [fullName,     setFullName]     = useState("");
  const [phone,        setPhone]        = useState("");
  const [email,        setEmail]        = useState("");
  const [telegram,     setTelegram]     = useState("");
  const [type,         setType]         = useState<ResidentType>("owner");
  const [moveInDate,   setMoveInDate]   = useState("");

  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Reset when modal opens
  useEffect(() => {
    if (!open) return;
    setProjectId(""); setBuildingId(""); setFloor(""); setApartmentId("");
    setFullName(""); setPhone(""); setEmail(""); setTelegram("");
    setType("owner"); setMoveInDate(""); setError(null);

    (async () => {
      const [{ data: projs }, { data: blds }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("buildings").select("id, name, project_id").order("name"),
      ]);
      setProjects((projs as Project[] | null) ?? []);
      setBuildings((blds as Building[] | null) ?? []);
    })();
  }, [open]);

  // Load apartments when building changes
  useEffect(() => {
    if (!buildingId) { setApartments([]); setFloor(""); setApartmentId(""); return; }
    (async () => {
      const { data } = await supabase
        .from("apartments")
        .select("id, number, floor, building_id")
        .eq("building_id", buildingId)
        .order("floor", { ascending: false })
        .order("number");
      setApartments((data as Apartment[] | null) ?? []);
      setFloor("");
      setApartmentId("");
    })();
  }, [buildingId]);

  const filteredBuildings = useMemo(
    () => buildings.filter((b) => b.project_id === projectId),
    [buildings, projectId]
  );

  const floors = useMemo(() => {
    const set = new Set<number>();
    apartments.forEach((a) => set.add(a.floor));
    return Array.from(set).sort((a, b) => b - a);
  }, [apartments]);

  const filteredApartments = useMemo(
    () => floor === "" ? apartments : apartments.filter((a) => a.floor === Number(floor)),
    [apartments, floor]
  );

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!apartmentId) { setError("Выберите квартиру"); return; }
    if (!fullName.trim()) { setError("Введите ФИО"); return; }

    setSaving(true);
    const { error: insertError } = await supabase
      .from("residents")
      .insert({
        apartment_id:      apartmentId,
        full_name:         fullName.trim(),
        phone:             phone.trim() || null,
        email:             email.trim() || null,
        telegram_username: telegram.trim().replace(/^@/, "") || null,
        resident_type:     type,
        move_in_date:      moveInDate || null,
        is_active:         true,
      });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl rounded-2xl"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.08)",
          maxHeight:       "90vh",
          overflow:        "auto",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{
            backgroundColor: "#0d1117",
            borderBottom:    "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <h2 className="text-xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Добавить жильца
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Cascading apartment selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Проект">
              <Select
                value={projectId}
                onChange={(v) => { setProjectId(v); setBuildingId(""); }}
                options={[{ value: "", label: "—" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              />
            </Field>
            <Field label="Здание">
              <Select
                value={buildingId}
                onChange={setBuildingId}
                disabled={!projectId}
                options={[{ value: "", label: "—" }, ...filteredBuildings.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </Field>
            <Field label="Этаж">
              <Select
                value={floor}
                onChange={setFloor}
                disabled={!buildingId}
                options={[{ value: "", label: "Все этажи" }, ...floors.map((f) => ({ value: String(f), label: `${f} этаж` }))]}
              />
            </Field>
            <Field label="Квартира">
              <Select
                value={apartmentId}
                onChange={setApartmentId}
                disabled={!buildingId}
                options={[
                  { value: "", label: "—" },
                  ...filteredApartments.map((a) => ({ value: a.id, label: `№${a.number} (эт. ${a.floor})` })),
                ]}
              />
            </Field>
          </div>

          {/* Resident fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="ФИО *">
              <Input value={fullName} onChange={setFullName} placeholder="Иван Иванов" />
            </Field>
            <Field label="Тип">
              <Select
                value={type}
                onChange={(v) => setType(v as ResidentType)}
                options={[
                  { value: "owner",  label: "Собственник" },
                  { value: "tenant", label: "Арендатор" },
                  { value: "family", label: "Член семьи" },
                ]}
              />
            </Field>
            <Field label="Телефон">
              <Input value={phone} onChange={setPhone} placeholder="+998 90 123 45 67" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={setEmail} placeholder="user@example.com" type="email" />
            </Field>
            <Field label="Telegram">
              <Input value={telegram} onChange={setTelegram} placeholder="@username" />
            </Field>
            <Field label="Дата заселения">
              <Input value={moveInDate} onChange={setMoveInDate} type="date" />
            </Field>
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border:          "1px solid rgba(239,68,68,0.25)",
                color:           "#fca5a5",
              }}
            >
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Сохранение…</> : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Helpers ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

interface InputProps {
  value:    string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?:    string;
}
function Input({ value, onChange, placeholder, type = "text" }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all"
      style={{
        backgroundColor: "rgba(255,255,255,0.04)",
        border:          "1px solid rgba(255,255,255,0.08)",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
      onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
    />
  );
}

interface SelectProps {
  value:    string;
  onChange: (v: string) => void;
  options:  { value: string; label: string }[];
  disabled?: boolean;
}
function Select({ value, onChange, options, disabled }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all disabled:opacity-50"
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
  );
}
