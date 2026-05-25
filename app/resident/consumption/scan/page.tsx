// ─────────────────────────────────────────────────────────────────────────────
// app/resident/consumption/scan/page.tsx
//
// Resident takes a photo of their meter, AI extracts the reading,
// resident confirms, then the reading is persisted to meter_readings via
// /api/pm/meter-readings. The cost is computed server-side from tariffs.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Loader2, Sparkles, Trash2, CheckCircle2, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";

type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

interface ScanResult {
  meter_type:    MeterType | null;
  reading_value: number    | null;
  unit:          string    | null;
  period_start:  string    | null;
  period_end:    string    | null;
  total_amount:  number    | null;
  confidence:    number;
  notes:         string;
}

interface ResidentInfo {
  id:           string;
  apartment_id: string;
  full_name:    string;
}

const METER_TYPES: { value: MeterType; label: string }[] = [
  { value: "electricity", label: "Электричество" },
  { value: "gas",         label: "Газ" },
  { value: "water_cold",  label: "Холодная вода" },
  { value: "water_hot",   label: "Горячая вода" },
  { value: "heating",     label: "Отопление" },
];

export default function ScanBillPage() {
  const router = useRouter();
  const [resident,    setResident]    = useState<ResidentInfo | null>(null);
  const [file,        setFile]        = useState<File | null>(null);
  const [previewUrl,  setPreviewUrl]  = useState<string | null>(null);
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(null);
  const [meterType,   setMeterType]   = useState<MeterType | "">("");
  const [scanning,    setScanning]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [result,      setResult]      = useState<ScanResult | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [savedDiff,   setSavedDiff]   = useState<{ diff: number; cost: number } | null>(null);

  // Editable copies of AI result so the resident can correct values
  const [editValue, setEditValue] = useState<string>("");
  const [editType,  setEditType]  = useState<MeterType | "">("");

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

  function onFileChosen(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setResult(null);
    setSavedDiff(null);
    setError(null);
  }

  function reset() {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhotoUrl(null);
    setResult(null);
    setSavedDiff(null);
    setError(null);
    setEditValue("");
    setEditType("");
  }

  async function handleScan() {
    if (!file) return;
    setScanning(true);
    setError(null);
    setResult(null);

    try {
      const ext      = (file.name.split(".").pop() || "jpg").toLowerCase();
      const filename = `bills/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("maintenance-photos")
        .upload(filename, file, { cacheControl: "3600", upsert: false });

      if (upErr) {
        setError(`Не удалось загрузить фото: ${upErr.message}`);
        return;
      }

      const { data: pub } = supabase.storage
        .from("maintenance-photos")
        .getPublicUrl(filename);
      setPhotoUrl(pub.publicUrl);

      const res = await fetch("/api/ai/scan-utility-bill", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          photo_url:   pub.publicUrl,
          meter_type:  meterType || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "AI не смог обработать фото");
        return;
      }
      const r = json as ScanResult;
      setResult(r);
      setEditValue(r.reading_value != null ? String(r.reading_value) : "");
      setEditType(r.meter_type ?? meterType ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сканирования");
    } finally {
      setScanning(false);
    }
  }

  async function handleSave() {
    if (!resident) {
      setError("Не найден жилец для текущего пользователя");
      return;
    }
    const value = Number(editValue);
    if (!editType || !Number.isFinite(value) || value < 0) {
      setError("Заполни тип счётчика и корректное показание");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pm/meter-readings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          apartment_id:  resident.apartment_id,
          meter_type:    editType,
          reading_value: value,
          unit:          result?.unit ?? undefined,
          photo_url:     photoUrl ?? undefined,
          source:        "photo_ai",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось сохранить");
        return;
      }
      setSavedDiff({
        diff: json.consumption_diff ?? 0,
        cost: json.cost_amount ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="min-h-screen px-4 py-6 max-w-xl mx-auto"
      style={{ color: "rgba(255,255,255,0.85)" }}
    >
      <Link
        href="/resident/consumption"
        className="inline-flex items-center gap-1.5 text-xs mb-4"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Назад
      </Link>

      <h1
        className="text-2xl text-white"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        Сканировать счётчик
      </h1>
      <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
        Сфотографируй счётчик или платёжку — AI заполнит показания автоматически.
      </p>

      {!resident && (
        <p className="text-xs mt-2" style={{ color: "#fbbf24" }}>
          Текущий пользователь не привязан к квартире — сохранение не сработает.
        </p>
      )}

      <div className="mt-6">
        <label className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          Тип счётчика (необязательно)
        </label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {METER_TYPES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMeterType(meterType === m.value ? "" : m.value)}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-left transition-colors"
              style={{
                backgroundColor: meterType === m.value ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.03)",
                border:          meterType === m.value ? "1px solid rgba(16,185,129,0.40)" : "1px solid rgba(255,255,255,0.06)",
                color:           meterType === m.value ? "#6ee7b7" : "rgba(255,255,255,0.7)",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {!previewUrl ? (
          <label
            className="flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-12 cursor-pointer transition-colors"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border:          "1px dashed rgba(255,255,255,0.15)",
            }}
          >
            <Camera className="w-8 h-8" style={{ color: "rgba(255,255,255,0.5)" }} />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
              Нажми, чтобы сделать фото или выбрать
            </p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              JPG / PNG до 10 МБ
            </p>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" className="w-full h-72 object-cover" />
            <button
              onClick={reset}
              className="absolute top-2 right-2 p-2 rounded-lg"
              style={{ backgroundColor: "rgba(0,0,0,0.55)", color: "#fff" }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {previewUrl && !result && (
        <button
          onClick={handleScan}
          disabled={scanning}
          className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
        >
          {scanning
            ? <><Loader2 className="w-4 h-4 animate-spin" />Распознаём…</>
            : <><Sparkles className="w-4 h-4" />Сканировать с AI</>
          }
        </button>
      )}

      {error && (
        <div
          className="mt-4 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            border:          "1px solid rgba(239,68,68,0.25)",
            color:           "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {result && !savedDiff && (
        <div
          className="mt-6 rounded-xl p-5 space-y-4"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(59,130,246,0.08) 100%)",
            border:     "1px solid rgba(168,85,247,0.25)",
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
              Результат AI · подтверди и сохрани
            </p>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: result.confidence >= 0.7
                  ? "rgba(16,185,129,0.15)"
                  : result.confidence >= 0.4
                    ? "rgba(251,191,36,0.15)"
                    : "rgba(239,68,68,0.15)",
                color: result.confidence >= 0.7
                  ? "#6ee7b7"
                  : result.confidence >= 0.4
                    ? "#fcd34d"
                    : "#fca5a5",
              }}
            >
              Уверенность {Math.round(result.confidence * 100)}%
            </span>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                Тип счётчика
              </span>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as MeterType | "")}
                className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border:          "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <option value="" style={{ backgroundColor: "#0d1117" }}>—</option>
                {METER_TYPES.map((m) => (
                  <option key={m.value} value={m.value} style={{ backgroundColor: "#0d1117" }}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
                Показание {result.unit ? `(${result.unit})` : ""}
              </span>
              <input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border:          "1px solid rgba(255,255,255,0.08)",
                }}
              />
            </label>
          </div>

          {result.notes && (
            <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.55)" }}>
              {result.notes}
            </p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !resident}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" />Сохраняем…</>
              : <><Save className="w-4 h-4" />Сохранить показание</>
            }
          </button>
        </div>
      )}

      {savedDiff && (
        <div
          className="mt-6 rounded-xl p-5 space-y-3"
          style={{
            background: "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(20,184,166,0.08) 100%)",
            border:     "1px solid rgba(16,185,129,0.30)",
          }}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" style={{ color: "#6ee7b7" }} />
            <p className="text-sm font-semibold" style={{ color: "#6ee7b7" }}>
              Показание сохранено
            </p>
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span style={{ color: "rgba(255,255,255,0.55)" }}>Расход за период</span>
              <span className="text-white font-semibold">{savedDiff.diff.toLocaleString("ru-RU")} {result?.unit ?? ""}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "rgba(255,255,255,0.55)" }}>К оплате</span>
              <span className="text-white font-semibold">{savedDiff.cost.toLocaleString("ru-RU")} сум</span>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={reset}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              Ещё одно
            </button>
            <button
              onClick={() => router.push("/resident/consumption")}
              className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
            >
              К графику
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
