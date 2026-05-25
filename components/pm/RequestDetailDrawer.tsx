// ─────────────────────────────────────────────────────────────────────────────
// components/pm/RequestDetailDrawer.tsx
//
// Right-side drawer with full details of a maintenance request:
//   • header with priority + status
//   • info section (apartment, resident, SLA timer, dates)
//   • description
//   • photo grid grouped by photo_type with lightbox
//   • vendor block with assign / reassign
//   • status workflow buttons (open → in_progress → completed, cancel)
//   • resolution editor (visible after completed)
// All mutations go through PATCH /api/pm/maintenance-requests/[id].
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X, Loader2, AlertTriangle, Clock, CheckCircle2, XCircle, Phone, Send, User,
  Wrench, Calendar, Image as ImageIcon, ChevronRight, RefreshCw, Sparkles,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  MaintenanceRequest, Resident, Vendor, RequestCategory,
} from "@/lib/types/database";
import AssignVendorModal from "./AssignVendorModal";

interface PhotoRow {
  id:          string;
  request_id:  string;
  photo_url:   string;
  photo_type:  "before" | "during" | "after";
  uploaded_at: string;
}

interface ApartmentBrief {
  id:     string;
  number: string;
  floor:  number;
  building: { id: string; name: string; project: { id: string; name: string } | null } | null;
}

interface Props {
  requestId: string | null;
  onClose:   () => void;
  onUpdated: () => void;
}

