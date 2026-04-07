"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  Plus, X, Loader2, Search, Users,
  Mail, Phone, ChevronDown, Sparkles, Copy, Check, Home,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ClientStatus = "new" | "contacted" | "viewing" | "reserved" | "bought";

interface LinkedApt {
  id: string;
  number: string;
  floor: number | null;
  size_m2: number;
  price: number;
  status: string;
}

interface Client {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  budget_usd: number | null;
  notes: string | null;
  status: ClientStatus;
  assigned_to: string | null;
  created_at: string;
  apartments?: LinkedApt[];
}

interface CreateForm {
  full_name: string;
  phone: string;
  email: string;
  budget_usd: string;
  notes: string;
}

interface GeneratedEmail {
  subject: string;
  body: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  ClientStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  new:       { label: "New",       bg: "#1e2536", text: "#64748b", dot: "#475569" },
  contacted: { label: "Contacted", bg: "#1e1b4b", text: "#a5b4fc", dot: "#6366f1" },
  viewing:   { label: "Viewing",   bg: "#1c1003", text: "#fbbf24", dot: "#f59e0b" },
  reserved:  { label: "Reserved",  bg: "#052e16", text: "#34d399", dot: "#10b981" },
  bought:    { label: "Bought",    bg: "#14532d", text: "#86efac", dot: "#22c55e" },
};

const ALL_STATUSES: ClientStatus[] = ["new", "contacted", "viewing", "reserved", "bought"];

const STATUS_FILTER_OPTIONS = [
  { value: "all",       label: "All"       },
  { value: "new",       label: "New"       },
  { value: "contacted", label: "Contacted" },
  { value: "viewing",   label: "Viewing"   },
  { value: "reserved",  label: "Reserved"  },
  { value: "bought",    label: "Bought"    },
];

