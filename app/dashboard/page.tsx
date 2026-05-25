// ─────────────────────────────────────────────────────────────────────────────
// app/dashboard/page.tsx
//
// Route:  /dashboard   (admin + viewer only — middleware bounces managers
//                       to /seller/dashboard)
//
// This is the main analytics dashboard. Sections, top to bottom:
//   1. Greeting header with role badge
//   2. Four metric cards  (revenue, sold, reserved, conversion)
//   3. Charts row         (sales over time + status breakdown)
//   4. Recent activity feed (notifications bell content inline)
//   5. AI Insights panel  → calls GET /api/ai-insights when user clicks
//                            "Analyse with AI"
//
// Data sources: pulls everything from Supabase tables  apartments, clients,
// projects, user_profiles. No props — it's a top-level page.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Building2, TrendingUp, DollarSign, Home, Bell, Search,
  ChevronUp, ChevronDown, Sparkles, Lightbulb, Loader2,
  Wrench, Users as UsersIcon, Receipt, Gauge,
} from "lucide-react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { supabase } from "@/lib/supabase";

// ── Static chart data (kept as-is) ───────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  title:    string;
  value:    string;
  change?:  string;
  positive?: boolean;
  loading?: boolean;
  icon:     React.ReactNode;
  accent:   string;
}

