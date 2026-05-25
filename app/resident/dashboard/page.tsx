// ─────────────────────────────────────────────────────────────────────────────
// app/resident/dashboard/page.tsx
//
// Route:  /resident/dashboard   (residents only — middleware enforces)
//
// Shows the resident their apartment + live counters:
//   • active maintenance-request count
//   • unpaid invoice total (sent + overdue)
//   • this-month utility consumption per meter type
// + a "Создать заявку" CTA.
//
// Note: this is a client component because the shared supabase client in
// lib/supabase.ts uses the anon key + browser session storage. A server
// component would not have the user's auth context available.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Home, Wrench, FileText, Zap, Loader2, Droplets, Flame, AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ApartmentInfo {
  apartment_number: string | null;
  area_sqm: number | null;
  floor_number: number | null;
  building_name: string | null;
  project_name: string | null;
}

interface ResidentInfo {
  full_name: string;
  move_in_date: string | null;
  apartment_id: string;
}

type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

interface ConsumptionRow {
  type:  MeterType;
  diff:  number;
  unit:  string;
}

interface InvoiceRow {
  id:           string;
  invoice_number: string;
  total_amount: number;
  status:       string;
  billing_period_end: string;
}

interface RequestRow {
  id:          string;
  title:       string;
  status:      string;
  priority:    string;
  created_at:  string;
}

const METER_META: Record<MeterType, { label: string; icon: React.ElementType; accent: string }> = {
  electricity: { label: "Электр.",     icon: Zap,      accent: "#fbbf24" },
  gas:         { label: "Газ",         icon: Flame,    accent: "#fb923c" },
  water_cold:  { label: "Вода (хол.)", icon: Droplets, accent: "#60a5fa" },
  water_hot:   { label: "Вода (гор.)", icon: Droplets, accent: "#f87171" },
  heating:     { label: "Отопление",   icon: Flame,    accent: "#a78bfa" },
};

