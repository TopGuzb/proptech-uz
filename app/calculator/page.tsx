"use client";

import { useState, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { Calculator, Download, TrendingDown, DollarSign, Calendar, Percent } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScheduleRow {
  month:     number;
  payment:   number;
  principal: number;
  interest:  number;
  balance:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function calcSchedule(
  price: number,
  downPct: number,
  termMonths: number,
  annualRate: number,
): ScheduleRow[] {
  const down    = price * (downPct / 100);
  const loan    = price - down;
  if (loan <= 0 || termMonths <= 0) return [];

  const r = annualRate / 100 / 12; // monthly rate
  const rows: ScheduleRow[] = [];
  let balance = loan;

  for (let m = 1; m <= termMonths; m++) {
    const interest  = r > 0 ? balance * r : 0;
    const payment   = r > 0
      ? loan * (r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)
      : loan / termMonths;
    const principal = payment - interest;
    balance = Math.max(0, balance - principal);
    rows.push({ month: m, payment, principal, interest, balance });
  }
  return rows;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TERM_OPTIONS = [12, 24, 36, 48, 60];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const [price,      setPrice]      = useState("150000");
  const [downPct,    setDownPct]    = useState(30);
  const [termMonths, setTermMonths] = useState(36);
  const [annualRate, setAnnualRate] = useState("0");
  const [showAll,    setShowAll]    = useState(false);

  const priceNum = parseFloat(price)  || 0;
  const rateNum  = parseFloat(annualRate) || 0;

  const schedule = useMemo(
    () => calcSchedule(priceNum, downPct, termMonths, rateNum),
    [priceNum, downPct, termMonths, rateNum],
  );

  const downAmount    = priceNum * (downPct / 100);
  const loanAmount    = priceNum - downAmount;
  const monthlyPmt    = schedule[0]?.payment ?? 0;
  const totalPayment  = schedule.reduce((s, r) => s + r.payment, 0) + downAmount;
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);

  const visibleRows = showAll ? schedule : schedule.slice(0, 12);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div className="flex items-center gap-2.5">
          <Calculator className="w-4 h-4" style={{ color: "#6366f1" }} />
          <div>
            <h1 className="text-sm font-semibold text-white">Калькулятор рассрочки</h1>
            <p className="text-xs" style={{ color: "#475569" }}>Расчёт платежей по квартире</p>
          </div>
        </div>
        <button
          onClick={() => alert("Функция PDF в разработке")}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors hover:border-indigo-500/40"
          style={{ borderColor: "#1e2536", color: "#64748b", backgroundColor: "#080b14" }}
        >
          <Download className="w-3.5 h-3.5" />
          Скачать PDF
        </button>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Inputs ── */}
          <div className="rounded-xl border p-6 space-y-5"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <h2 className="text-sm font-semibold text-white">Параметры</h2>

            {/* Price */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-2"
                style={{ color: "#94a3b8" }}>
                <DollarSign className="w-3.5 h-3.5" />
                Стоимость квартиры ($)
              </label>
              <input
                type="number" min={0} step={1000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm text-white outline-none font-mono"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
              />
            </div>

            {/* Down payment slider */}
            <div>
              <label className="flex items-center justify-between text-xs font-medium mb-2">
                <span className="flex items-center gap-1.5" style={{ color: "#94a3b8" }}>
                  <Percent className="w-3.5 h-3.5" />
                  Первоначальный взнос
                </span>
                <span className="text-base font-bold" style={{ color: "#6366f1" }}>
                  {downPct}%
                </span>
              </label>
              <input
                type="range" min={10} max={50} step={5}
                value={downPct}
                onChange={(e) => setDownPct(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: "#334155" }}>
                <span>10%</span>
                <span className="font-medium" style={{ color: "#94a3b8" }}>
                  = ${fmt(downAmount)}
                </span>
                <span>50%</span>
              </div>
            </div>

            {/* Term */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-2"
                style={{ color: "#94a3b8" }}>
                <Calendar className="w-3.5 h-3.5" />
                Срок рассрочки (месяцев)
              </label>
              <div className="grid grid-cols-5 gap-2">
                {TERM_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTermMonths(t)}
                    className="py-2.5 rounded-lg text-xs font-semibold border transition-colors"
                    style={{
                      backgroundColor: termMonths === t ? "#1e1b4b" : "#080b14",
                      borderColor:     termMonths === t ? "#6366f1" : "#1e2536",
                      color:           termMonths === t ? "#a5b4fc" : "#475569",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Interest rate */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-2"
                style={{ color: "#94a3b8" }}>
                <TrendingDown className="w-3.5 h-3.5" />
                Процентная ставка (% годовых)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={0} max={50} step={0.5}
                  value={annualRate}
                  onChange={(e) => setAnnualRate(e.target.value)}
                  className="flex-1 rounded-lg px-4 py-3 text-sm text-white outline-none font-mono"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                />
                <button
                  onClick={() => setAnnualRate("0")}
                  className="px-3 py-3 rounded-lg text-xs border transition-colors"
                  style={{
                    borderColor:     rateNum === 0 ? "#6366f1" : "#1e2536",
                    backgroundColor: rateNum === 0 ? "#1e1b4b" : "#080b14",
                    color:           rateNum === 0 ? "#a5b4fc" : "#475569",
                  }}
                >
                  0% (от застройщика)
                </button>
              </div>
            </div>
          </div>

          {/* ── Results ── */}
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Ежемесячный платёж", value: `$${fmt(monthlyPmt)}`,   color: "#a5b4fc", accent: "#6366f1" },
                { label: "Сумма кредита",       value: `$${fmt(loanAmount)}`,   color: "white",   accent: "#1e2536" },
                { label: "Итого выплат",        value: `$${fmt(totalPayment)}`, color: "white",   accent: "#1e2536" },
                { label: "Переплата",           value: `$${fmt(totalInterest)}`,
                  color: totalInterest > 0 ? "#fbbf24" : "#34d399",
                  accent: "#1e2536" },
              ].map(({ label, value, color, accent }) => (
                <div
                  key={label}
                  className="rounded-xl border p-4"
                  style={{ backgroundColor: "#0d1117", borderColor: accent }}
                >
                  <p className="text-xs mb-1.5" style={{ color: "#475569" }}>{label}</p>
                  <p className="text-lg font-bold font-mono" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Visual breakdown bar */}
            {priceNum > 0 && (
              <div className="rounded-xl border p-4"
                style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
                <p className="text-xs font-medium mb-3" style={{ color: "#94a3b8" }}>
                  Структура платежей
                </p>
                <div className="w-full h-3 rounded-full overflow-hidden flex"
                  style={{ backgroundColor: "#1e2536" }}>
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(downAmount / totalPayment) * 100}%`,
                      backgroundColor: "#6366f1",
                    }}
                  />
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${(loanAmount / totalPayment) * 100}%`,
                      backgroundColor: "#10b981",
                    }}
                  />
                  {totalInterest > 0 && (
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${(totalInterest / totalPayment) * 100}%`,
                        backgroundColor: "#f59e0b",
                      }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2.5">
                  {[
                    { dot: "#6366f1", label: "Взнос",    value: `$${fmt(downAmount)}`    },
                    { dot: "#10b981", label: "Основной", value: `$${fmt(loanAmount)}`    },
                    ...(totalInterest > 0
                      ? [{ dot: "#f59e0b", label: "Проценты", value: `$${fmt(totalInterest)}` }]
                      : []),
                  ].map(({ dot, label, value }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dot }} />
                      <span className="text-xs" style={{ color: "#64748b" }}>
                        {label}: <span className="text-white">{value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Payment schedule ── */}
        {schedule.length > 0 && (
          <div className="rounded-xl border overflow-hidden"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b"
              style={{ borderColor: "#1e2536" }}>
              <h3 className="text-sm font-semibold text-white">График платежей</h3>
              <span className="text-xs" style={{ color: "#475569" }}>
                {termMonths} месяцев
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2536", backgroundColor: "#080b14" }}>
                    {["Месяц", "Платёж", "Основной долг", "Проценты", "Остаток"].map((h) => (
                      <th key={h}
                        className="px-4 py-3 text-left font-medium whitespace-nowrap"
                        style={{ color: "#475569" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, i) => (
                    <tr
                      key={row.month}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: i < visibleRows.length - 1 ? "1px solid #1e2536" : undefined }}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#64748b" }}>
                        {row.month}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-white">
                        ${fmt(row.payment)}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "#34d399" }}>
                        ${fmt(row.principal)}
                      </td>
                      <td className="px-4 py-2.5 font-mono"
                        style={{ color: row.interest > 0 ? "#fbbf24" : "#334155" }}>
                        ${fmt(row.interest)}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "#94a3b8" }}>
                        ${fmt(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {schedule.length > 12 && (
              <div className="px-5 py-3 border-t" style={{ borderColor: "#1e2536" }}>
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="text-xs font-medium transition-colors hover:text-white"
                  style={{ color: "#6366f1" }}
                >
                  {showAll
                    ? "Скрыть · показать первые 12"
                    : `Показать все ${schedule.length} месяцев`}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
