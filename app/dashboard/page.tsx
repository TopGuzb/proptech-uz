"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Building2,
  TrendingUp,
  DollarSign,
  Home,
  Bell,
  Search,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Lightbulb,
  Loader2,
} from "lucide-react";
import AppShell from "@/components/AppShell";

// ── Placeholder data ──────────────────────────────────────────────────────────

const monthlySales = [
  { month: "Sep", revenue: 820, units: 12 },
  { month: "Oct", revenue: 1140, units: 17 },
  { month: "Nov", revenue: 980, units: 14 },
  { month: "Dec", revenue: 1350, units: 21 },
  { month: "Jan", revenue: 1620, units: 24 },
  { month: "Feb", revenue: 1480, units: 19 },
  { month: "Mar", revenue: 1890, units: 28 },
];

const projectData = [
  { name: "Tashkent City", sold: 84, available: 36, reserved: 12 },
  { name: "Yunusobod", sold: 61, available: 19, reserved: 8 },
  { name: "Mirzo Ulugbek", sold: 45, available: 55, reserved: 5 },
  { name: "Sergeli", sold: 32, available: 68, reserved: 3 },
];

const recentTransactions = [
  { id: "TXN-001", client: "Alisher Nazarov", apartment: "A-214", project: "Tashkent City", amount: "$85,000", date: "Mar 07", status: "completed" },
  { id: "TXN-002", client: "Dilnoza Yusupova", apartment: "B-108", project: "Yunusobod", amount: "$62,500", date: "Mar 06", status: "pending" },
  { id: "TXN-003", client: "Bobur Tashmatov", apartment: "C-315", project: "Mirzo Ulugbek", amount: "$74,000", date: "Mar 05", status: "completed" },
  { id: "TXN-004", client: "Malika Akhmedova", apartment: "A-101", project: "Sergeli", amount: "$48,000", date: "Mar 04", status: "reserved" },
  { id: "TXN-005", client: "Jasur Mirzaev", apartment: "D-220", project: "Tashkent City", amount: "$91,000", date: "Mar 03", status: "completed" },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  title: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ReactNode;
  accent: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ title, value, change, positive, icon, accent }: MetricCardProps) {
  return (
    <div
      className="rounded-xl p-5 border flex flex-col gap-4"
      style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium" style={{ color: "#64748b" }}>
          {title}
        </p>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ backgroundColor: `${accent}18` }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <div className="flex items-center gap-1 mt-1">
          {positive ? (
            <ChevronUp className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
          )}
          <span
            className="text-xs font-medium"
            style={{ color: positive ? "#10b981" : "#ef4444" }}
          >
            {change}
          </span>
          <span className="text-xs" style={{ color: "#334155" }}>
            vs last month
          </span>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: "#052e16", text: "#10b981", label: "Completed" },
  pending:   { bg: "#1c1003", text: "#f59e0b", label: "Pending" },
  reserved:  { bg: "#1e1b4b", text: "#6366f1", label: "Reserved" },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");

  // ── AI Insights ──────────────────────────────────────────────────────────
  const [insights, setInsights]     = useState<string[]>([]);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState<string | null>(null);

  async function fetchInsights() {
    setAiLoading(true);
    setAiError(null);
    setInsights([]);
    try {
      const res = await fetch("/api/ai-insights");
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setInsights(json.insights ?? []);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to fetch insights");
    } finally {
      setAiLoading(false);
    }
  }

  const filteredTransactions = recentTransactions.filter(
    (t) =>
      t.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.apartment.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppShell>
      {/* ── Top bar ── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white">Overview</h1>
          <p className="text-xs" style={{ color: "#475569" }}>March 2026 · All projects</p>
        </div>
        <button
          className="relative p-2 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "#64748b" }}
        >
          <Bell className="w-4 h-4" />
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#6366f1" }}
          />
        </button>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto space-y-6 w-full">
        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Apartments"
            value="1,248"
            change="+8.2%"
            positive
            accent="#6366f1"
            icon={<Building2 className="w-4 h-4" />}
          />
          <MetricCard
            title="Sold"
            value="834"
            change="+14.5%"
            positive
            accent="#10b981"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard
            title="Available"
            value="294"
            change="-3.1%"
            positive={false}
            accent="#f59e0b"
            icon={<Home className="w-4 h-4" />}
          />
          <MetricCard
            title="Revenue"
            value="$18.4M"
            change="+22.8%"
            positive
            accent="#6366f1"
            icon={<DollarSign className="w-4 h-4" />}
          />
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Revenue trend */}
          <div
            className="lg:col-span-3 rounded-xl border p-5"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-white">
                Revenue Trend
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Monthly revenue in USD thousands
              </p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={monthlySales} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2536" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#475569", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#475569", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1117",
                    border: "1px solid #1e2536",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e2e8f0",
                  }}
                  formatter={(v) => [`$${v}K`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#revenueGrad)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Units by project */}
          <div
            className="lg:col-span-2 rounded-xl border p-5"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-white">
                Units by Project
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Sold vs available
              </p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={projectData}
                layout="vertical"
                margin={{ top: 0, right: 4, left: 0, bottom: 0 }}
                barSize={8}
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2536" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#475569", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={90}
                  tick={{ fill: "#475569", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1117",
                    border: "1px solid #1e2536",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "#e2e8f0",
                  }}
                />
                <Bar dataKey="sold" fill="#10b981" radius={[0, 4, 4, 0]} name="Sold" />
                <Bar dataKey="available" fill="#1e2536" radius={[0, 4, 4, 0]} name="Available" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Recent transactions ── */}
        <div
          className="rounded-xl border"
          style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "#1e2536" }}
          >
            <div>
              <h2 className="text-sm font-semibold text-white">
                Recent Transactions
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Latest apartment sales and reservations
              </p>
            </div>
            <div
              className="flex items-center gap-2 rounded-lg px-3 py-1.5"
              style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
            >
              <Search className="w-3.5 h-3.5" style={{ color: "#475569" }} />
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-white outline-none placeholder:text-slate-600 w-32"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2536" }}>
                  {["ID", "Client", "Apartment", "Project", "Amount", "Date", "Status"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left text-xs font-medium"
                        style={{ color: "#475569" }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((t, i) => {
                  const s = STATUS_STYLES[t.status];
                  return (
                    <tr
                      key={t.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{
                        borderBottom:
                          i < filteredTransactions.length - 1
                            ? "1px solid #1e2536"
                            : undefined,
                      }}
                    >
                      <td
                        className="px-5 py-3.5 text-xs font-mono"
                        style={{ color: "#475569" }}
                      >
                        {t.id}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-white font-medium">
                        {t.client}
                      </td>
                      <td
                        className="px-5 py-3.5 text-sm font-mono"
                        style={{ color: "#94a3b8" }}
                      >
                        {t.apartment}
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: "#94a3b8" }}>
                        {t.project}
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-white">
                        {t.amount}
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: "#64748b" }}>
                        {t.date}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: s.bg, color: s.text }}
                        >
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {/* ── AI Insights ── */}
        <div
          className="rounded-xl border"
          style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "#1e2536" }}
          >
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: "#6366f1" }} />
                <h2 className="text-sm font-semibold text-white">AI Insights</h2>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                Claude analyses your real sales data and gives recommendations in Russian
              </p>
            </div>
            <button
              onClick={fetchInsights}
              disabled={aiLoading}
              className="flex items-center gap-2 text-sm font-medium text-white px-4 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: "#6366f1" }}
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Analysing…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Analyse with AI
                </>
              )}
            </button>
          </div>

          <div className="p-5">
            {/* Error */}
            {aiError && (
              <div
                className="rounded-lg px-4 py-3 text-sm border"
                style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}
              >
                {aiError}
              </div>
            )}

            {/* Loading skeleton */}
            {aiLoading && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl border animate-pulse"
                    style={{ backgroundColor: "#080b14", borderColor: "#1e2536" }}
                  />
                ))}
              </div>
            )}

            {/* Insight cards */}
            {!aiLoading && insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {insights.map((text, i) => (
                  <div
                    key={i}
                    className="rounded-xl border p-4 flex flex-col gap-3"
                    style={{ backgroundColor: "#080b14", borderColor: "#1e2536" }}
                  >
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                      style={{ backgroundColor: "#1e1b4b" }}
                    >
                      <Lightbulb className="w-4 h-4" style={{ color: "#6366f1" }} />
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "#cbd5e1" }}>
                      {text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!aiLoading && !aiError && insights.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-xl"
                  style={{ backgroundColor: "#1e1b4b" }}
                >
                  <Sparkles className="w-5 h-5" style={{ color: "#6366f1" }} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white">No insights yet</p>
                  <p className="text-xs mt-1" style={{ color: "#475569" }}>
                    Click "Analyse with AI" to get Claude&apos;s analysis of your sales data.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