export default function ResidentDashboard() {
  const [loading, setLoading] = useState(true);
  const [resident, setResident] = useState<ResidentInfo | null>(null);
  const [apartment, setApartment] = useState<ApartmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activeRequests, setActiveRequests] = useState<RequestRow[]>([]);
  const [unpaid,         setUnpaid]         = useState<InvoiceRow[]>([]);
  const [consumption,    setConsumption]    = useState<ConsumptionRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) {
        setError("Не удалось определить пользователя");
        setLoading(false);
        return;
      }

      const { data, error: dbError } = await supabase
        .from("residents")
        .select(`
          full_name,
          move_in_date,
          apartment_id,
          apartment:apartments (
            number,
            size_m2,
            floor,
            building:buildings (
              name,
              project:projects ( name )
            )
          )
        `)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (dbError) {
        setError(dbError.message);
        setLoading(false);
        return;
      }

      if (!data) {
        setError("Профиль жильца не найден. Обратитесь к управляющему.");
        setLoading(false);
        return;
      }

      const apt = (data.apartment as unknown) as
        | {
            number: string | null;
            size_m2: number | null;
            floor: number | null;
            building: {
              name: string | null;
              project: { name: string | null } | null;
            } | null;
          }
        | null;

      setResident({
        full_name:    data.full_name,
        move_in_date: data.move_in_date,
        apartment_id: data.apartment_id,
      });
      setApartment({
        apartment_number: apt?.number ?? null,
        area_sqm:         apt?.size_m2 ?? null,
        floor_number:     apt?.floor ?? null,
        building_name:    apt?.building?.name ?? null,
        project_name:     apt?.building?.project?.name ?? null,
      });

      // ── Live data: requests / invoices / consumption ────────────────────
      const aptId = data.apartment_id;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [reqs, invs, meters] = await Promise.all([
        supabase
          .from("maintenance_requests")
          .select("id, title, status, priority, created_at")
          .eq("apartment_id", aptId)
          .in("status", ["open", "assigned", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("pm_invoices")
          .select("id, invoice_number, total_amount, status, billing_period_end")
          .eq("apartment_id", aptId)
          .in("status", ["sent", "overdue"])
          .order("billing_period_end", { ascending: false }),
        supabase
          .from("utility_meters")
          .select("id, meter_type, unit")
          .eq("apartment_id", aptId)
          .eq("is_active", true),
      ]);

      if (cancelled) return;

      setActiveRequests((reqs.data as RequestRow[] | null) ?? []);
      setUnpaid((invs.data as InvoiceRow[] | null) ?? []);

      const meterList = (meters.data as { id: string; meter_type: MeterType; unit: string }[] | null) ?? [];
      if (meterList.length > 0) {
        const { data: readings } = await supabase
          .from("meter_readings")
          .select("meter_id, consumption_diff, reading_date")
          .in("meter_id", meterList.map((m) => m.id))
          .gte("reading_date", monthStart.toISOString().slice(0, 10));

        const sumByMeter = new Map<string, number>();
        for (const r of (readings as { meter_id: string; consumption_diff: number | null }[] | null) ?? []) {
          sumByMeter.set(r.meter_id, (sumByMeter.get(r.meter_id) ?? 0) + Number(r.consumption_diff ?? 0));
        }

        setConsumption(
          meterList.map((m) => ({
            type: m.meter_type,
            diff: sumByMeter.get(m.id) ?? 0,
            unit: m.unit,
          }))
        );
      } else {
        setConsumption([]);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#6366f1" }} />
      </div>
    );
  }

  if (error || !resident) {
    return (
      <div
        className="rounded-xl px-5 py-4 text-sm"
        style={{
          backgroundColor: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          color: "#fca5a5",
        }}
      >
        {error ?? "Что-то пошло не так"}
      </div>
    );
  }

  const unpaidTotal = unpaid.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const overdueCount = unpaid.filter((x) => x.status === "overdue").length;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1
          className="text-2xl text-white"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          Добро пожаловать, {resident.full_name}
        </h1>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          Ваш персональный кабинет жильца
        </p>
      </div>

      {/* Apartment card */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "#0d1117",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Home className="w-4 h-4" style={{ color: "#6366f1" }} />
          <h2 className="text-sm font-semibold text-white">Моя квартира</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="ЖК"             value={apartment?.project_name ?? "—"} />
          <Field label="Корпус"         value={apartment?.building_name ?? "—"} />
          <Field label="Этаж"           value={apartment?.floor_number?.toString() ?? "—"} />
          <Field label="Квартира"       value={apartment?.apartment_number ? `№${apartment.apartment_number}` : "—"} />
          <Field label="Площадь"        value={apartment?.area_sqm ? `${apartment.area_sqm} м²` : "—"} />
          <Field label="Дата заселения" value={resident.move_in_date ? new Date(resident.move_in_date).toLocaleDateString("ru-RU") : "—"} />
        </div>
      </div>

      {/* Quick metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={<Wrench className="w-4 h-4" />}
          accent="#f59e0b"
          title="Активные заявки"
          value={activeRequests.length.toString()}
          hint={
            activeRequests.length === 0
              ? "Нет открытых заявок"
              : `${activeRequests.length} в работе`
          }
        />
        <SummaryCard
          icon={<FileText className="w-4 h-4" />}
          accent={overdueCount > 0 ? "#ef4444" : "#14b8a6"}
          title="Неоплаченные счета"
          value={`${unpaidTotal.toLocaleString("ru-RU")} UZS`}
          hint={
            unpaid.length === 0
              ? "Все счета оплачены"
              : overdueCount > 0
                ? `${overdueCount} просрочено`
                : `${unpaid.length} к оплате`
          }
        />
        <SummaryCard
          icon={<Zap className="w-4 h-4" />}
          accent="#10b981"
          title="Потребление за месяц"
          value={consumption.length === 0 ? "—" : `${consumption.length} приб.`}
          hint={
            consumption.length === 0
              ? "Счётчики не подключены"
              : consumption.map((c) => `${METER_META[c.type].label}: ${c.diff.toFixed(0)} ${c.unit}`).join(" · ")
          }
        />
      </div>

      {/* Active requests list */}
      {activeRequests.length > 0 && (
        <section
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "#0d1117",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <h3 className="text-sm font-semibold text-white">Мои активные заявки</h3>
            </div>
            <Link
              href="/resident/requests"
              className="text-xs hover:underline"
              style={{ color: "#a5b4fc" }}
            >
              Все заявки →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            {activeRequests.map((r) => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white truncate">{r.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {new Date(r.created_at).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <StatusPill status={r.status} priority={r.priority} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unpaid invoices list */}
      {unpaid.length > 0 && (
        <section
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "#0d1117",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" style={{ color: overdueCount > 0 ? "#ef4444" : "#14b8a6" }} />
              <h3 className="text-sm font-semibold text-white">К оплате</h3>
            </div>
            <Link
              href="/resident/invoices"
              className="text-xs hover:underline"
              style={{ color: "#a5b4fc" }}
            >
              Все счета →
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            {unpaid.slice(0, 5).map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">№ {inv.invoice_number}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    до {new Date(inv.billing_period_end).toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-white">
                    {Number(inv.total_amount).toLocaleString("ru-RU")} UZS
                  </p>
                  {inv.status === "overdue" && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] mt-1 px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#fca5a5",
                      }}
                    >
                      <AlertCircle className="w-3 h-3" />
                      Просрочен
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <div className="flex justify-end">
        <Link
          href="/resident/requests/new"
          className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <Plus className="w-4 h-4" />
          Создать заявку
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
        {label}
      </p>
      <p className="text-sm text-white mt-1">{value}</p>
    </div>
  );
}

function StatusPill({ status, priority }: { status: string; priority: string }) {
  const STATUS_RU: Record<string, string> = {
    open:        "Новая",
    assigned:    "Назначена",
    in_progress: "В работе",
  };
  const STATUS_COLOR: Record<string, string> = {
    open:        "#a5b4fc",
    assigned:    "#fbbf24",
    in_progress: "#34d399",
  };
  const c = STATUS_COLOR[status] ?? "#a5b4fc";
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {priority === "emergency" && (
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.3)",
            color: "#fca5a5",
          }}
        >
          Срочно
        </span>
      )}
      <span
        className="text-[11px] px-2 py-0.5 rounded-full"
        style={{
          backgroundColor: `${c}1A`,
          border: `1px solid ${c}40`,
          color: c,
        }}
      >
        {STATUS_RU[status] ?? status}
      </span>
    </div>
  );
}

function SummaryCard({
  icon, accent, title, value, hint,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        backgroundColor: "#0d1117",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.38)" }}>
          {title}
        </p>
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl"
          style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}10)`, border: `1px solid ${accent}25` }}
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
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{hint}</p>
      </div>
    </div>
  );
}
