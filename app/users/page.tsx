"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  Plus, X, Loader2, ShieldCheck, ShieldAlert,
  UserPlus, Users, TrendingUp, DollarSign, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserRole = "admin" | "manager" | "viewer";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
}

interface ClientRow {
  id: string;
  assigned_to: string | null;
  status: string;
  budget_usd: number | null;
}

interface ManagerStats {
  totalClients: number;
  dealsClosed: number;
  revenue: number;
}

interface InviteForm {
  email: string;
  full_name: string;
  role: UserRole;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; bg: string; text: string }> = {
  admin:   { label: "Admin",   bg: "#1e1b4b", text: "#a5b4fc" },
  manager: { label: "Manager", bg: "#052e16", text: "#34d399" },
  viewer:  { label: "Viewer",  bg: "#1e2536", text: "#64748b" },
};

const ROLE_OPTIONS: UserRole[] = ["admin", "manager", "viewer"];
const EMPTY_FORM: InviteForm   = { email: "", full_name: "", role: "manager" };

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

export default function UsersPage() {
  const router = useRouter();
  const [checkingRole, setCheckingRole] = useState(true);
  const [isAdmin, setIsAdmin]           = useState(false);

  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // Invite modal
  const [showInvite, setShowInvite]   = useState(false);
  const [form, setForm]               = useState<InviteForm>(EMPTY_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState(false);

  // ── Auth guard ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const role = getRoleCookie();
    setIsAdmin(role === "admin");
    setCheckingRole(false);
  }, []);

  // ── Fetch users + clients for manager stats ────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [usersRes, clientsRes] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("id, full_name, email, role, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("id, assigned_to, status, budget_usd"),
    ]);
    if (usersRes.error)   setError(usersRes.error.message);
    else setUsers((usersRes.data as UserProfile[]) ?? []);
    if (!clientsRes.error) setClients((clientsRes.data as ClientRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) fetchData();
  }, [isAdmin, fetchData]);

  // ── Per-manager stats ─────────────────────────────────────────────────────

  function statsForManager(managerId: string): ManagerStats {
    const mine = clients.filter((c) => c.assigned_to === managerId);
    const sold  = mine.filter((c) => c.status === "bought");
    return {
      totalClients: mine.length,
      dealsClosed:  sold.length,
      revenue:      sold.reduce((s, c) => s + (c.budget_usd ?? 0), 0),
    };
  }

  // ── Invite ────────────────────────────────────────────────────────────────

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(false);
    if (!form.email.trim())     { setFormError("Email is required."); return; }
    if (!form.full_name.trim()) { setFormError("Full name is required."); return; }

    setSubmitting(true);
    const { error: err } = await supabase.from("user_profiles").insert({
      email:     form.email.trim().toLowerCase(),
      full_name: form.full_name.trim(),
      role:      form.role,
    });
    setSubmitting(false);
    if (err) { setFormError(err.message); return; }

    setFormSuccess(true);
    setTimeout(() => {
      setShowInvite(false); setForm(EMPTY_FORM); setFormSuccess(false); fetchData();
    }, 1200);
  }

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
            <p className="text-sm mt-1.5" style={{ color: "#64748b" }}>This page is only accessible to admins.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const managers = users.filter((u) => u.role === "manager");
  const others   = users.filter((u) => u.role !== "manager");

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: "#6366f1" }} />
            <h1 className="text-sm font-semibold text-white">User Management</h1>
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            {loading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setFormError(null); setFormSuccess(false); setShowInvite(true); }}
          className="flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-2 rounded-lg hover:opacity-80"
          style={{ backgroundColor: "#6366f1" }}
        >
          <UserPlus className="w-4 h-4" />Invite user
        </button>
      </header>

      <main className="px-6 py-6 w-full space-y-6">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Role summary */}
        <div className="grid grid-cols-3 gap-4">
          {ROLE_OPTIONS.map((r) => {
            const count = users.filter((u) => u.role === r).length;
            const cfg   = ROLE_CONFIG[r];
            return (
              <div key={r} className="rounded-xl border p-4 flex items-center gap-4"
                style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
                <div className="flex items-center justify-center w-9 h-9 rounded-lg"
                  style={{ backgroundColor: cfg.bg }}>
                  <span className="text-sm font-bold" style={{ color: cfg.text }}>{count}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{cfg.label}s</p>
                  <p className="text-xs" style={{ color: "#475569" }}>{count} user{count !== 1 ? "s" : ""}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Manager cards */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-40 rounded-xl border animate-pulse"
                style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }} />
            ))}
          </div>
        ) : (
          <>
            <div>
              <h2 className="text-sm font-semibold text-white mb-3">
                Managers
                <span className="ml-2 text-xs font-normal" style={{ color: "#475569" }}>
                  Click to view details
                </span>
              </h2>
              {managers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border"
                  style={{ borderColor: "#1e2536", borderStyle: "dashed" }}>
                  <Users className="w-7 h-7" style={{ color: "#1e2536" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>No managers yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {managers.map((mgr) => {
                    const stats    = statsForManager(mgr.id);
                    const initials = avatarInitials(mgr.full_name, mgr.email);
                    const conv     = stats.totalClients > 0
                      ? Math.round((stats.dealsClosed / stats.totalClients) * 100)
                      : 0;
                    return (
                      <button
                        key={mgr.id}
                        onClick={() => router.push(`/users/${mgr.id}`)}
                        className="rounded-xl border p-5 text-left flex flex-col gap-4 transition-all hover:border-indigo-500/40 group"
                        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold shrink-0"
                              style={{ backgroundColor: "#052e16", color: "#34d399" }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white truncate">
                                {mgr.full_name ?? "—"}
                              </p>
                              <p className="text-xs truncate" style={{ color: "#64748b" }}>
                                {mgr.email ?? "—"}
                              </p>
                            </div>
                          </div>
                          <ChevronRight
                            className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                            style={{ color: "#334155" }}
                          />
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg p-2.5 text-center"
                            style={{ backgroundColor: "#080b14" }}>
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <Users className="w-3 h-3" style={{ color: "#6366f1" }} />
                            </div>
                            <p className="text-base font-bold text-white">{stats.totalClients}</p>
                            <p className="text-xs" style={{ color: "#475569" }}>Clients</p>
                          </div>
                          <div className="rounded-lg p-2.5 text-center"
                            style={{ backgroundColor: "#080b14" }}>
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <TrendingUp className="w-3 h-3" style={{ color: "#10b981" }} />
                            </div>
                            <p className="text-base font-bold text-white">{stats.dealsClosed}</p>
                            <p className="text-xs" style={{ color: "#475569" }}>Deals</p>
                          </div>
                          <div className="rounded-lg p-2.5 text-center"
                            style={{ backgroundColor: "#080b14" }}>
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <DollarSign className="w-3 h-3" style={{ color: "#f59e0b" }} />
                            </div>
                            <p className="text-base font-bold text-white">
                              {stats.revenue > 0 ? `$${(stats.revenue / 1000).toFixed(0)}k` : "—"}
                            </p>
                            <p className="text-xs" style={{ color: "#475569" }}>Revenue</p>
                          </div>
                        </div>

                        {/* Conversion bar */}
                        <div>
                          <div className="flex justify-between text-xs mb-1.5">
                            <span style={{ color: "#475569" }}>Conversion</span>
                            <span style={{ color: "#64748b" }}>{conv}%</span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ backgroundColor: "#1e2536" }}>
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${conv}%`, backgroundColor: "#10b981" }}
                            />
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Admins + Viewers table */}
            {others.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-white mb-3">Other users</h2>
                <div className="rounded-xl border overflow-hidden"
                  style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2536" }}>
                        {["User", "Email", "Role", "Joined"].map((h) => (
                          <th key={h} className="px-5 py-3 text-left text-xs font-medium"
                            style={{ color: "#475569" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {others.map((user, i) => {
                        const cfg      = ROLE_CONFIG[user.role];
                        const initials = avatarInitials(user.full_name, user.email);
                        const joined   = new Date(user.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                        });
                        return (
                          <tr key={user.id} className="transition-colors hover:bg-white/[0.02]"
                            style={{ borderBottom: i < others.length - 1 ? "1px solid #1e2536" : undefined }}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div
                                  className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0"
                                  style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                  {initials}
                                </div>
                                <span className="text-sm font-medium text-white">{user.full_name ?? "—"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-sm" style={{ color: "#64748b" }}>
                              {user.email ?? "—"}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                                style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                {cfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>{joined}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-md rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-white">Invite user</h2>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                  Creates a profile record. Send login credentials separately.
                </p>
              </div>
              <button onClick={() => setShowInvite(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Full name <span style={{ color: "#6366f1" }}>*</span>
                </label>
                <input type="text" required placeholder="Dilnoza Yusupova"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Email <span style={{ color: "#6366f1" }}>*</span>
                </label>
                <input type="email" required placeholder="user@proptech.uz"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLE_OPTIONS.map((r) => {
                    const cfg    = ROLE_CONFIG[r];
                    const active = form.role === r;
                    return (
                      <button key={r} type="button"
                        onClick={() => setForm((f) => ({ ...f, role: r }))}
                        className="flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-semibold transition-colors"
                        style={{
                          backgroundColor: active ? cfg.bg  : "#080b14",
                          borderColor:     active ? cfg.text : "#1e2536",
                          color:           active ? cfg.text : "#475569",
                        }}>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError   && <p className="text-sm" style={{ color: "#fca5a5" }}>{formError}</p>}
              {formSuccess  && <p className="text-sm" style={{ color: "#34d399" }}>User added successfully!</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting || formSuccess}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: formSuccess ? "#052e16" : "#6366f1", color: formSuccess ? "#34d399" : "white" }}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Adding…</>
                    : formSuccess ? "Added!" : <><Plus className="w-4 h-4" />Add user</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
