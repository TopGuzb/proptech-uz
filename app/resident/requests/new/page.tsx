// ─────────────────────────────────────────────────────────────────────────────
// app/resident/requests/new/page.tsx
//
// Resident submits a new maintenance request. Photos are queued in memory
// while the form is being filled out, then uploaded to Storage *after* the
// request row exists (so we have an ID to use as the folder name).
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Loader2, Trash2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadMaintenancePhotos } from "@/lib/storage/maintenance-photos";

type Priority = "low" | "medium" | "high" | "emergency";

interface ResidentInfo {
  id:           string;
  apartment_id: string;
  full_name:    string;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: "plumbing",   label: "Сантехника" },
  { value: "electrical", label: "Электрика" },
  { value: "heating",    label: "Отопление" },
  { value: "cleaning",   label: "Уборка" },
  { value: "elevator",   label: "Лифт" },
  { value: "appliance",  label: "Бытовая техника" },
  { value: "structural", label: "Строительные дефекты" },
  { value: "other",      label: "Другое" },
];

const PRIORITIES: { value: Priority; label: string; hint: string; color: string; bg: string }[] = [
  { value: "low",       label: "Не срочно",     hint: "Несколько дней — ок",  color: "#34d399", bg: "rgba(16,185,129,0.10)" },
  { value: "medium",    label: "Обычная",        hint: "В течение 24 часов",   color: "#93c5fd", bg: "rgba(59,130,246,0.10)" },
  { value: "high",      label: "Срочно",         hint: "В течение 4 часов",    color: "#fdba74", bg: "rgba(251,146,60,0.10)" },
  { value: "emergency", label: "ЧП",             hint: "Нужно сейчас",         color: "#fca5a5", bg: "rgba(239,68,68,0.12)" },
];

export default function NewRequestPage() {
  const router = useRouter();
  const [resident,    setResident]    = useState<ResidentInfo | null>(null);
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [category,    setCategory]    = useState<string>("");
  const [priority,    setPriority]    = useState<Priority>("medium");
  const [photos,      setPhotos]      = useState<File[]>([]);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("residents")
        .select("id, apartment_id, full_name")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();
      setResident((data as ResidentInfo | null) ?? null);
    })();
  }, []);

  function onFilesChosen(filelist: FileList | null) {
    if (!filelist) return;
    const arr = Array.from(filelist);
    setPhotos((prev) => [...prev, ...arr]);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!resident) {
      setError("Не удалось определить вашу квартиру. Свяжитесь с управляющим.");
      return;
    }
    if (!title.trim() || !description.trim()) {
      setError("Заполните заголовок и описание");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/pm/maintenance-requests", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartment_id: resident.apartment_id,
          resident_id:  resident.id,
          title:        title.trim(),
          description:  description.trim(),
          category:     category || null,
          priority,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось создать заявку");
        return;
      }

      const requestId = json.request.id as string;

      if (photos.length > 0) {
        await uploadMaintenancePhotos(requestId, photos, "before");
      }

      router.push("/resident/requests?created=1");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <Link
        href="/resident/requests"
        className="inline-flex items-center gap-1.5 text-sm transition-colors"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        <ArrowLeft className="w-4 h-4" />
        Назад к заявкам
      </Link>

      <header>
        <h1 className="text-3xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Новая заявка
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Опишите проблему — управляющий получит уведомление сразу.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Что случилось? *">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: течёт кран в ванной"
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
            onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
          />
        </Field>

        <Field label="Подробнее *">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Опишите детали — когда началось, что уже пробовали"
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all resize-none"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
            onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
          />
        </Field>

        <Field label="Категория">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all"
            style={inputStyle}
          >
            <option value="" style={{ backgroundColor: "#0d1117" }}>Выберите…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} style={{ backgroundColor: "#0d1117" }}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Приоритет">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRIORITIES.map((p) => {
              const selected = priority === p.value;
              return (
                <button
                  type="button"
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    backgroundColor: selected ? p.bg : "rgba(255,255,255,0.03)",
                    border:          `1px solid ${selected ? p.color : "rgba(255,255,255,0.08)"}`,
                  }}
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <div>
                    <p className="text-sm font-semibold" style={{ color: selected ? p.color : "rgba(255,255,255,0.85)" }}>
                      {p.label}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {p.hint}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Фото">
          <label
            className="flex flex-col items-center justify-center gap-2 rounded-xl px-4 py-6 cursor-pointer transition-colors"
            style={{
              backgroundColor: "rgba(255,255,255,0.02)",
              border:          "1px dashed rgba(255,255,255,0.15)",
            }}
          >
            <Upload className="w-6 h-6" style={{ color: "rgba(255,255,255,0.4)" }} />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
              Перетащите фото или нажмите, чтобы выбрать
            </p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              JPG / PNG / WEBP, до 10 МБ каждое
            </p>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFilesChosen(e.target.files)}
            />
          </label>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
              {photos.map((f, idx) => {
                const url = URL.createObjectURL(f);
                return (
                  <div
                    key={`${f.name}-${idx}`}
                    className="relative rounded-xl overflow-hidden group"
                    style={{ aspectRatio: "1 / 1", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={f.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute top-1 right-1 p-1.5 rounded-lg transition-opacity opacity-0 group-hover:opacity-100"
                      style={{ backgroundColor: "rgba(15,23,42,0.85)", color: "#fca5a5" }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </Field>

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
          <Link
            href="/resident/requests"
            className="px-4 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            Отмена
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Отправка…</> : <><Camera className="w-4 h-4" />Создать заявку</>}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.04)",
  border:          "1px solid rgba(255,255,255,0.08)",
};

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
