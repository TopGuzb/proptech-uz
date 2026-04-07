"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";
import {
  ArrowLeft, Phone, Mail, DollarSign, FileText, Loader2,
  Sparkles, Copy, Check, X, Edit2, Save, Home, Building2,
  Link2, Link2Off, Search,
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
  project_id: string | null;
  building_id: string | null;
}

interface Manager {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface ClientDetail {
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
  manager?: Manager | null;
}

interface EditForm {
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

const PIPELINE: { key: ClientStatus; label: string; color: string }[] = [
  { key: "new",       label: "Новый",      color: "#475569" },
  { key: "contacted", label: "Контакт",    color: "#6366f1" },
  { key: "viewing",   label: "Просмотр",   color: "#f59e0b" },
  { key: "reserved",  label: "Бронь",      color: "#10b981" },
  { key: "bought",    label: "Продано",    color: "#22c55e" },
];

const STATUS_ORDER: ClientStatus[] = ["new", "contacted", "viewing", "reserved", "bought"];

const APT_STATUS_COLOR: Record<string, string> = {
  available: "#6366f1",
  reserved:  "#f59e0b",
  sold:      "#10b981",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;

  const [client,  setClient]  = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Edit mode
  const [editing,    setEditing]    = useState(false);
  const [editForm,   setEditForm]   = useState<EditForm>({ full_name: "", phone: "", email: "", budget_usd: "", notes: "" });
  const [saving,     setSaving]     = useState(false);
  const [saveError,  setSaveError]  = useState<string | null>(null);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusToast,    setStatusToast]    = useState<string | null>(null);

  // AI Email
  const [emailLoading,    setEmailLoading]    = useState(false);
  const [emailError,      setEmailError]      = useState<string | null>(null);
  const [generatedEmail,  setGeneratedEmail]  = useState<GeneratedEmail | null>(null);
  const [showEmailModal,  setShowEmailModal]  = useState(false);
  const [copied,          setCopied]          = useState(false);

