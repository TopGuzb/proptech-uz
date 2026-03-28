"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  ArrowLeft, ChevronRight, Users, TrendingUp, DollarSign,
  Loader2, ShieldAlert, Phone, Mail,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManagerProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
}

type ClientStatus = "new" | "contacted" | "viewing" | "reserved" | "bought";

interface ManagerClient {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  budget_usd: number | null;
  status: ClientStatus;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )proptech-role=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function avatarInitials(name: string | null, email: string | null): string {
  const source = name || email || "?";
  return source.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
    || source[0]?.toUpperCase() || "?";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ManagerDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [isAdmin, setIsAdmin]     = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  const [manager, setManager]     = useState<ManagerProfile | null>(null);
  const [clients, setClients]     = useState<ManagerClient[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  // ── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const role = getRoleCookie();
    setIsAdmin(role === "admin");
    setCheckingRole(false);
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [profileRes, clientsRes] = await Promise.all([
      supabase.from("user_profiles").select("id, full_name, email, role, created_at").eq("id", id).single(),
      supabase
        .from("clients")
        .select("id, full_name, phone, email, budget_usd, status, created_at")
        .eq("assigned_to", id)
        .order("created_at", { ascending: false }),
    ]);

    if (profileRes.error) { setError(profileRes.error.message); setLoading(false); return; }
    setManager(profileRes.data as ManagerProfile);
    setClients((clientsRes.data as ManagerClient[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const boughtClients  = clients.filter((c) => c.status === "bought");
  const revenue        = boughtClients.reduce((s, c) => s + (c.budget_usd ?? 0), 0);
  const convRate       = clients.length > 0
    ? Math.round((boughtClients.length / clients.length) * 100)
    : 0;

  const statusCounts = clients.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {}
  );

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (checkingRole) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6366f1" }} />
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center flex-1 gap-5 py-32">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl" style={{ backgroundColor: "#1f0a0a" }}>
            <ShieldAlert className="w-8 h-8" style={{ color: "#ef4444" }} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold text-white">Access denied</h1>
            <p className="text-sm mt-1.5" style={{ color: "#64748b" }}>Admin only.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <button onClick={() => router.push("/users")}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "#64748b" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs" style={{ color: "#475569" }}>Users</span>
          <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "#334155" }} />
          <span className="text-sm font-semibold text-white truncate">
            {loading ? "…" : (manager?.full_name ?? manager?.email ?? "Manager")}
          </span>
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
        ) : manager && (
          <>
            {/* Manager profile card */}
            <div className="rounded-xl border p-5 flex items-center gap-4"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <div
                className="flex items-center justify-center w-14 h-14 rounded-full text-lg font-bold shrink-0"
                style={{ backgroundColor: "#052e16", color: "#34d399" }}
              >
                {avatarInitials(manager.full_name, manager.email)}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white">{manager.full_name ?? "—"}</h1>
                <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>{manager.email ?? "—"}</p>
                <p className="text-xs mt-1" style={{ color: "#475569" }}>
                  Member since {new Date(manager.created_at).toLocaleDateString("en-US", {
                    month: "long", year: "numeric",
                  })}
                </p>
              </div>
              <span
                className="ml-auto inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
                style={{ backgroundColor: "#052e16", color: "#34d399" }}
              >
                Manager
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Clients",     value: String(clients.length),          icon: <Users className="w-4 h-4" />,      accent: "#6366f1" },
                { label: "Deals Closed",      value: String(boughtClients.length),    icon: <TrendingUp className="w-4 h-4" />, accent: "#10b981" },
                { label: "Conversion Rate",   value: `${convRate}%`,                  icon: <TrendingUp className="w-4 h-4" />, accent: "#f59e0b" },
                { label: "Revenue Generated", value: revenue > 0 ? `$${revenue.toLocaleString()}` : "—", icon: <DollarSign className="w-4 h-4" />, accent: "#a855f7" },
              ].map(({ label, value, icon, accent }) => (
                <div key={label} className="rounded-xl border p-4"
                  style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs" style={{ color: "#64748b" }}>{label}</p>
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{ backgroundColor: `${accent}20`, color: accent }}>
                      {icon}
                    </div>
                  </div>
                  <p className="text-xl font-bold text-white">{value}</p>
                </div>
              ))}
            </div>

            {/* Pipeline breakdown */}
            <div className="rounded-xl border p-5"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <h2 className="text-sm font-semibold text-white mb-4">Client pipeline</h2>
              <div className="space-y-3">
                {(["new", "contacted", "viewing", "reserved", "bought"] as ClientStatus[]).map((s) => {
                  const cfg   = STATUS_CONFIG[s];
                  const count = statusCounts[s] ?? 0;
                  const pct   = clients.length > 0 ? Math.round((count / clients.length) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="text-xs w-20 shrink-0" style={{ color: "#64748b" }}>{cfg.label}</span>
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

            {/* Clients table */}
            <div className="rounded-xl border overflow-hidden"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: "#1e2536" }}>
                <h2 className="text-sm font-semibold text-white">
                  Clients
                  <span className="ml-2 text-xs font-normal" style={{ color: "#475569" }}>
                    {clients.length} total
                  </span>
                </h2>
              </div>

              {clients.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Users className="w-7 h-7" style={{ color: "#1e2536" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>No clients assigned.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2536" }}>
                        {["Client", "Contact", "Budget", "Status", "Added"].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium"
                            style={{ color: "#475569" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((client, i) => {
                        const cfg   = STATUS_CONFIG[client.status];
                        const added = new Date(client.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric",
                        });
                        return (
                          <tr key={client.id}
                            className="transition-colors hover:bg-white/[0.02]"
                            style={{ borderBottom: i < clients.length - 1 ? "1px solid #1e2536" : undefined }}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                                  style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                                  {client.full_name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-white">{client.full_name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-col gap-0.5">
                                {client.phone && (
                                  <a href={`tel:${client.phone}`}
                                    className="flex items-center gap-1 text-xs" style={{ color: "#64748b" }}>
                                    <Phone className="w-3 h-3" />{client.phone}
                                  </a>
                                )}
                                {client.email && (
                                  <a href={`mailto:${client.email}`}
                                    className="flex items-center gap-1 text-xs" style={{ color: "#64748b" }}>
                                    <Mail className="w-3 h-3" />{client.email}
                                  </a>
                                )}
                                {!client.phone && !client.email && (
                                  <span className="text-xs" style={{ color: "#334155" }}>—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-sm font-medium"
                              style={{ color: client.budget_usd ? "white" : "#334155" }}>
                              {client.budget_usd ? `$${client.budget_usd.toLocaleString()}` : "—"}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cfg.dot }} />
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>
                              {added}
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
