// ─────────────────────────────────────────────────────────────────────────────
// components/pm/ApartmentDetailDrawer.tsx
//
// Right-side slide-out panel that opens when a chessboard cell or residents
// table row is clicked. Four tabs:
//   • Жилец      — основная информация о текущем жильце
//   • Заявки     — открытые/закрытые заявки на обслуживание
//   • Счётчики   — последние показания счётчиков
//   • Счета      — последние счета (PMInvoice)
// All data is loaded once when `apartmentId` changes; tabs share the data.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import { X, User, Wrench, Gauge, Receipt, Phone, Mail, Send, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Resident,
  MaintenanceRequest,
  UtilityMeter,
  MeterReading,
  PMInvoice,
} from "@/lib/types/database";
import RequestDetailDrawer from "./RequestDetailDrawer";

interface ApartmentSummary {
  id:          string;
  number:      string;
  floor:       number;
  size_m2:     number | null;
  rooms_count: number | null;
}

interface Props {
  apartmentId: string | null;
  onClose:     () => void;
}

type Tab = "resident" | "requests" | "meters" | "invoices";

interface MeterWithReading extends UtilityMeter {
  latest_reading?: MeterReading | null;
}

const STATUS_RU: Record<MaintenanceRequest["status"], string> = {
  open:        "Открыта",
  assigned:    "Назначена",
  in_progress: "В работе",
  completed:   "Закрыта",
  cancelled:   "Отменена",
};

