// ─────────────────────────────────────────────────────────────────────────────
// components/pm/ConsumptionAnomalies.tsx
//
// Lazy AI card for the PM dashboard. Calls /api/ai/consumption-anomalies?building_id=…
// and shows the top deviations with a one-line Russian explanation per row.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, Sparkles } from "lucide-react";

type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

interface Anomaly {
  apartment_id:    string;
  apartment_label: string;
  meter_type:      MeterType;
  unit:            string;
  last_value:      number;
  last_diff:       number;
  avg_value:       number;
  deviation_pct:   number;
  direction:       "up" | "down";
  reading_date:    string;
  ai_explanation:  string;
}

const TYPE_LABEL: Record<MeterType, string> = {
  electricity: "Электричество",
  gas:         "Газ",
  water_cold:  "Холодная вода",
  water_hot:   "Горячая вода",
  heating:     "Отопление",
};

interface Props { buildingId: string; }

export default function ConsumptionAnomalies({ buildingId }: Props) {
  const [loading, setLoading] = useState(false);
  const [list,    setList]    = useState<Anomaly[]>([]);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!buildingId) { setList([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res  = await fetch(`/api/ai/consumption-anomalies?building_id=${buildingId}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "AI недоступен");
          setList([]);
        } else {
          setList((json.anomalies as Anomaly[]) ?? []);
        }
      } catch {
        if (!cancelled) setError("Не удалось загрузить аномалии");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [buildingId]);

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, rgba(168,85,247,0.06) 0%, rgba(59,130,246,0.04) 100%)",
        border:     "1px solid rgba(168,85,247,0.20)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
        >
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">⚠️ Аномалии потребления</h3>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            AI-анализ отклонений от средней нормы
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.4)" }}>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "#fca5a5", backgroundColor: "rgba(239,68,68,0.08)" }}>
          {error}
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs py-2" style={{ color: "rgba(255,255,255,0.5)" }}>
          Аномалий не обнаружено — потребление в пределах нормы.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 5).map((a, i) => (
            <li
              key={`${a.apartment_id}-${a.meter_type}-${i}`}
              className="rounded-xl p-3"
              style={{
                backgroundColor: "rgba(255,255,255,0.03)",
                border:          "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {a.direction === "up"
                    ? <ArrowUpRight   className="w-4 h-4 shrink-0" style={{ color: "#fca5a5" }} />
                    : <ArrowDownRight className="w-4 h-4 shrink-0" style={{ color: "#93c5fd" }} />}
                  <p className="text-sm text-white truncate">
                    Кв. {a.apartment_label} · {TYPE_LABEL[a.meter_type]}
                  </p>
                </div>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: a.direction === "up" ? "rgba(239,68,68,0.15)" : "rgba(59,130,246,0.15)",
                    color:           a.direction === "up" ? "#fca5a5"              : "#93c5fd",
                  }}
                >
                  {a.deviation_pct > 0 ? "+" : ""}{a.deviation_pct}%
                </span>
              </div>
              <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
                {a.last_diff} {a.unit} · среднее {a.avg_value} {a.unit}
              </p>
              {a.ai_explanation && (
                <p className="text-xs mt-2 flex items-start gap-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
                  {a.ai_explanation}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
