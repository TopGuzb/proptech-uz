// ─────────────────────────────────────────────────────────────────────────────
// app/seller/dashboard/page.tsx
//
// Route:  /seller/dashboard   (managers only — admins/viewers get redirected
//                              to /dashboard by middleware.ts)
//
// The manager's home screen — focused on THEIR pipeline only.
//
// Sections:
//   1. Greeting + personal stats (clients in pipeline, deals closed this month,
//      personal revenue).
//   2. Quick-add client button (opens same modal as /clients).
//   3. "Hot leads" list  — clients in Reserved / Viewing stages, sorted by
//      most recent activity.
//   4. Recent activity feed scoped to manager_id = currentUser.id.
//
// All Supabase queries here filter by manager_id; no admin-wide aggregates.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  Users, TrendingUp, DollarSign, BarChart2,
  ChevronDown, ChevronUp, Loader2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientStatus = "new" | "contacted" | "viewing" | "reserved" | "bought";

interface MyClient {
  id:         string;
  full_name:  string;
  phone:      string | null;
  email:      string | null;
  budget_usd: number | null;
  status:     ClientStatus;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ClientStatus, { label: string; bg: string; text: string; dot: string }> = {
  new:       { label: "New",       bg: "#1e2536", text: "#64748b", dot: "#475569" },
  contacted: { label: "Contacted", bg: "#1e1b4b", text: "#a5b4fc", dot: "#6366f1" },
  viewing:   { label: "Viewing",   bg: "#1c1003", text: "#fbbf24", dot: "#f59e0b" },
  reserved:  { label: "Reserved",  bg: "#052e16", text: "#34d399", dot: "#10b981" },
  bought:    { label: "Bought",    bg: "#14532d", text: "#86efac", dot: "#22c55e" },
};

const ALL_STATUSES: ClientStatus[] = ["new", "contacted", "viewing", "reserved", "bought"];

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, accent, icon, positive,
}: {
  title: string; value: string; sub: string; accent: string;
  icon: React.ReactNode; positive?: boolean;
}) {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4"
      style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium" style={{ color: "#64748b" }}>{title}</p>
        <div className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ backgroundColor: `${accent}20` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <div className="flex items-center gap-1 mt-1">
          {positive !== undefined && (
            positive
              ? <ChevronUp   className="w-3.5 h-3.5" style={{ color: "#10b981" }} />
              : <ChevronDown className="w-3.5 h-3.5" style={{ color: "#ef4444" }} />
          )}
          <span className="text-xs" style={{ color: "#475569" }}>{sub}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SellerDashboardPage() {
  const router = useRouter();

  const [userId,      setUserId]      = useState<string | null>(null);
  const [userName,    setUserName]    = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [myClients,    setMyClients]    = useState<MyClient[]>([]);
  const [loadingData,  setLoadingData]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const [statusFilter,    setStatusFilter]    = useState<"all" | ClientStatus>("all");
  const [updatingStatus,  setUpdatingStatus]  = useState<Set<string>>(new Set());

  // ── Auth ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUserId(data.user.id);
      setUserName(
        data.user.user_metadata?.full_name ??
        data.user.email?.split("@")[0] ??
        "You"
      );
      setLoadingAuth(false);
    });
  }, [router]);

  // ── Fetch — only MY clients ────────────────────────────────────────────────

  const fetchData = useCallback(async (uid: string) => {
    setLoadingData(true);
    setError(null);
    const { data, error: e } = await supabase
      .from("clients")
      .select("id, full_name, phone, email, budget_usd, status, created_at")
      .eq("assigned_to", uid)
      .order("created_at", { ascending: false });
    if (e) setError(e.message);
    else   setMyClients((data as MyClient[]) ?? []);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (userId) fetchData(userId);
  }, [userId, fetchData]);

  // ── Status update ──────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, newStatus: ClientStatus) {
    setUpdatingStatus((prev) => new Set(prev).add(id));
    const { error: err } = await supabase.from("clients").update({ status: newStatus }).eq("id", id);
    setUpdatingStatus((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (err) { setError(err.message); return; }
    setMyClients((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
  }

  // ── Derived stats ──────────────────────────────────────────────────────────

  const boughtCount    = myClients.filter((c) => c.status === "bought").length;
  const revenue        = myClients.filter((c) => c.status === "bought").reduce((s, c) => s + (c.budget_usd ?? 0), 0);
  const conversionRate = myClients.length > 0 ? ((boughtCount / myClients.length) * 100).toFixed(0) : "0";

  const filtered = myClients.filter((c) => statusFilter === "all" || c.status === statusFilter);
  const counts   = myClients.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
    {}
  );

  const loading = loadingAuth || loadingData;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" style={{ color: "#6366f1" }} />
            <h1 className="text-sm font-semibold text-white">My Dashboard</h1>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            {userName ? `Welcome back, ${userName}` : "Personal dashboard"}
          </p>
        </div>
        <div className="text-xs px-3 py-1.5 rounded-full"
          style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
          {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
      </header>

      <main className="px-6 py-6 w-full space-y-6">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6366f1" }} />
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                title="My Clients"
                value={String(myClients.length)}
                sub="assigned to me"
                accent="#6366f1"
                icon={<Users className="w-4 h-4" />}
              />
              <StatCard
                title="Deals Closed"
                value={String(boughtCount)}
                sub={`${conversionRate}% conversion rate`}
                accent="#10b981"
                icon={<TrendingUp className="w-4 h-4" />}
                positive={boughtCount > 0}
              />
              <StatCard
                title="My Revenue"
                value={revenue > 0 ? `$${revenue.toLocaleString()}` : "—"}
                sub="from sold apartments"
                accent="#f59e0b"
                icon={<DollarSign className="w-4 h-4" />}
                positive={revenue > 0}
              />
            </div>

            {/* Pipeline */}
            <div className="rounded-xl border p-5"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <h2 className="text-sm font-semibold text-white mb-4">Pipeline overview</h2>
              <div className="space-y-3">
                {ALL_STATUSES.map((s) => {
                  const cfg   = STATUS_CONFIG[s];
                  const count = counts[s] ?? 0;
                  const pct   = myClients.length > 0 ? Math.round((count / myClients.length) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="text-xs w-20 shrink-0" style={{ color: "#64748b" }}>
                        {cfg.label}
                      </span>
                      <div className="flex-1 rounded-full h-2" style={{ backgroundColor: "#1e2536" }}>
                        <div className="h-2 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: cfg.dot }} />
                      </div>
                      <span className="text-xs w-8 text-right font-mono" style={{ color: "#475569" }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* My clients table */}
            <div className="rounded-xl border" style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <div className="flex items-center justify-between px-5 py-4 border-b"
                style={{ borderColor: "#1e2536" }}>
                <div>
                  <h2 className="text-sm font-semibold text-white">My Clients</h2>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    {filtered.length} of {myClients.length}
                  </p>
                </div>
                {/* Status filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[{ value: "all", label: "All" }, ...ALL_STATUSES.map((s) => ({
                    value: s, label: STATUS_CONFIG[s].label,
                  }))].map(({ value, label }) => {
                    const active = statusFilter === value;
                    return (
                      <button key={value}
                        onClick={() => setStatusFilter(value as typeof statusFilter)}
                        className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                        style={{
                          backgroundColor: active ? "#1e1b4b" : "transparent",
                          borderColor:     active ? "#6366f1" : "#1e2536",
                          color:           active ? "#a5b4fc" : "#475569",
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {myClients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Users className="w-8 h-8" style={{ color: "#1e2536" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>No clients assigned to you yet.</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: "#475569" }}>
                  No clients with status "{statusFilter}".
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2536" }}>
                        {["Client", "Contact", "Budget", "Status", "Added", ""].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium"
                            style={{ color: "#475569" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((client, i) => {
                        const cfg        = STATUS_CONFIG[client.status];
                        const isUpdating = updatingStatus.has(client.id);
                        const added      = new Date(client.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric",
                        });
                        return (
                          <tr key={client.id}
                            className="transition-colors hover:bg-white/[0.02]"
                            style={{
                              borderBottom: i < filtered.length - 1 ? "1px solid #1e2536" : undefined,
                              opacity: isUpdating ? 0.6 : 1,
                            }}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                                  style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                  {client.full_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-white">{client.full_name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-0.5">
                                {client.phone && (
                                  <a href={`tel:${client.phone}`} className="text-xs" style={{ color: "#64748b" }}>
                                    {client.phone}
                                  </a>
                                )}
                                {client.email && (
                                  <a href={`mailto:${client.email}`} className="text-xs" style={{ color: "#64748b" }}>
                                    {client.email}
                                  </a>
                                )}
                                {!client.phone && !client.email && (
                                  <span className="text-xs" style={{ color: "#334155" }}>—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-sm"
                              style={{ color: client.budget_usd ? "white" : "#334155" }}>
                              {client.budget_usd ? `$${client.budget_usd.toLocaleString()}` : "—"}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{added}</td>
                            <td className="px-5 py-3.5">
                              <div className="relative inline-flex items-center">
                                <select value={client.status} disabled={isUpdating}
                                  onChange={(e) => handleStatusChange(client.id, e.target.value as ClientStatus)}
                                  className="appearance-none text-xs pr-5 pl-1.5 py-1 rounded-md outline-none cursor-pointer disabled:cursor-not-allowed"
                                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536", color: "#475569" }}>
                                  {ALL_STATUSES.map((s) => (
                                    <option key={s} value={s} style={{ backgroundColor: "#0d1117" }}>
                                      {STATUS_CONFIG[s].label}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-1 pointer-events-none w-3 h-3"
                                  style={{ color: "#334155" }} />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
}