const PRIORITY_COLOR: Record<MaintenanceRequest["priority"], { bg: string; text: string }> = {
  low:       { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
  medium:    { bg: "rgba(59,130,246,0.15)",  text: "#93c5fd" },
  high:      { bg: "rgba(251,146,60,0.15)",  text: "#fdba74" },
  emergency: { bg: "rgba(239,68,68,0.18)",   text: "#fca5a5" },
};

const PRIORITY_RU: Record<MaintenanceRequest["priority"], string> = {
  low:       "Низкий",
  medium:    "Средний",
  high:      "Высокий",
  emergency: "Экстренный",
};

const METER_RU: Record<string, string> = {
  electricity: "Электричество",
  gas:         "Газ",
  water_cold:  "Вода (хол.)",
  water_hot:   "Вода (гор.)",
  heating:     "Отопление",
};

const INVOICE_STATUS_RU: Record<PMInvoice["status"], string> = {
  draft:     "Черновик",
  sent:      "Отправлен",
  paid:      "Оплачен",
  overdue:   "Просрочен",
  cancelled: "Отменён",
};

const INVOICE_STATUS_COLOR: Record<PMInvoice["status"], { bg: string; text: string }> = {
  draft:     { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
  sent:      { bg: "rgba(59,130,246,0.15)",  text: "#93c5fd" },
  paid:      { bg: "rgba(16,185,129,0.15)",  text: "#6ee7b7" },
  overdue:   { bg: "rgba(239,68,68,0.18)",   text: "#fca5a5" },
  cancelled: { bg: "rgba(100,116,139,0.10)", text: "#64748b" },
};

export default function ApartmentDetailDrawer({ apartmentId, onClose }: Props) {
  const [tab,        setTab]        = useState<Tab>("resident");
  const [loading,    setLoading]    = useState(false);
  const [apartment,  setApartment]  = useState<ApartmentSummary | null>(null);
  const [resident,   setResident]   = useState<Resident | null>(null);
  const [requests,   setRequests]   = useState<MaintenanceRequest[]>([]);
  const [meters,     setMeters]     = useState<MeterWithReading[]>([]);
  const [invoices,   setInvoices]   = useState<PMInvoice[]>([]);
  const [openReqId,  setOpenReqId]  = useState<string | null>(null);

  const reloadRequests = async () => {
    if (!apartmentId) return;
    const { data } = await supabase
      .from("maintenance_requests")
      .select("*")
      .eq("apartment_id", apartmentId)
      .order("created_at", { ascending: false })
      .limit(20);
    setRequests((data as MaintenanceRequest[] | null) ?? []);
  };

  useEffect(() => {
    if (!apartmentId) return;
    setTab("resident");
    setLoading(true);

    (async () => {
      const [aptRes, resRes, reqRes, metRes, invRes] = await Promise.all([
        supabase
          .from("apartments")
          .select("id, number, floor, size_m2, rooms_count")
          .eq("id", apartmentId)
          .single(),
        supabase
          .from("residents")
          .select("*")
          .eq("apartment_id", apartmentId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("maintenance_requests")
          .select("*")
          .eq("apartment_id", apartmentId)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("utility_meters")
          .select("*")
          .eq("apartment_id", apartmentId)
          .eq("is_active", true),
        supabase
          .from("pm_invoices")
          .select("*")
          .eq("apartment_id", apartmentId)
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

      setApartment((aptRes.data as ApartmentSummary | null) ?? null);
      setResident((resRes.data as Resident | null) ?? null);
      setRequests((reqRes.data as MaintenanceRequest[] | null) ?? []);
      setInvoices((invRes.data as PMInvoice[] | null) ?? []);

      const meterList = (metRes.data as UtilityMeter[] | null) ?? [];
      // Fetch latest reading per meter
      const enriched: MeterWithReading[] = await Promise.all(
        meterList.map(async (m) => {
          const { data } = await supabase
            .from("meter_readings")
            .select("*")
            .eq("meter_id", m.id)
            .order("reading_date", { ascending: false })
            .limit(1)
            .maybeSingle();
          return { ...m, latest_reading: (data as MeterReading | null) ?? null };
        })
      );
      setMeters(enriched);
      setLoading(false);
    })();
  }, [apartmentId]);

  if (!apartmentId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 z-50 h-screen overflow-y-auto"
        style={{
          width:           "min(480px, 95vw)",
          backgroundColor: "#0d1117",
          borderLeft:      "1px solid rgba(255,255,255,0.08)",
          boxShadow:       "-12px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 sticky top-0 z-10"
          style={{
            backgroundColor: "#0d1117",
            borderBottom:    "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                Квартира
              </p>
              <h2 className="text-2xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
                №{apartment?.number ?? "—"}
              </h2>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Этаж {apartment?.floor ?? "—"}
                {apartment?.rooms_count ? ` · ${apartment.rooms_count} комн.` : ""}
                {apartment?.size_m2 ? ` · ${apartment.size_m2} м²` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {([
              { id: "resident", label: "Жилец",    icon: User    },
              { id: "requests", label: "Заявки",   icon: Wrench  },
              { id: "meters",   label: "Счётчики", icon: Gauge   },
              { id: "invoices", label: "Счета",    icon: Receipt },
            ] as { id: Tab; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
                  style={{
                    backgroundColor: active ? "rgba(16,185,129,0.12)" : "transparent",
                    color:           active ? "#6ee7b7" : "rgba(255,255,255,0.45)",
                    border:          `1px solid ${active ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: "rgba(255,255,255,0.4)" }}>
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {tab === "resident"  && <ResidentTab resident={resident} />}
              {tab === "requests"  && <RequestsTab requests={requests} onSelect={setOpenReqId} />}
              {tab === "meters"    && <MetersTab meters={meters} />}
              {tab === "invoices"  && <InvoicesTab invoices={invoices} />}
            </>
          )}
        </div>
      </aside>

      <RequestDetailDrawer
        requestId={openReqId}
        onClose={() => setOpenReqId(null)}
        onUpdated={reloadRequests}
      />
    </>
  );
}

// ── Tab: Resident ──
function ResidentTab({ resident }: { resident: Resident | null }) {
  if (!resident) {
    return (
      <div
        className="rounded-xl p-6 text-sm text-center"
        style={{
          backgroundColor: "rgba(100,116,139,0.06)",
          border:          "1px dashed rgba(100,116,139,0.25)",
          color:           "rgba(255,255,255,0.4)",
        }}
      >
        В этой квартире нет активного жильца.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Field label="ФИО" value={resident.full_name} />
      <Field label="Тип" value={resident.resident_type === "owner" ? "Собственник" : resident.resident_type === "tenant" ? "Арендатор" : "Член семьи"} />
      {resident.phone && <FieldIcon icon={Phone} label="Телефон" value={resident.phone} />}
      {resident.email && <FieldIcon icon={Mail}  label="Email"   value={resident.email} />}
      {resident.telegram_username && (
        <FieldIcon icon={Send} label="Telegram" value={`@${resident.telegram_username}`} />
      )}
      {resident.move_in_date && (
        <Field label="Заселился" value={new Date(resident.move_in_date).toLocaleDateString("ru-RU")} />
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border:          "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function FieldIcon({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        backgroundColor: "rgba(255,255,255,0.03)",
        border:          "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
          {label}
        </p>
        <p className="text-sm text-white truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Tab: Requests ──
function RequestsTab({ requests, onSelect }: { requests: MaintenanceRequest[]; onSelect: (id: string) => void }) {
  if (requests.length === 0) {
    return <EmptyHint text="Заявок ещё не было" />;
  }
  return (
    <div className="space-y-2">
      {requests.map((r) => {
        const p = PRIORITY_COLOR[r.priority];
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(r.id)}
            className="w-full text-left rounded-xl p-4 transition-colors hover:bg-white/[0.05]"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border:          "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{r.title}</p>
                <p className="text-xs mt-1 line-clamp-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {r.description}
                </p>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: p.bg, color: p.text }}
              >
                {PRIORITY_RU[r.priority]}
              </span>
            </div>
            <div className="flex items-center justify-between mt-3 text-[11px]">
              <span style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(r.created_at).toLocaleDateString("ru-RU")}
              </span>
              <span style={{ color: "rgba(255,255,255,0.55)" }}>{STATUS_RU[r.status]}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Tab: Meters ──
function MetersTab({ meters }: { meters: MeterWithReading[] }) {
  if (meters.length === 0) {
    return <EmptyHint text="Счётчики не установлены" />;
  }
  return (
    <div className="space-y-2">
      {meters.map((m) => (
        <div
          key={m.id}
          className="rounded-xl p-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.03)",
            border:          "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{METER_RU[m.meter_type] ?? m.meter_type}</p>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{m.serial_number}</span>
          </div>
          <p className="text-2xl mt-2 text-white" style={{ fontWeight: 700 }}>
            {m.latest_reading?.reading_value ?? m.initial_reading} <span className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.5)" }}>{m.unit}</span>
          </p>
          {m.latest_reading?.reading_date && (
            <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
              Показание от {new Date(m.latest_reading.reading_date).toLocaleDateString("ru-RU")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tab: Invoices ──
function InvoicesTab({ invoices }: { invoices: PMInvoice[] }) {
  if (invoices.length === 0) {
    return <EmptyHint text="Счета пока не выставлялись" />;
  }
  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const c = INVOICE_STATUS_COLOR[inv.status];
        return (
          <div
            key={inv.id}
            className="rounded-xl p-4"
            style={{
              backgroundColor: "rgba(255,255,255,0.03)",
              border:          "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-white">№{inv.invoice_number}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {new Date(inv.billing_period_start).toLocaleDateString("ru-RU")} —{" "}
                  {new Date(inv.billing_period_end).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: c.bg, color: c.text }}
              >
                {INVOICE_STATUS_RU[inv.status]}
              </span>
            </div>
            <p className="text-lg mt-2 text-white" style={{ fontWeight: 700 }}>
              {inv.total_amount.toLocaleString("ru-RU")} {inv.currency}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl p-6 text-sm text-center"
      style={{
        backgroundColor: "rgba(100,116,139,0.06)",
        border:          "1px dashed rgba(100,116,139,0.25)",
        color:           "rgba(255,255,255,0.4)",
      }}
    >
      {text}
    </div>
  );
}
