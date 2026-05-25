// ─────────────────────────────────────────────────────────────────────────────
// app/resident/consumption/page.tsx
//
// Resident-facing consumption hub.
//   • Big CTA → /resident/consumption/scan (AI sketch flow)
//   • Per-meter line charts of last 12 months (recharts)
//   • Aggregated cost summary
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Camera, Loader2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { UZ_TARIFFS, type MeterType } from "@/lib/pm/tariffs";

interface MeterRow   { id: string; meter_type: MeterType; unit: string | null; }
interface ReadingRow {
  id:               string;
  meter_id:         string;
  reading_value:    number;
  reading_date:     string;
  consumption_diff: number | null;
  cost_amount:      number | null;
}

interface Resident { id: string; apartment_id: string; }

const ACCENT_BY_TYPE: Record<MeterType, string> = {
  electricity: "#fbbf24",
  gas:         "#f97316",
  water_cold:  "#3b82f6",
  water_hot:   "#ef4444",
  heating:     "#a855f7",
};

export default function ResidentConsumptionPage() {
  const [resident, setResident] = useState<Resident | null>(null);
  const [meters,   setMeters]   = useState<MeterRow[]>([]);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }

      const { data: r } = await supabase
        .from("residents")
        .select("id, apartment_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();

      const res = (r as Resident | null) ?? null;
      setResident(res);
      if (!res) { setLoading(false); return; }

      const apiRes  = await fetch(`/api/pm/meter-readings?apartment_id=${res.apartment_id}&months=12`);
      const apiJson = await apiRes.json();
      setMeters((apiJson.meters as MeterRow[] | undefined) ?? []);
      setReadings((apiJson.readings as ReadingRow[] | undefined) ?? []);
      setLoading(false);
    })();
  }, []);

  // Group readings per meter, build chart series
  const chartByMeter = useMemo(() => {
    const map = new Map<string, { date: string; value: number; diff: number }[]>();
    for (const r of readings) {
      const arr = map.get(r.meter_id) ?? [];
      arr.push({
        date:  r.reading_date,
        value: Number(r.reading_value),
        diff:  Number(r.consumption_diff ?? 0),
      });
      map.set(r.meter_id, arr);
    }
    return map;
  }, [readings]);

  const totalCost = useMemo(
    () => readings.reduce((s, r) => s + Number(r.cost_amount ?? 0), 0),
    [readings],
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Потребление
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Показания счётчиков и расход коммуналки за последние 12 месяцев
        </p>
      </header>

      <Link
        href="/resident/consumption/scan"
        className="flex items-center gap-3 rounded-xl px-5 py-4 transition-colors hover:bg-white/[0.02]"
        style={{
          background: "linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(59,130,246,0.08) 100%)",
          border:     "1px solid rgba(168,85,247,0.30)",
        }}
      >
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
        >
          <Camera className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Сканировать счётчик</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
            AI распознает показания и сохранит автоматически
          </p>
        </div>
      </Link>

      {!loading && readings.length > 0 && (
        <div
          className="rounded-2xl p-5 flex items-center justify-between"
          style={{
            backgroundColor: "#0d1117",
            border:          "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
              Сумма за 12 месяцев
            </p>
            <p className="text-2xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              {totalCost.toLocaleString("ru-RU")} сум
            </p>
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            {readings.length} показаний по {meters.length} счётчикам
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12" style={{ color: "rgba(255,255,255,0.4)" }}>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !resident ? (
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Текущий пользователь не привязан к квартире.
        </p>
      ) : meters.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          Пока нет ни одного показания. Отсканируй счётчик, чтобы начать.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {meters.map((m) => {
            const series = chartByMeter.get(m.id) ?? [];
            const tariff = UZ_TARIFFS[m.meter_type];
            const accent = ACCENT_BY_TYPE[m.meter_type];
            return (
              <div
                key={m.id}
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: "#0d1117",
                  border:          "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
                      {tariff.label_ru}
                    </p>
                    <p className="text-sm text-white mt-0.5">
                      Тариф: {tariff.rate_per_unit.toLocaleString("ru-RU")} сум / {m.unit ?? tariff.unit}
                    </p>
                  </div>
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {series.length} показаний
                  </span>
                </div>

                {series.length === 0 ? (
                  <p className="text-xs py-6 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Нет данных
                  </p>
                ) : (
                  <div style={{ width: "100%", height: 180 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => new Date(d).toLocaleDateString("ru-RU", { month: "short" })}
                          stroke="rgba(255,255,255,0.4)"
                          fontSize={11}
                        />
                        <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0d1117",
                            border:          "1px solid rgba(255,255,255,0.10)",
                            borderRadius:    "0.5rem",
                            fontSize:        "12px",
                          }}
                          labelFormatter={(d) => new Date(d).toLocaleDateString("ru-RU")}
                          formatter={(v) => [`${v} ${m.unit ?? tariff.unit}`, "Показание"]}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke={accent}
                          strokeWidth={2}
                          dot={{ fill: accent, r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