const PRIORITY_COLOR: Record<MaintenanceRequest["priority"], { bg: string; text: string; label: string }> = {
  low:       { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", label: "Не срочно" },
  medium:    { bg: "rgba(59,130,246,0.15)",  text: "#93c5fd", label: "Обычная" },
  high:      { bg: "rgba(251,146,60,0.15)",  text: "#fdba74", label: "Срочно" },
  emergency: { bg: "rgba(239,68,68,0.18)",   text: "#fca5a5", label: "ЧП" },
};

const STATUS_COLOR: Record<MaintenanceRequest["status"], { bg: string; text: string; label: string }> = {
  open:        { bg: "rgba(251,191,36,0.12)", text: "#fcd34d", label: "Открыта" },
  assigned:    { bg: "rgba(168,85,247,0.12)", text: "#c4b5fd", label: "Назначена" },
  in_progress: { bg: "rgba(59,130,246,0.12)", text: "#93c5fd", label: "В работе" },
  completed:   { bg: "rgba(16,185,129,0.12)", text: "#6ee7b7", label: "Закрыта" },
  cancelled:   { bg: "rgba(100,116,139,0.10)", text: "#64748b", label: "Отменена" },
};

const CATEGORY_RU: Record<string, string> = {
  plumbing:   "Сантехника",
  electrical: "Электрика",
  heating:    "Отопление",
  cleaning:   "Уборка",
  elevator:   "Лифт",
  appliance:  "Бытовая техника",
  structural: "Строительные дефекты",
  other:      "Другое",
};

export default function RequestDetailDrawer({ requestId, onClose, onUpdated }: Props) {
  const [loading,   setLoading]   = useState(false);
  const [request,   setRequest]   = useState<MaintenanceRequest | null>(null);
  const [apartment, setApartment] = useState<ApartmentBrief | null>(null);
  const [resident,  setResident]  = useState<Resident | null>(null);
  const [vendor,    setVendor]    = useState<Vendor | null>(null);
  const [photos,    setPhotos]    = useState<PhotoRow[]>([]);
  const [now,       setNow]       = useState(Date.now());
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [lightbox,  setLightbox]  = useState<string | null>(null);
  const [assignOpen,setAssignOpen]= useState(false);

  // Resolution editor state (only used when completed)
  const [resNotes, setResNotes]   = useState("");
  const [resCost,  setResCost]    = useState<string>("");

  // AI re-analyze state
  const [aiBusy,   setAiBusy]     = useState(false);
  const [aiError,  setAiError]    = useState<string | null>(null);

  const reload = async () => {
    if (!requestId) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("maintenance_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    const req = (r as MaintenanceRequest | null) ?? null;
    setRequest(req);

    if (!req) { setLoading(false); return; }

    const [aptRes, resRes, vRes, phRes] = await Promise.all([
      supabase
        .from("apartments")
        .select("id, number, floor, building:buildings ( id, name, project:projects ( id, name ) )")
        .eq("id", req.apartment_id)
        .maybeSingle(),
      req.resident_id
        ? supabase.from("residents").select("*").eq("id", req.resident_id).maybeSingle()
        : Promise.resolve({ data: null }),
      req.assigned_vendor_id
        ? supabase.from("vendors").select("*").eq("id", req.assigned_vendor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("maintenance_photos")
        .select("*")
        .eq("request_id", requestId)
        .order("uploaded_at", { ascending: true }),
    ]);

    setApartment((aptRes.data as unknown as ApartmentBrief | null) ?? null);
    setResident((resRes.data as Resident | null) ?? null);
    setVendor((vRes.data as Vendor | null) ?? null);
    setPhotos((phRes.data as PhotoRow[] | null) ?? []);
    setResNotes(req.resolution_notes ?? "");
    setResCost(req.cost_amount ? String(req.cost_amount) : "");
    setLoading(false);
  };

  useEffect(() => {
    if (!requestId) {
      setRequest(null); setApartment(null); setResident(null);
      setVendor(null);  setPhotos([]);
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  // Tick every minute for SLA timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const sla = useMemo(() => {
    if (!request?.sla_deadline) return null;
    const deadline = new Date(request.sla_deadline).getTime();
    const diff = deadline - now;
    const overdue = diff < 0;
    const absMin = Math.floor(Math.abs(diff) / 60_000);
    const h = Math.floor(absMin / 60);
    const m = absMin % 60;
    return {
      overdue,
      label: overdue ? `Просрочено на ${h}ч ${m}м` : `Осталось ${h}ч ${m}м`,
      done: request.status === "completed" || request.status === "cancelled",
    };
  }, [request, now]);

  async function patch(body: Record<string, unknown>) {
    if (!requestId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pm/maintenance-requests/${requestId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось обновить");
        return;
      }
      await reload();
      onUpdated();
    } finally {
      setSaving(false);
    }
  }

  async function rerunAI() {
    if (!request) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/categorize-request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title:       request.title,
          description: request.description,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error ?? "AI недоступен");
        return;
      }
      // Persist suggestions on the row (does not change category/priority).
      await patch({
        ai_category_suggested: json.category ?? null,
        ai_priority_suggested: json.priority ?? null,
        ai_summary:            json.summary  ?? null,
      });
    } catch {
      setAiError("AI недоступен");
    } finally {
      setAiBusy(false);
    }
  }

  async function applyAISuggestion() {
    if (!request) return;
    const updates: Record<string, unknown> = {};
    if (request.ai_category_suggested) updates.category = request.ai_category_suggested;
    if (request.ai_priority_suggested) updates.priority = request.ai_priority_suggested;
    if (Object.keys(updates).length === 0) return;
    await patch(updates);
  }

  if (!requestId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 z-50 h-screen overflow-y-auto"
        style={{
          width:           "min(560px, 95vw)",
          backgroundColor: "#0d1117",
          borderLeft:      "1px solid rgba(255,255,255,0.08)",
          boxShadow:       "-12px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {loading || !request ? (
          <div className="flex items-center justify-center py-20" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div
              className="px-6 py-5 sticky top-0 z-10"
              style={{
                backgroundColor: "#0d1117",
                borderBottom:    "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Заявка
                  </p>
                  <h2 className="text-xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                    {request.title}
                  </h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge {...PRIORITY_COLOR[request.priority]} />
                    <Badge {...STATUS_COLOR[request.status]} />
                    {request.category && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}
                      >
                        {CATEGORY_RU[request.category] ?? request.category}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* SLA timer */}
              {sla && !sla.done && (
                <div
                  className="rounded-xl px-4 py-3 flex items-center gap-3"
                  style={{
                    backgroundColor: sla.overdue ? "rgba(239,68,68,0.10)" : "rgba(16,185,129,0.08)",
                    border:          `1px solid ${sla.overdue ? "rgba(239,68,68,0.30)" : "rgba(16,185,129,0.25)"}`,
                  }}
                >
                  {sla.overdue
                    ? <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: "#fca5a5" }} />
                    : <Clock        className="w-5 h-5 shrink-0" style={{ color: "#6ee7b7" }} />}
                  <div>
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: sla.overdue ? "#fca5a5" : "#6ee7b7" }}>
                      SLA
                    </p>
                    <p className="text-sm font-semibold" style={{ color: sla.overdue ? "#fca5a5" : "#6ee7b7" }}>
                      {sla.label}
                    </p>
                  </div>
                </div>
              )}

              {/* AI analysis */}
              <Section title="🤖 AI анализ">
                {request.ai_summary || request.ai_category_suggested || request.ai_priority_suggested ? (
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{
                      background: "linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(59,130,246,0.08) 100%)",
                      border:     "1px solid rgba(168,85,247,0.25)",
                    }}
                  >
                    {request.ai_summary && (
                      <p className="text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
                        {request.ai_summary}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 items-center">
                      {request.ai_category_suggested && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#c4b5fd" }}
                        >
                          Категория: {CATEGORY_RU[request.ai_category_suggested] ?? request.ai_category_suggested}
                        </span>
                      )}
                      {request.ai_priority_suggested && PRIORITY_COLOR[request.ai_priority_suggested as MaintenanceRequest["priority"]] && (
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: PRIORITY_COLOR[request.ai_priority_suggested as MaintenanceRequest["priority"]].bg,
                            color:           PRIORITY_COLOR[request.ai_priority_suggested as MaintenanceRequest["priority"]].text,
                          }}
                        >
                          Приоритет: {PRIORITY_COLOR[request.ai_priority_suggested as MaintenanceRequest["priority"]].label}
                        </span>
                      )}
                    </div>
                    {(request.ai_category_suggested !== request.category ||
                      request.ai_priority_suggested !== request.priority) && (
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={applyAISuggestion}
                          disabled={saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
                        >
                          <Sparkles className="w-3 h-3" />
                          Применить рекомендацию
                        </button>
                        <button
                          onClick={rerunAI}
                          disabled={aiBusy || saving}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 hover:bg-white/5"
                          style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.10)" }}
                        >
                          {aiBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                          Переанализировать
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={rerunAI}
                    disabled={aiBusy || saving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #a855f7 0%, #6366f1 100%)" }}
                  >
                    {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Запустить AI-анализ
                  </button>
                )}
                {aiError && (
                  <p className="text-xs mt-2" style={{ color: "#fca5a5" }}>{aiError}</p>
                )}
              </Section>

              {/* Info */}
              <Section title="Информация">
                {apartment && (
                  <Row icon={Wrench} label="Квартира">
                    №{apartment.number} · этаж {apartment.floor}
                    {apartment.building?.name ? ` · ${apartment.building.name}` : ""}
                    {apartment.building?.project?.name ? ` · ${apartment.building.project.name}` : ""}
                  </Row>
                )}
                {resident && (
                  <Row icon={User} label="Жилец">
                    <div>{resident.full_name}</div>
                    <div className="flex flex-wrap gap-3 mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {resident.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{resident.phone}</span>}
                      {resident.telegram_username && <span className="flex items-center gap-1"><Send className="w-3 h-3" />@{resident.telegram_username}</span>}
                    </div>
                  </Row>
                )}
                <Row icon={Calendar} label="Создана">
                  {new Date(request.created_at).toLocaleString("ru-RU")}
                </Row>
                {request.assigned_at && (
                  <Row icon={Calendar} label="Назначена">
                    {new Date(request.assigned_at).toLocaleString("ru-RU")}
                  </Row>
                )}
                {request.started_at && (
                  <Row icon={Calendar} label="Принята в работу">
                    {new Date(request.started_at).toLocaleString("ru-RU")}
                  </Row>
                )}
                {request.completed_at && (
                  <Row icon={Calendar} label="Завершена">
                    {new Date(request.completed_at).toLocaleString("ru-RU")}
                  </Row>
                )}
              </Section>

              {/* Description */}
              <Section title="Описание">
                <p
                  className="text-sm whitespace-pre-wrap rounded-xl p-3"
                  style={{
                    color:           "rgba(255,255,255,0.85)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                    border:          "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {request.description}
                </p>
              </Section>

              {/* Photos */}
              <Section title={`Фото (${photos.length})`}>
                {photos.length === 0 ? (
                  <div
                    className="rounded-xl p-4 text-center text-xs flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: "rgba(100,116,139,0.06)",
                      border:          "1px dashed rgba(100,116,139,0.25)",
                      color:           "rgba(255,255,255,0.4)",
                    }}
                  >
                    <ImageIcon className="w-4 h-4" />
                    Фото не приложены
                  </div>
                ) : (
                  <PhotosByType photos={photos} onOpen={setLightbox} />
                )}
              </Section>

              {/* Vendor */}
              <Section title="Исполнитель">
                {vendor ? (
                  <div
                    className="rounded-xl p-4"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.03)",
                      border:          "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-white">{vendor.name}</p>
                        <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{vendor.phone}</span>
                          <span>★ {vendor.rating.toFixed(1)} · {vendor.completed_jobs} работ</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setAssignOpen(true)}
                        disabled={saving || request.status === "completed"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors hover:bg-white/5"
                        style={{ color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <RefreshCw className="w-3 h-3" />
                        Перенаназначить
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAssignOpen(true)}
                    disabled={saving || request.status === "completed" || request.status === "cancelled"}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
                  >
                    <ChevronRight className="w-4 h-4" />
                    Назначить подрядчика
                  </button>
                )}
              </Section>

              {/* Status workflow */}
              <Section title="Действия">
                <div className="grid grid-cols-1 gap-2">
                  {request.status === "open" && (
                    <ActionBtn onClick={() => patch({ status: "in_progress" })} disabled={saving} color="#3b82f6">
                      <Wrench className="w-4 h-4" /> Принять в работу
                    </ActionBtn>
                  )}
                  {request.status === "assigned" && (
                    <ActionBtn onClick={() => patch({ status: "in_progress" })} disabled={saving} color="#3b82f6">
                      <Wrench className="w-4 h-4" /> Принять в работу
                    </ActionBtn>
                  )}
                  {request.status === "in_progress" && (
                    <ActionBtn onClick={() => patch({ status: "completed" })} disabled={saving} color="#10b981">
                      <CheckCircle2 className="w-4 h-4" /> Отметить выполненной
                    </ActionBtn>
                  )}
                  {request.status !== "completed" && request.status !== "cancelled" && (
                    <ActionBtn onClick={() => patch({ status: "cancelled" })} disabled={saving} color="#64748b" outline>
                      <XCircle className="w-4 h-4" /> Отменить заявку
                    </ActionBtn>
                  )}
                </div>
              </Section>

              {/* Resolution editor */}
              {request.status === "completed" && (
                <Section title="Резолюция">
                  <div className="space-y-3">
                    <FieldLabel label="Что было сделано">
                      <textarea
                        value={resNotes}
                        onChange={(e) => setResNotes(e.target.value)}
                        rows={3}
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.04)",
                          border:          "1px solid rgba(255,255,255,0.08)",
                        }}
                      />
                    </FieldLabel>
                    <FieldLabel label="Стоимость (UZS)">
                      <input
                        type="number"
                        value={resCost}
                        onChange={(e) => setResCost(e.target.value)}
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
                        style={{
                          backgroundColor: "rgba(255,255,255,0.04)",
                          border:          "1px solid rgba(255,255,255,0.08)",
                        }}
                      />
                    </FieldLabel>
                    <button
                      onClick={() => patch({
                        resolution_notes: resNotes.trim() || null,
                        cost_amount:      resCost ? Number(resCost) : null,
                      })}
                      disabled={saving}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
                    >
                      {saving ? "Сохранение…" : "Сохранить"}
                    </button>

                    {(request.resident_rating || request.resident_feedback) && (
                      <div
                        className="rounded-xl p-3 mt-3"
                        style={{
                          backgroundColor: "rgba(251,191,36,0.06)",
                          border:          "1px solid rgba(251,191,36,0.20)",
                        }}
                      >
                        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#fbbf24" }}>
                          Отзыв жильца
                        </p>
                        {request.resident_rating != null && (
                          <p className="text-sm text-white mt-1">★ {request.resident_rating} / 5</p>
                        )}
                        {request.resident_feedback && (
                          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>
                            {request.resident_feedback}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm"
                  style={{
                    backgroundColor: "rgba(239,68,68,0.08)",
                    border:          "1px solid rgba(239,68,68,0.25)",
                    color:           "#fca5a5",
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl"
            style={{ boxShadow: "0 20px 80px rgba(0,0,0,0.6)" }}
          />
        </div>
      )}

      <AssignVendorModal
        open={assignOpen}
        requestId={requestId}
        category={(request?.category ?? null) as RequestCategory | null}
        currentVendorId={request?.assigned_vendor_id ?? null}
        onClose={() => setAssignOpen(false)}
        onAssigned={reload}
      />
    </>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function Badge({ bg, text, label }: { bg: string; text: string; label: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p
        className="text-[10px] uppercase tracking-widest mb-2"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border:          "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </p>
        <div className="text-sm text-white mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ActionBtn({
  children, onClick, disabled, color, outline,
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; color: string; outline?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
      style={
        outline
          ? { color, border: `1px solid ${color}55`, backgroundColor: "transparent" }
          : { color: "#fff", background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }
      }
    >
      {children}
    </button>
  );
}

function PhotosByType({ photos, onOpen }: { photos: PhotoRow[]; onOpen: (url: string) => void }) {
  const groups: { key: PhotoRow["photo_type"]; label: string }[] = [
    { key: "before",  label: "До" },
    { key: "during",  label: "Во время" },
    { key: "after",   label: "После" },
  ];
  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const list = photos.filter((p) => p.photo_type === g.key);
        if (list.length === 0) return null;
        return (
          <div key={g.key}>
            <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
              {g.label} ({list.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {list.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpen(p.photo_url)}
                  className="rounded-lg overflow-hidden"
                  style={{ aspectRatio: "1 / 1", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
