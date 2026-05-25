// ─────────────────────────────────────────────────────────────────────────────
// app/resident/invoices/page.tsx
//
// Resident-facing invoice list. Resolves resident from the auth user, fetches
// pm_invoices for their apartment(s), groups by status with paid/overdue
// badges. Invoice card shows breakdown (PM fee, utilities, maintenance) and
// due date.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

interface ResidentRow { id: string; apartment_id: string; }

interface InvoiceRow {
  id:                    string;
  invoice_number:        string;
  billing_period_start:  string;
  billing_period_end:    string;
  pm_fee:                number;
  utilities_amount:      number;
  maintenance_amount:    number;
  total_amount:          number;
  currency:              string;
  status:                InvoiceStatus;
  due_date:              string;
  paid_at:               string | null;
  created_at:            string;
}

const STATUS_META: Record<InvoiceStatus, { label: string; bg: string; fg: string; border: string }> = {
  draft:     { label: "Черновик",   bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.65)", border: "rgba(255,255,255,0.10)" },
  sent:      { label: "К оплате",   bg: "rgba(59,130,246,0.12)",  fg: "#60a5fa",                border: "rgba(59,130,246,0.35)" },
  paid:      { label: "Оплачен",    bg: "rgba(16,185,129,0.12)",  fg: "#34d399",                border: "rgba(16,185,129,0.35)" },
  overdue:   { label: "Просрочен",  bg: "rgba(239,68,68,0.12)",   fg: "#f87171",                border: "rgba(239,68,68,0.35)" },
  cancelled: { label: "Отменён",    bg: "rgba(255,255,255,0.04)", fg: "rgba(255,255,255,0.4)",  border: "rgba(255,255,255,0.08)" },
};

export default function ResidentInvoicesPage() {
  const [loading,  setLoading]  = useState(true);
  const [resident, setResident] = useState<ResidentRow | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }

      const { data: r } = await supabase
        .from("residents")
        .select("id, apartment_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();

      const res = (r as ResidentRow | null) ?? null;
      setResident(res);
      if (!res) { setLoading(false); return; }

      const { data: invs } = await supabase
        .from("pm_invoices")
        .select(
          "id, invoice_number, billing_period_start, billing_period_end, pm_fee, utilities_amount, maintenance_amount, total_amount, currency, status, due_date, paid_at, created_at",
        )
        .eq("apartment_id", res.apartment_id)
        .neq("status", "draft")
        .order("created_at", { ascending: false });

      setInvoices((invs as InvoiceRow[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const totals = useMemo(() => {
    let due = 0, overdue = 0, paidYTD = 0;
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    for (const inv of invoices) {
      const t = Number(inv.total_amount) || 0;
      if (inv.status === "sent")    due     += t;
      if (inv.status === "overdue") overdue += t;
      if (inv.status === "paid" && inv.paid_at && new Date(inv.paid_at).getTime() >= yearStart) {
        paidYTD += t;
      }
    }
    return { due, overdue, paidYTD };
  }, [invoices]);

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Счета
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          История счетов, начислений и оплат
        </p>
      </header>

      {/* Summary tiles */}
      {!loading && resident && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SummaryCard label="К оплате"    value={totals.due}     accent="#60a5fa" />
          <SummaryCard label="Просрочено"  value={totals.overdue} accent="#f87171" />
          <SummaryCard label="Оплачено в году" value={totals.paidYTD} accent="#34d399" />
        </div>
      )}

      {loading ? (
        <div
          className="rounded-2xl p-12 flex items-center justify-center"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : !resident ? (
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
          Текущий пользователь не привязан к квартире.
        </p>
      ) : invoices.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <FileText className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">Счетов пока нет.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} />)}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function InvoiceCard({ inv }: { inv: InvoiceRow }) {
  const meta     = STATUS_META[inv.status];
  const overdue  = inv.status === "overdue";
  const dueDate  = new Date(inv.due_date);
  const todayStr = new Date().toISOString().slice(0, 10);
  const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (24 * 3600 * 1000));

  return (
    <div
      className="rounded-2xl p-5 transition-colors"
      style={{
        backgroundColor: "#0d1117",
        border:          overdue
          ? "1px solid rgba(239,68,68,0.35)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            {inv.invoice_number}
          </p>
          <p className="text-sm text-white mt-0.5">
            {fmtPeriod(inv.billing_period_start, inv.billing_period_end)}
          </p>
        </div>
        <span
          className="text-[11px] px-2 py-0.5 rounded-md"
          style={{ backgroundColor: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <BreakdownItem label="PM услуги"  value={inv.pm_fee}             currency={inv.currency} />
        <BreakdownItem label="Коммуналка" value={inv.utilities_amount}   currency={inv.currency} />
        <BreakdownItem label="Ремонт"     value={inv.maintenance_amount} currency={inv.currency} />
      </div>

      <div
        className="flex items-end justify-between pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
            Итого
          </p>
          <p className="text-2xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            {Number(inv.total_amount).toLocaleString("ru-RU")}{" "}
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>{inv.currency}</span>
          </p>
        </div>
        <div className="text-right">
          {inv.status === "paid" ? (
            <>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
                Оплачен
              </p>
              <p className="text-xs text-white/70 mt-1">
                {inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("ru-RU") : "—"}
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: overdue ? "#f87171" : "rgba(255,255,255,0.4)" }}>
                Срок оплаты
              </p>
              <p className="text-xs mt-1" style={{ color: overdue ? "#f87171" : "rgba(255,255,255,0.7)" }}>
                {dueDate.toLocaleDateString("ru-RU")}
                {!overdue && inv.due_date >= todayStr && daysLeft >= 0 && (
                  <span style={{ color: "rgba(255,255,255,0.45)" }}> · {daysLeft} дн.</span>
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BreakdownItem({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </p>
      <p className="text-sm text-white mt-1">
        {Number(value).toLocaleString("ru-RU")}{" "}
        <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>{currency}</span>
      </p>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</p>
      <p className="text-xl text-white mt-1.5" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value.toLocaleString("ru-RU")} <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>UZS</span>
      </p>
    </div>
  );
}

function fmtPeriod(start: string, end: string) {
  const s = new Date(start), e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  return `${fmt(s)} — ${fmt(e)} ${e.getFullYear()}`;
}