interface Transaction {
  id:        string;
  client:    string;
  apartment: string;
  project:   string;
  amount:    string;
  date:      string;
  status:    "completed" | "pending" | "reserved";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({ title, value, change, positive, loading, icon, accent }: MetricCardProps) {
  return (
    <div
      className="metric-card rounded-2xl p-5 flex flex-col gap-4"
      style={{
        backgroundColor: "#0d1117",
        border:          "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.38)" }}>
          {title}
        </p>
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}10)`, border: `1px solid ${accent}25` }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <div>
        {loading ? (
          <div className="h-8 w-28 rounded-lg animate-pulse" style={{ backgroundColor: "rgba(255,255,255,0.06)" }} />
        ) : (
          <p
            className="text-3xl text-white"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {value}
          </p>
        )}
        {change && !loading && (
          <div className="flex items-center gap-1 mt-1.5">
            {positive ? (
              <ChevronUp className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
            )}
            <span className="text-xs font-semibold" style={{ color: positive ? "#10b981" : "#ef4444" }}>
              {change}
            </span>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>vs last month</span>
          </div>
        )}
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

function getRoleCookie(): "admin" | "manager" | "viewer" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )proptech-role=([^;]*)/);
  return m ? (decodeURIComponent(m[1]) as "admin" | "manager" | "viewer") : null;
}

export default function DashboardPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [role, setRole] = useState<"admin" | "manager" | "viewer" | null>(null);

  useEffect(() => { setRole(getRoleCookie()); }, []);

  // ── Real metrics ──────────────────────────────────────────────────────────
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [totalApts,   setTotalApts]   = useState(0);
  const [soldApts,    setSoldApts]    = useState(0);
  const [availApts,   setAvailApts]   = useState(0);
  const [revenue,     setRevenue]     = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    async function loadMetrics() {
      setMetricsLoading(true);
      const [totalRes, soldRes, availRes, revenueRes, txRes] = await Promise.all([
        supabase.from("apartments").select("*", { count: "exact", head: true }),
        supabase.from("apartments").select("*", { count: "exact", head: true }).eq("status", "sold"),
        supabase.from("apartments").select("*", { count: "exact", head: true }).eq("status", "available"),
        supabase.from("apartments").select("price").eq("status", "sold"),
        supabase
          .from("clients")
          .select("id, full_name, status, created_at, apartments(number, price)")
          .in("status", ["reserved", "bought"])
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      setTotalApts(totalRes.count ?? 0);
      setSoldApts(soldRes.count ?? 0);
      setAvailApts(availRes.count ?? 0);
      setRevenue((revenueRes.data ?? []).reduce((sum, a) => sum + (a.price || 0), 0));

      // build transaction rows from real client data
      const rows: Transaction[] = (txRes.data ?? []).map((c, i) => {
        const apt = (c.apartments as { number: string; price: number }[] | undefined)?.[0];
        return {
          id:        `TXN-${String(i + 1).padStart(3, "0")}`,
          client:    c.full_name,
          apartment: apt ? `№${apt.number}` : "—",
          project:   "—",
          amount:    apt ? `$${apt.price.toLocaleString()}` : "—",
          date:      new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          status:    c.status === "bought" ? "completed" : "reserved",
        };
      });
      setTransactions(rows);
      setMetricsLoading(false);
    }
    loadMetrics();
  }, []);

  // ── Notifications ─────────────────────────────────────────────────────────
  const [showNotif,    setShowNotif]    = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifications, setNotifications] = useState<
    { id: string; full_name: string; status: string; created_at: string }[]
  >([]);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("id, full_name, status, created_at")
      .neq("status", "new")
      .order("created_at", { ascending: false })
      .limit(5);
    setNotifications(data ?? []);
    setNotifLoading(false);
  }, []);

  function toggleNotif() {
    if (!showNotif) fetchNotifications();
    setShowNotif((v) => !v);
  }

  // Close on outside click
  useEffect(() => {
    if (!showNotif) return;
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showNotif]);

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)   return "только что";
    if (m < 60)  return `${m} мин. назад`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h} ч. назад`;
    return `${Math.floor(h / 24)} д. назад`;
  }

  const STATUS_NOTIF: Record<string, { label: string; color: string }> = {
    contacted: { label: "Контакт",  color: "#6366f1" },
    viewing:   { label: "Просмотр", color: "#f59e0b" },
    reserved:  { label: "Бронь",    color: "#10b981" },
    bought:    { label: "Продано",  color: "#22c55e" },
  };

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

  const filteredTransactions = transactions.filter(
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
        style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            {(() => {
              const h = new Date().getHours();
              return h < 12 ? "Good morning 👋" : h < 17 ? "Good afternoon 👋" : "Good evening 👋";
            })()}
          </h1>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Overview · All Projects
          </p>
        </div>
        <div className="relative" ref={notifRef}>
          <button
            onClick={toggleNotif}
            className="relative p-2 rounded-lg transition-colors hover:bg-white/5"
            style={{ color: showNotif ? "#a5b4fc" : "#64748b" }}
          >
            <Bell className="w-4 h-4" />
            {notifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: "#6366f1" }} />
            )}
          </button>

          {showNotif && (
            <div
              className="absolute right-0 top-10 w-72 rounded-xl border shadow-2xl z-50 overflow-hidden"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "#1e2536" }}>
                <p className="text-xs font-semibold text-white">Уведомления</p>
              </div>

              {notifLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#6366f1" }} />
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs" style={{ color: "#475569" }}>Нет уведомлений</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "#1e2536" }}>
                  {notifications.map((n) => {
                    const cfg = STATUS_NOTIF[n.status];
                    return (
                      <div key={n.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-white truncate">{n.full_name}</p>
                          <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>
                            {timeAgo(n.created_at)}
                          </span>
                        </div>
                        <p className="text-[10px] mt-0.5" style={{ color: cfg?.color ?? "#64748b" }}>
                          → {cfg?.label ?? n.status}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="px-6 py-6 max-w-7xl mx-auto space-y-6 w-full">
        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Apartments"
            value={totalApts.toLocaleString()}
            loading={metricsLoading}
            accent="#6366f1"
            icon={<Building2 className="w-4 h-4" />}
          />
          <MetricCard
            title="Sold"
            value={soldApts.toLocaleString()}
            loading={metricsLoading}
            accent="#10b981"
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard
            title="Available"
            value={availApts.toLocaleString()}
            loading={metricsLoading}
            accent="#f59e0b"
            icon={<Home className="w-4 h-4" />}
          />
          <MetricCard
            title="Revenue"
            value={
              revenue >= 1_000_000
                ? `$${(revenue / 1_000_000).toFixed(1)}M`
                : revenue >= 1_000
                ? `$${(revenue / 1_000).toFixed(0)}K`
                : `$${revenue.toLocaleString()}`
            }
            loading={metricsLoading}
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
        {/* ── Property Management (admin only) ── */}
        {role === "admin" && (
          <div
            className="rounded-xl border"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "#1e2536" }}
            >
              <div>
                <h2 className="text-sm font-semibold text-white">Property Management</h2>
                <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                  Эксплуатация зданий, жильцы и подрядчики
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-5">
              <PMTile
                href="/pm/requests"
                title="Активные заявки"
                value="—"
                hint="Заявки на обслуживание"
                accent="#f59e0b"
                icon={<Wrench className="w-4 h-4" />}
              />
              <PMTile
                href="/pm/vendors"
                title="Vendor база"
                value="—"
                hint="Подрядчики и рейтинги"
                accent="#6366f1"
                icon={<UsersIcon className="w-4 h-4" />}
              />
              <PMTile
                href="/pm/invoices"
                title="Платежи за PM"
                value="—"
                hint="Счета жильцам"
                accent="#10b981"
                icon={<Receipt className="w-4 h-4" />}
              />
              <PMTile
                href="/pm/meters"
                title="Потребление коммуналки"
                value="—"
                hint="Электр. · Газ · Вода"
                accent="#8b5cf6"
                icon={<Gauge className="w-4 h-4" />}
              />
            </div>
          </div>
        )}

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

interface PMTileProps {
  href: string;
  title: string;
  value: string;
  hint: string;
  accent: string;
  icon: React.ReactNode;
}

function PMTile({ href, title, value, hint, accent, icon }: PMTileProps) {
  return (
    <Link
      href={href}
      className="rounded-xl p-4 flex flex-col gap-3 transition-colors hover:bg-white/[0.02]"
      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
    >
      <div className="flex items-start justify-between">
        <p
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: "rgba(255,255,255,0.38)" }}
        >
          {title}
        </p>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-lg"
          style={{
            background: `linear-gradient(135deg, ${accent}22, ${accent}10)`,
            border: `1px solid ${accent}25`,
          }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <div>
        <p
          className="text-2xl text-white"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {value}
        </p>
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.32)" }}>
          {hint}
        </p>
      </div>
    </Link>
  );
}