const EMPTY_FORM: CreateForm = { full_name: "", phone: "", email: "", budget_usd: "", notes: "" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )proptech-role=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const router = useRouter();
  const [role, setRole]               = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [clients, setClients]         = useState<Client[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ClientStatus>("all");
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());

  // Add-client modal
  const [showCreate, setShowCreate]   = useState(false);
  const [form, setForm]               = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting]   = useState(false);
  const [formError, setFormError]     = useState<string | null>(null);

  // AI Email modal
  const [emailClientId, setEmailClientId] = useState<string | null>(null);
  const [emailLoading, setEmailLoading]   = useState(false);
  const [emailError, setEmailError]       = useState<string | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<GeneratedEmail | null>(null);
  const [copied, setCopied]               = useState(false);

  // ── Auth: read role + current user id ────────────────────────────────────

  useEffect(() => {
    const r = getRoleCookie();
    setRole(r);
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // ── Data ───────────────────────────────────────────────────────────────────

  const fetchClients = useCallback(async (userRole: string | null, userId: string | null) => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from("clients")
      .select("id, full_name, phone, email, budget_usd, notes, status, assigned_to, created_at, apartments(id, number, floor, size_m2, price, status)")
      .order("created_at", { ascending: false });
    if (userRole !== "admin" && userId) {
      query = query.eq("assigned_to", userId);
    }
    const { data, error: e } = await query;
    if (e) setError(e.message);
    else setClients((data as Client[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Wait until we know the role and (if manager) the userId
    if (role === null) return;               // still reading cookie
    if (role !== "admin" && currentUserId === null) return;  // manager: wait for auth
    fetchClients(role, currentUserId);
  }, [role, currentUserId, fetchClients]);

  // ── Create client ──────────────────────────────────────────────────────────

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault();
    setFormError(null);
    if (!form.full_name.trim()) { setFormError("Full name is required."); return; }

    setSubmitting(true);

    // Always get fresh user id at submit time — state may be stale
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData?.user?.id ?? currentUserId;
    console.log("[clients] submitting as uid:", uid);

    const payload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      status: "new",
      ...(uid && { assigned_to: uid }),
    };
    if (form.phone.trim())    payload.phone      = form.phone.trim();
    if (form.email.trim())    payload.email      = form.email.trim();
    if (form.notes.trim())    payload.notes      = form.notes.trim();
    const budget = parseFloat(form.budget_usd);
    if (!isNaN(budget) && budget > 0) payload.budget_usd = budget;

    console.log("[clients] insert payload:", payload);
    const { data: inserted, error: err } = await supabase
      .from("clients")
      .insert(payload)
      .select()
      .single();
    console.log("[clients] insert result:", inserted, err);

    setSubmitting(false);
    if (err) {
      setFormError(err.message);
      return;
    }
    setForm(EMPTY_FORM);
    setShowCreate(false);
    fetchClients(role, uid ?? currentUserId);
  }

  // ── Status change ──────────────────────────────────────────────────────────

  async function handleStatusChange(id: string, newStatus: ClientStatus) {
    setUpdatingStatus((prev) => new Set(prev).add(id));
    const { error: err } = await supabase.from("clients").update({ status: newStatus }).eq("id", id);
    setUpdatingStatus((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (err) { setError(err.message); return; }
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)));
  }

  // ── AI Email ───────────────────────────────────────────────────────────────

  async function handleGenerateEmail(client: Client) {
    setEmailClientId(client.id);
    setEmailError(null);
    setGeneratedEmail(null);
    setEmailLoading(true);
    setCopied(false);

    try {
      const res = await fetch("/api/ai-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name:          client.full_name,
          budget:               client.budget_usd,
          interested_apartment: null,
          notes:                client.notes,
          status:               client.status,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setGeneratedEmail(json);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Failed to generate email");
    } finally {
      setEmailLoading(false);
    }
  }

  function closeEmailModal() {
    setEmailClientId(null);
    setGeneratedEmail(null);
    setEmailError(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (!generatedEmail) return;
    const text = `Тема: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.full_name.toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q);
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = clients.reduce<Record<string, number>>(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {}
  );

  const emailClient = emailClientId ? clients.find((c) => c.id === emailClientId) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      {/* Top bar */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
      >
        <div>
          <h1 className="text-sm font-semibold text-white">Clients</h1>
          <p className="text-xs" style={{ color: "#475569" }}>
            {loading ? "Loading…" : `${filtered.length} of ${clients.length} leads`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
            <Search className="w-3.5 h-3.5" style={{ color: "#475569" }} />
            <input type="text" placeholder="Search name, email, phone…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs text-white outline-none placeholder:text-slate-600 w-44"
            />
          </div>
          <button onClick={() => { setForm(EMPTY_FORM); setFormError(null); setShowCreate(true); }}
            className="flex items-center gap-1.5 text-sm font-medium text-white px-3.5 py-2 rounded-lg hover:opacity-80"
            style={{ backgroundColor: "#6366f1" }}>
            <Plus className="w-4 h-4" />
            New client
          </button>
        </div>
      </header>

      <main className="px-6 py-6 w-full space-y-5">
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {error}
          </div>
        )}

        {/* Pipeline status pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTER_OPTIONS.map(({ value, label }) => {
            const active = statusFilter === value;
            const count  = value === "all" ? clients.length : (counts[value] ?? 0);
            return (
              <button key={value}
                onClick={() => setStatusFilter(value as typeof statusFilter)}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={{
                  backgroundColor: active ? "#1e1b4b" : "transparent",
                  borderColor: active ? "#6366f1" : "#1e2536",
                  color: active ? "#a5b4fc" : "#64748b",
                }}>
                {label}
                <span className="inline-flex items-center justify-center rounded-full w-4 h-4 text-xs font-semibold"
                  style={{ backgroundColor: active ? "#6366f1" : "#1e2536", color: active ? "white" : "#475569" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden"
          style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: "#6366f1", borderTopColor: "transparent" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="w-8 h-8" style={{ color: "#1e2536" }} />
              <p className="text-sm" style={{ color: "#475569" }}>
                {clients.length === 0 ? "No clients yet. Add your first lead." : "No clients match your filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #1e2536" }}>
                    {["Name", "Phone", "Email", "Budget (USD)", "Apartment", "Status", "Added", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-medium whitespace-nowrap"
                        style={{ color: "#475569" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((client, i) => {
                    const cfg = STATUS_CONFIG[client.status];
                    const isUpdating = updatingStatus.has(client.id);
                    const added = new Date(client.created_at).toLocaleDateString("en-US", {
                      month: "short", day: "numeric",
                    });
                    return (
                      <tr key={client.id}
                        onClick={() => router.push(`/clients/${client.id}`)}
                        className="transition-colors hover:bg-white/[0.02] cursor-pointer"
                        style={{
                          borderBottom: i < filtered.length - 1 ? "1px solid #1e2536" : undefined,
                          opacity: isUpdating ? 0.6 : 1,
                        }}>
                        {/* Name */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                              style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                              {client.full_name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-white">{client.full_name}</span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-5 py-3.5">
                          {client.phone ? (
                            <a href={`tel:${client.phone}`}
                              className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
                              style={{ color: "#64748b" }}>
                              <Phone className="w-3 h-3 shrink-0" />
                              {client.phone}
                            </a>
                          ) : (
                            <span className="text-xs" style={{ color: "#334155" }}>—</span>
                          )}
                        </td>

                        {/* Email */}
                        <td className="px-5 py-3.5">
                          {client.email ? (
                            <a href={`mailto:${client.email}`}
                              className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
                              style={{ color: "#64748b" }}>
                              <Mail className="w-3 h-3 shrink-0" />
                              {client.email}
                            </a>
                          ) : (
                            <span className="text-xs" style={{ color: "#334155" }}>—</span>
                          )}
                        </td>

                        {/* Budget */}
                        <td className="px-5 py-3.5 text-sm font-medium"
                          style={{ color: client.budget_usd ? "white" : "#334155" }}>
                          {client.budget_usd ? `$${client.budget_usd.toLocaleString()}` : "—"}
                        </td>

                        {/* Linked apartment */}
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {client.apartments?.[0] ? (() => {
                            const apt = client.apartments![0];
                            const aptColor = apt.status === "sold" ? "#34d399" : apt.status === "reserved" ? "#fbbf24" : "#a5b4fc";
                            return (
                              <div className="flex items-center gap-1.5">
                                <Home className="w-3 h-3 shrink-0" style={{ color: aptColor }} />
                                <span className="text-xs font-mono" style={{ color: aptColor }}>
                                  №{apt.number}
                                </span>
                                <span className="text-xs" style={{ color: "#475569" }}>
                                  {apt.size_m2}м²
                                </span>
                              </div>
                            );
                          })() : (
                            <span className="text-xs" style={{ color: "#334155" }}>—</span>
                          )}
                        </td>

                        {/* Status badge + dropdown */}
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                              style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: cfg.dot }} />
                              {cfg.label}
                            </span>
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
                          </div>
                        </td>

                        {/* Added date */}
                        <td className="px-5 py-3.5 text-xs" style={{ color: "#475569" }}>
                          {added}
                        </td>

                        {/* AI Email button */}
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleGenerateEmail(client)}
                            disabled={emailClientId === client.id && emailLoading}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors hover:border-indigo-500/50 disabled:opacity-50"
                            style={{ backgroundColor: "#080b14", borderColor: "#1e2536", color: "#64748b" }}>
                            {emailClientId === client.id && emailLoading ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3" style={{ color: "#6366f1" }} />
                            )}
                            AI Email
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Add client modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-md rounded-2xl border p-6"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-white">New client</h2>
              <button onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Full name */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Full name <span style={{ color: "#6366f1" }}>*</span>
                </label>
                <input type="text" required placeholder="Alisher Nazarov"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>

              {/* Phone + Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Phone</label>
                  <input type="tel" placeholder="+998 90 123 45 67"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Email</label>
                  <input type="email" placeholder="client@example.com"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                    onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                  />
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>
                  Budget (USD)
                </label>
                <input type="number" min={0} placeholder="e.g. 80000"
                  value={form.budget_usd}
                  onChange={(e) => setForm((f) => ({ ...f, budget_usd: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#94a3b8" }}>Notes</label>
                <textarea rows={3} placeholder="Interested in 2-bedroom, prefers high floor…"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 resize-none"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")}
                />
              </div>

              {formError && <p className="text-sm" style={{ color: "#fca5a5" }}>{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: "#6366f1" }}>
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : "Add client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── AI Email modal ── */}
      {emailClientId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[85vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: "#6366f1" }} />
                <div>
                  <p className="text-sm font-semibold text-white">AI Email Generator</p>
                  {emailClient && (
                    <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                      For {emailClient.full_name}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={closeEmailModal}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {emailLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6366f1" }} />
                  <p className="text-sm" style={{ color: "#64748b" }}>
                    Claude is writing your email…
                  </p>
                </div>
              )}

              {emailError && (
                <div className="rounded-lg px-4 py-3 text-sm border"
                  style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
                  {emailError}
                </div>
              )}

              {generatedEmail && !emailLoading && (
                <>
                  {/* Subject */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "#475569" }}>Subject</p>
                    <div className="rounded-lg px-4 py-3 text-sm font-medium text-white"
                      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                      {generatedEmail.subject}
                    </div>
                  </div>

                  {/* Body */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "#475569" }}>Body</p>
                    <div className="rounded-lg px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536", color: "#cbd5e1" }}>
                      {generatedEmail.body}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {generatedEmail && !emailLoading && (
              <div className="px-6 py-4 border-t shrink-0 flex gap-3"
                style={{ borderColor: "#1e2536" }}>
                <button onClick={closeEmailModal}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Close
                </button>
                <button onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: copied ? "#052e16" : "#6366f1",
                           color: copied ? "#34d399" : "white" }}>
                  {copied ? <><Check className="w-4 h-4" />Copied!</> : <><Copy className="w-4 h-4" />Copy email</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