  // Link apartment
  const [showLinkApt,    setShowLinkApt]    = useState(false);
  const [availableApts,  setAvailableApts]  = useState<{
    id: string; number: string; floor: number | null;
    size_m2: number; price: number; status: string;
    building_id: string | null;
  }[]>([]);
  const [loadingApts,    setLoadingApts]    = useState(false);
  const [aptSearch,      setAptSearch]      = useState("");
  const [linkingApt,     setLinkingApt]     = useState(false);
  const [unlinking,      setUnlinking]      = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchClient = useCallback(async () => {
    setLoading(true);
    setError(null);

    // 1. Fetch client + linked apartments
    const { data, error: e } = await supabase
      .from("clients")
      .select("id, full_name, phone, email, budget_usd, notes, status, assigned_to, created_at, apartments(id, number, floor, size_m2, price, status, project_id, building_id)")
      .eq("id", clientId)
      .single();

    if (e) { setError(e.message); setLoading(false); return; }

    // 2. Fetch manager separately using assigned_to uuid
    let manager: Manager | null = null;
    if (data?.assigned_to) {
      const { data: mgr } = await supabase
        .from("user_profiles")
        .select("id, full_name, email")
        .eq("id", data.assigned_to)
        .single();
      manager = (mgr as Manager) ?? null;
    }

    setClient({ ...(data as ClientDetail), manager });
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  // ── Edit ───────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!client) return;
    setEditForm({
      full_name:  client.full_name,
      phone:      client.phone      ?? "",
      email:      client.email      ?? "",
      budget_usd: client.budget_usd != null ? String(client.budget_usd) : "",
      notes:      client.notes      ?? "",
    });
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!client) return;
    setSaving(true);
    setSaveError(null);
    const payload: Record<string, unknown> = {
      full_name: editForm.full_name.trim() || client.full_name,
    };
    if (editForm.phone.trim())    payload.phone      = editForm.phone.trim();
    if (editForm.email.trim())    payload.email      = editForm.email.trim();
    if (editForm.notes.trim())    payload.notes      = editForm.notes.trim();
    const budget = parseFloat(editForm.budget_usd);
    if (!isNaN(budget) && budget > 0) payload.budget_usd = budget;

    const { error: err } = await supabase.from("clients").update(payload).eq("id", client.id);
    setSaving(false);
    if (err) { setSaveError(err.message); return; }
    setEditing(false);
    fetchClient();
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async function handleStatusChange(newStatus: ClientStatus) {
    if (!client || updatingStatus || newStatus === client.status) return;
    setUpdatingStatus(true);
    const { error: err } = await supabase
      .from("clients")
      .update({ status: newStatus })
      .eq("id", client.id);
    setUpdatingStatus(false);
    if (err) {
      console.error("[clients] status update failed:", err);
      setStatusToast(`Ошибка: ${err.message}`);
    } else {
      setClient((prev) => prev ? { ...prev, status: newStatus } : prev);
      const label = PIPELINE.find((s) => s.key === newStatus)?.label ?? newStatus;
      setStatusToast(`Статус → ${label}`);
    }
    setTimeout(() => setStatusToast(null), 2500);
  }

  // ── Link apartment ────────────────────────────────────────────────────────

  async function openLinkApt() {
    setShowLinkApt(true);
    setAptSearch("");
    setLoadingApts(true);
    const { data } = await supabase
      .from("apartments")
      .select("id, number, floor, size_m2, price, status, building_id")
      .in("status", ["available", "reserved"])
      .is("client_id", null)
      .order("number");
    setAvailableApts(data ?? []);
    setLoadingApts(false);
  }

  async function handleLinkApt(aptId: string) {
    setLinkingApt(true);
    await supabase.from("apartments").update({ client_id: clientId }).eq("id", aptId);
    setLinkingApt(false);
    setShowLinkApt(false);
    fetchClient();
  }

  async function handleUnlinkApt(aptId: string) {
    setUnlinking(true);
    await supabase.from("apartments").update({ client_id: null }).eq("id", aptId);
    setUnlinking(false);
    fetchClient();
  }

  // ── AI Email ───────────────────────────────────────────────────────────────

  async function handleGenerateEmail() {
    if (!client) return;
    setEmailLoading(true);
    setEmailError(null);
    setGeneratedEmail(null);
    setShowEmailModal(true);
    setCopied(false);

    try {
      const apt = client.apartments?.[0];
      const res = await fetch("/api/ai-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name:          client.full_name,
          budget:               client.budget_usd,
          interested_apartment: apt ? `№${apt.number}, ${apt.size_m2}м², $${apt.price.toLocaleString()}` : null,
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

  async function handleCopy() {
    if (!generatedEmail) return;
    await navigator.clipboard.writeText(`Тема: ${generatedEmail.subject}\n\n${generatedEmail.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "#6366f1", borderTopColor: "transparent" }} />
        </div>
      </AppShell>
    );
  }

  if (error || !client) {
    return (
      <AppShell>
        <div className="px-6 py-8">
          <button onClick={() => router.back()}
            className="flex items-center gap-2 text-sm mb-6"
            style={{ color: "#64748b" }}>
            <ArrowLeft className="w-4 h-4" /> Назад
          </button>
          <p className="text-sm" style={{ color: "#fca5a5" }}>{error ?? "Клиент не найден"}</p>
        </div>
      </AppShell>
    );
  }

  const currentStepIndex = STATUS_ORDER.indexOf(client.status);
  const apt = client.apartments?.[0] ?? null;

  return (
    <AppShell>
      {/* ── Status toast ── */}
      {statusToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-sm font-medium shadow-lg pointer-events-none"
          style={{ backgroundColor: statusToast.startsWith("Ошибка") ? "#7f1d1d" : "#1e1b4b",
                   color:           statusToast.startsWith("Ошибка") ? "#fca5a5" : "#a5b4fc",
                   border:          `1px solid ${statusToast.startsWith("Ошибка") ? "#991b1b" : "#4338ca"}` }}>
          {statusToast}
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/clients")}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "#64748b" }}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white">{client.full_name}</h1>
            <p className="text-xs" style={{ color: "#475569" }}>Профиль клиента</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleGenerateEmail}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors hover:border-indigo-500/40"
            style={{ backgroundColor: "#080b14", borderColor: "#1e2536", color: "#64748b" }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: "#6366f1" }} />
            AI Email
          </button>
          {!editing ? (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white"
              style={{ backgroundColor: "#6366f1" }}>
              <Edit2 className="w-3.5 h-3.5" />
              Редактировать
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(false)}
                className="text-xs px-3 py-2 rounded-lg hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Отмена
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-white disabled:opacity-60"
                style={{ backgroundColor: "#6366f1" }}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="px-6 py-6 max-w-4xl mx-auto space-y-5">
        {saveError && (
          <div className="rounded-lg px-4 py-3 text-sm border"
            style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
            {saveError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ── Left column: profile + pipeline ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Profile card */}
            <div className="rounded-xl border p-5 space-y-4"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                  style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                  {client.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  {editing ? (
                    <input
                      value={editForm.full_name}
                      onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                      className="w-full text-lg font-bold text-white bg-transparent border-b outline-none pb-0.5"
                      style={{ borderColor: "#6366f1" }}
                    />
                  ) : (
                    <h2 className="text-lg font-bold text-white">{client.full_name}</h2>
                  )}
                  <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                    Добавлен {new Date(client.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* Contact + budget fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    icon: <Phone className="w-3.5 h-3.5" />,
                    label: "Телефон",
                    field: "phone" as keyof EditForm,
                    value: client.phone,
                    type: "tel",
                    placeholder: "+998 90 123 45 67",
                  },
                  {
                    icon: <Mail className="w-3.5 h-3.5" />,
                    label: "Email",
                    field: "email" as keyof EditForm,
                    value: client.email,
                    type: "email",
                    placeholder: "client@example.com",
                  },
                  {
                    icon: <DollarSign className="w-3.5 h-3.5" />,
                    label: "Бюджет",
                    field: "budget_usd" as keyof EditForm,
                    value: client.budget_usd != null ? `$${client.budget_usd.toLocaleString()}` : null,
                    type: "number",
                    placeholder: "80000",
                  },
                ].map(({ icon, label, field, value, type, placeholder }) => (
                  <div key={label} className="rounded-lg px-3.5 py-3"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                    <div className="flex items-center gap-1.5 mb-1" style={{ color: "#475569" }}>
                      {icon}
                      <span className="text-xs">{label}</span>
                    </div>
                    {editing ? (
                      <input
                        type={type}
                        value={editForm[field]}
                        placeholder={placeholder}
                        onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                        className="w-full text-sm text-white bg-transparent outline-none placeholder:text-slate-700"
                      />
                    ) : (
                      <p className="text-sm font-medium" style={{ color: value ? "white" : "#334155" }}>
                        {value ?? "—"}
                      </p>
                    )}
                  </div>
                ))}

                {/* Manager */}
                <div className="rounded-lg px-3.5 py-3"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                  <p className="text-xs mb-1" style={{ color: "#475569" }}>Менеджер</p>
                  <p className="text-sm font-medium" style={{ color: client.manager ? "white" : "#334155" }}>
                    {client.manager?.full_name ?? client.manager?.email ?? "—"}
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center gap-1.5 mb-1.5" style={{ color: "#475569" }}>
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Заметки</span>
                </div>
                {editing ? (
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    placeholder="Дополнительная информация о клиенте…"
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-700 resize-none"
                    style={{ backgroundColor: "#080b14", border: "1px solid #6366f1" }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed" style={{ color: client.notes ? "#cbd5e1" : "#334155" }}>
                    {client.notes ?? "Заметок нет"}
                  </p>
                )}
              </div>
            </div>

            {/* Status pipeline */}
            <div className="rounded-xl border p-5"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#475569" }}>Воронка продаж</h3>
              <div className="flex items-center gap-0">
                {PIPELINE.map((step, i) => {
                  const isPast    = i < currentStepIndex;
                  const isCurrent = i === currentStepIndex;
                  const isFuture  = i > currentStepIndex;
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <button
                        disabled={updatingStatus}
                        onClick={() => handleStatusChange(step.key)}
                        className="flex flex-col items-center gap-1.5 flex-1 py-2 rounded-lg transition-colors disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isCurrent ? "#1e1b4b" : "transparent",
                          opacity: isFuture ? 0.4 : 1,
                        }}>
                        <div className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: isFuture ? "#1e2536" : step.color }} />
                        <span className="text-xs font-medium text-center leading-tight"
                          style={{ color: isCurrent ? "white" : isPast ? step.color : "#475569" }}>
                          {step.label}
                        </span>
                      </button>
                      {i < PIPELINE.length - 1 && (
                        <div className="h-px w-3 shrink-0 mx-0.5"
                          style={{ backgroundColor: i < currentStepIndex ? "#6366f1" : "#1e2536" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Timeline */}
            <div className="rounded-xl border p-5"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#475569" }}>История</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "#6366f1" }} />
                  <div>
                    <p className="text-sm text-white">Клиент добавлен</p>
                    <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                      {new Date(client.created_at).toLocaleDateString("ru-RU", {
                        day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                {apt && (
                  <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                      style={{ backgroundColor: APT_STATUS_COLOR[apt.status] ?? "#6366f1" }} />
                    <div>
                      <p className="text-sm text-white">
                        Квартира №{apt.number} — {apt.status === "sold" ? "продана" : apt.status === "reserved" ? "забронирована" : "привязана"}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                        {apt.size_m2} м² · ${apt.price.toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: "#334155" }} />
                  <div>
                    <p className="text-sm" style={{ color: "#475569" }}>
                      Статус: <span className="text-white">{PIPELINE.find((s) => s.key === client.status)?.label}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column: linked apartment ── */}
          <div className="space-y-5">
            <div className="rounded-xl border p-5"
              style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#475569" }}>Квартира</h3>

              {apt ? (
                <div className="space-y-3">
                  {/* Status + unlink row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: APT_STATUS_COLOR[apt.status] ?? "#6366f1" }} />
                      <span className="text-xs font-medium"
                        style={{ color: APT_STATUS_COLOR[apt.status] ?? "#a5b4fc" }}>
                        {apt.status === "sold" ? "Продана" : apt.status === "reserved" ? "Забронирована" : "Свободна"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnlinkApt(apt.id)}
                      disabled={unlinking}
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors hover:border-red-500/40 disabled:opacity-50"
                      style={{ borderColor: "#1e2536", color: "#64748b" }}>
                      <Link2Off className="w-3 h-3" />
                      {unlinking ? "…" : "Отвязать"}
                    </button>
                  </div>

                  {/* Apt details */}
                  <div className="rounded-lg p-3 space-y-2"
                    style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Home className="w-4 h-4" style={{ color: APT_STATUS_COLOR[apt.status] ?? "#6366f1" }} />
                      <span className="text-base font-bold text-white">№{apt.number}</span>
                    </div>
                    {[
                      { label: "Этаж",    value: apt.floor != null ? `${apt.floor}` : "—" },
                      { label: "Площадь", value: `${apt.size_m2} м²` },
                      { label: "Цена",    value: `$${apt.price.toLocaleString()}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: "#475569" }}>{label}</span>
                        <span className="text-xs font-medium text-white">{value}</span>
                      </div>
                    ))}
                  </div>

                  {apt.project_id && (
                    <button
                      onClick={() => router.push(`/projects/${apt.project_id}`)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium border transition-colors hover:border-indigo-500/40"
                      style={{ borderColor: "#1e2536", color: "#a5b4fc", backgroundColor: "#0f0a30" }}>
                      <Building2 className="w-3.5 h-3.5" />
                      Открыть план этажа
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 gap-3">
                  <Home className="w-7 h-7" style={{ color: "#1e2536" }} />
                  <p className="text-xs text-center" style={{ color: "#475569" }}>
                    Квартира не привязана
                  </p>
                  <button
                    onClick={openLinkApt}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg"
                    style={{ backgroundColor: "#1e1b4b", color: "#a5b4fc" }}>
                    <Link2 className="w-3.5 h-3.5" />
                    Привязать квартиру
                  </button>
                </div>
              )}

              {/* Link button always visible at bottom */}
              {apt && (
                <button
                  onClick={openLinkApt}
                  className="w-full mt-1 flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-colors hover:border-indigo-500/40"
                  style={{ borderColor: "#1e2536", color: "#64748b" }}>
                  <Link2 className="w-3.5 h-3.5" />
                  Сменить квартиру
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Link apartment modal ── */}
      {showLinkApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[80vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4" style={{ color: "#6366f1" }} />
                <p className="text-sm font-semibold text-white">Выбрать квартиру</p>
              </div>
              <button onClick={() => setShowLinkApt(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "#475569" }} />
                <input
                  type="text"
                  placeholder="Поиск по номеру…"
                  value={aptSearch}
                  onChange={(e) => setAptSearch(e.target.value)}
                  className="bg-transparent text-xs text-white outline-none placeholder:text-slate-600 flex-1"
                />
              </div>
            </div>

            {/* Apt list */}
            <div className="flex-1 overflow-y-auto">
              {loadingApts ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
                </div>
              ) : (() => {
                const filtered = availableApts.filter((a) =>
                  !aptSearch || a.number.toLowerCase().includes(aptSearch.toLowerCase())
                );
                return filtered.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <p className="text-xs" style={{ color: "#475569" }}>
                      {aptSearch ? "Квартира не найдена" : "Нет свободных квартир"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: "#1e2536" }}>
                    {filtered.map((a) => {
                      const color = a.status === "reserved" ? "#f59e0b" : "#6366f1";
                      return (
                        <button
                          key={a.id}
                          disabled={linkingApt}
                          onClick={() => handleLinkApt(a.id)}
                          className="w-full px-5 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                              style={{ backgroundColor: "#080b14", border: `1px solid ${color}` }}>
                              <span className="text-xs font-bold font-mono" style={{ color }}>
                                {a.number}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                Квартира №{a.number}
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                                {a.floor != null ? `Этаж ${a.floor} · ` : ""}
                                {a.size_m2} м²
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-white">
                              ${a.price.toLocaleString()}
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color }}>
                              {a.status === "reserved" ? "Забронирована" : "Свободна"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            <div className="px-5 py-4 border-t shrink-0" style={{ borderColor: "#1e2536" }}>
              <button onClick={() => setShowLinkApt(false)}
                className="w-full py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Email modal ── */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}>
          <div className="w-full max-w-lg rounded-2xl border flex flex-col max-h-[85vh]"
            style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: "#1e2536" }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: "#6366f1" }} />
                <div>
                  <p className="text-sm font-semibold text-white">AI Email</p>
                  <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Для {client.full_name}</p>
                </div>
              </div>
              <button onClick={() => setShowEmailModal(false)}
                className="p-1.5 rounded-lg hover:bg-white/5" style={{ color: "#475569" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {emailLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6366f1" }} />
                  <p className="text-sm" style={{ color: "#64748b" }}>Claude пишет письмо…</p>
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
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "#475569" }}>Тема</p>
                    <div className="rounded-lg px-4 py-3 text-sm font-medium text-white"
                      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}>
                      {generatedEmail.subject}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "#475569" }}>Текст</p>
                    <div className="rounded-lg px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap"
                      style={{ backgroundColor: "#080b14", border: "1px solid #1e2536", color: "#cbd5e1" }}>
                      {generatedEmail.body}
                    </div>
                  </div>
                </>
              )}
            </div>

            {generatedEmail && !emailLoading && (
              <div className="px-6 py-4 border-t shrink-0 flex gap-3"
                style={{ borderColor: "#1e2536" }}>
                <button onClick={() => setShowEmailModal(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium hover:bg-white/5"
                  style={{ border: "1px solid #1e2536", color: "#64748b" }}>
                  Закрыть
                </button>
                <button onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: copied ? "#052e16" : "#6366f1", color: copied ? "#34d399" : "white" }}>
                  {copied ? <><Check className="w-4 h-4" />Скопировано!</> : <><Copy className="w-4 h-4" />Скопировать</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
