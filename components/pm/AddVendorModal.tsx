// ─────────────────────────────────────────────────────────────────────────────
// components/pm/AddVendorModal.tsx
//
// Create or edit a vendor. When `vendor` prop is null → creates new (POST),
// otherwise updates the given vendor (PATCH ?id=xxx). Specializations are
// chosen from the same RequestCategory set used by maintenance_requests so
// AssignVendorModal's category filter works automatically.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Save } from "lucide-react";
import type { Vendor, RequestCategory } from "@/lib/types/database";

interface Props {
  open:      boolean;
  vendor:    Vendor | null;          // null → create
  onClose:   () => void;
  onSaved:   (v: Vendor) => void;
}

const ALL_SPECS: { value: RequestCategory; label: string }[] = [
  { value: "plumbing",   label: "Сантехника" },
  { value: "electrical", label: "Электрика" },
  { value: "heating",    label: "Отопление" },
  { value: "cleaning",   label: "Уборка" },
  { value: "elevator",   label: "Лифт" },
  { value: "appliance",  label: "Бытовая техника" },
  { value: "structural", label: "Стройдефекты" },
  { value: "other",      label: "Другое" },
];

interface FormState {
  name:              string;
  phone:             string;
  email:             string;
  telegram_username: string;
  notes:             string;
  specializations:   RequestCategory[];
  is_active:         boolean;
}

const EMPTY: FormState = {
  name: "", phone: "", email: "", telegram_username: "", notes: "",
  specializations: [], is_active: true,
};

export default function AddVendorModal({ open, vendor, onClose, onSaved }: Props) {
  const [form,    setForm]    = useState<FormState>(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (vendor) {
      setForm({
        name:              vendor.name,
        phone:             vendor.phone,
        email:             vendor.email ?? "",
        telegram_username: vendor.telegram_username ?? "",
        notes:             vendor.notes ?? "",
        specializations:   [...vendor.specializations] as RequestCategory[],
        is_active:         vendor.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, vendor]);

  function toggleSpec(s: RequestCategory) {
    setForm((f) => ({
      ...f,
      specializations: f.specializations.includes(s)
        ? f.specializations.filter((x) => x !== s)
        : [...f.specializations, s],
    }));
  }

  async function save() {
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Имя и телефон обязательны");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const url    = vendor ? `/api/pm/vendors?id=${vendor.id}` : "/api/pm/vendors";
      const method = vendor ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:              form.name.trim(),
          phone:             form.phone.trim(),
          email:             form.email.trim() || null,
          telegram_username: form.telegram_username.trim() || null,
          notes:             form.notes.trim() || null,
          specializations:   form.specializations,
          ...(vendor ? { is_active: form.is_active } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Ошибка сохранения");
        return;
      }
      onSaved(json.vendor as Vendor);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
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
        className="fixed top-1/2 left-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-2xl"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.08)",
          maxHeight:       "90vh",
          overflow:        "hidden",
          display:         "flex",
          flexDirection:   "column",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <h2 className="text-xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            {vendor ? "Редактировать подрядчика" : "Новый подрядчик"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <Field label="Имя / название бригады *">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Алишер Каримов"
              className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
              style={fieldStyle()}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Телефон *">
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+998 90 123 45 67"
                className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                style={fieldStyle()}
              />
            </Field>
            <Field label="Telegram">
              <input
                value={form.telegram_username}
                onChange={(e) => setForm((f) => ({ ...f, telegram_username: e.target.value }))}
                placeholder="@username"
                className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
                style={fieldStyle()}
              />
            </Field>
          </div>

          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="vendor@example.uz"
              className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
              style={fieldStyle()}
            />
          </Field>

          <Field label="Специализации">
            <div className="flex flex-wrap gap-2">
              {ALL_SPECS.map((s) => {
                const active = form.specializations.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleSpec(s.value)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                    style={{
                      backgroundColor: active ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
                      border:          `1px solid ${active ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color:           active ? "#34d399" : "rgba(255,255,255,0.65)",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Заметки">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="График, цены, особенности…"
              className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none resize-none"
              style={fieldStyle()}
            />
          </Field>

          {vendor && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-white">Активен</span>
            </label>
          )}

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
        </div>

        <div
          className="px-6 py-4 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={onClose}
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
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Сохранить
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span
        className="text-[10px] uppercase tracking-widest block mb-1.5"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function fieldStyle(): React.CSSProperties {
  return {
    backgroundColor: "rgba(255,255,255,0.04)",
    border:          "1px solid rgba(255,255,255,0.08)",
  };
}
