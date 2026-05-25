// ─────────────────────────────────────────────────────────────────────────────
// app/pm/invoices/page.tsx
//
// PM-facing invoice manager.
//   • Project + building selectors (cascading)
//   • "Сгенерировать счета" — period picker → POST /api/pm/invoices/generate
//   • Table of pm_invoices for selected building with status badges
//   • Inline status update (draft → sent → paid; or mark overdue)
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Project  { id: string; name: string; }
interface Building { id: string; name: string; project_id: string; }
interface Apartment { id: string; number: string; building_id: string; }

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

interface InvoiceRow {
  id:                    string;
  apartment_id:          string;
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
  sent:      { label: "Отправлен",  bg: "rgba(59,130,246,0.12)",  fg: "#60a5fa",                border: "rgba(59,130,246,0.35)" },
  paid:      { label: "Оплачен",    bg: "rgba(16,185,129,0.12)",  fg: "#34d399",                border: "rgba(16,185,129,0.35)" },
  overdue:   { label: "Просрочен",  bg: "rgba(239,68,68,0.12)",   fg: "#f87171",                border: "rgba(239,68,68,0.35)" },
  cancelled: { label: "Отменён",    bg: "rgba(255,255,255,0.04)", fg: "rgba(255,255,255,0.4)",  border: "rgba(255,255,255,0.08)" },
};

function todayYmd() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function lastOfMonth() {
  const d = new Date(); d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

export default function PMInvoicesPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [buildings,    setBuildings]    = useState<Building[]>([]);
  const [selectedProj, setSelectedProj] = useState("");
  const [selectedBldg, setSelectedBldg] = useState("");
  const [aptByApt,     setAptByApt]     = useState<Map<string, string>>(new Map());
  const [invoices,     setInvoices]     = useState<InvoiceRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [generating,   setGenerating]   = useState(false);
  const [periodStart,  setPeriodStart]  = useState(firstOfMonth());
  const [periodEnd,    setPeriodEnd]    = useState(lastOfMonth());
  const [message,      setMessage]      = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // 1. Load projects + buildings
  useEffect(() => {
    (async () => {
      const [{ data: projs }, { data: blds }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("buildings").select("id, name, project_id").order("name"),
      ]);
      setProjects((projs as Project[] | null) ?? []);
      setBuildings((blds as Building[] | null) ?? []);
      if (projs && projs.length > 0) setSelectedProj(projs[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedProj) { setSelectedBldg(""); return; }
    const first = buildings.find((b) => b.project_id === selectedProj);
    setSelectedBldg(first?.id ?? "");
  }, [selectedProj, buildings]);

  const filteredBuildings = useMemo(
    () => buildings.filter((b) => b.project_id === selectedProj),
    [buildings, selectedProj],
  );

  // 2. Load invoices for building
  async function loadInvoices() {
    if (!selectedBldg) {
      setInvoices([]);
      setAptByApt(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: apts } = await supabase
      .from("apartments")
      .select("id, number, building_id")
      .eq("building_id", selectedBldg);

    const aptList = (apts as Apartment[] | null) ?? [];
    const map = new Map<string, string>();
    for (const a of aptList) map.set(a.id, a.number);
    setAptByApt(map);

    if (aptList.length === 0) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    const { data: invs } = await supabase
      .from("pm_invoices")
      .select(
        "id, apartment_id, invoice_number, billing_period_start, billing_period_end, pm_fee, utilities_amount, maintenance_amount, total_amount, currency, status, due_date, paid_at, created_at",
      )
      .in("apartment_id", aptList.map((a) => a.id))
      .order("created_at", { ascending: false });

    setInvoices((invs as InvoiceRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadInvoices(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedBldg]);

  // 3. Generate
  async function handleGenerate() {
    if (!selectedBldg || !periodStart || !periodEnd) return;
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pm/invoices/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id:   selectedBldg,
          period_start:  periodStart,
          period_end:    periodEnd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Ошибка генерации");
      const created = (json.created as unknown[] | undefined)?.length ?? 0;
      const skipped = (json.skipped as unknown[] | undefined)?.length ?? 0;
      setMessage({ kind: "ok", text: `Создано ${created}, пропущено ${skipped}` });
      await loadInvoices();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      setMessage({ kind: "err", text: msg });
    } finally {
      setGenerating(false);
    }
  }

  // 4. Status update
  async function updateStatus(id: string, next: InvoiceStatus) {
    const patch: Partial<InvoiceRow> = { status: next };
    if (next === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("pm_invoices").update(patch).eq("id", id);
    if (error) {
      setMessage({ kind: "err", text: error.message });
      return;
    }
    setInvoices((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } as InvoiceRow : r)),
    );
  }

  const totals = useMemo(() => {
    let t = 0, paid = 0, overdue = 0;
    for (const inv of invoices) {
      t += Number(inv.total_amount) || 0;
      if (inv.status === "paid")    paid    += Number(inv.total_amount) || 0;
      if (inv.status === "overdue") overdue += Number(inv.total_amount) || 0;
    }
    return { t, paid, overdue };
  }, [invoices]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
          Property Management
        </p>
        <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Счета
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Генерация и контроль ежемесячных счетов жильцам
        </p>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <Selector
          label="Проект"
          value={selectedProj}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={setSelectedProj}
        />
        <Selector
          label="Здание"
          value={selectedBldg}
          options={filteredBuildings.map((b) => ({ value: b.id, label: b.name }))}
          onChange={setSelectedBldg}
          disabled={filteredBuildings.length === 0}
        />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Всего за период" value={totals.t} accent="#10b981" />
        <SummaryCard label="Оплачено"        value={totals.paid} accent="#34d399" />
        <SummaryCard label="Просрочено"      value={totals.overdue} accent="#ef4444" />
      </div>

      {/* Generator */}
      <section
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <DateField label="Период с"  value={periodStart} onChange={setPeriodStart} />
          <DateField label="Период по" value={periodEnd}   onChange={setPeriodEnd} />
          <button
            onClick={handleGenerate}
            disabled={!selectedBldg || generating}
            className="rounded-xl px-4 py-2.5 text-sm text-white font-medium transition-all disabled:opacity-50 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Сгенерировать счета
          </button>
          <button
            onClick={loadInvoices}
            className="rounded-xl px-3 py-2.5 text-sm text-white/60 hover:text-white transition-colors flex items-center gap-2"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {message && (
          <p
            className="text-xs mt-3"
            style={{ color: message.kind === "ok" ? "#34d399" : "#f87171" }}
          >
            {message.text}
          </p>
        )}
      </section>

      {/* Table */}
      <section>
        <h2 className="text-lg text-white mb-3" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
          Все счета
        </h2>
        {loading ? (
          <div
            className="rounded-2xl p-12 flex items-center justify-center"
            style={{
              backgroundColor: "#0d1117",
              border:          "1px solid rgba(255,255,255,0.06)",
              color:           "rgba(255,255,255,0.4)",
            }}
          >
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
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
            <p className="text-sm">Счетов пока нет. Сгенерируй первую партию выше.</p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "#0d1117",
              border:          "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <Th>№</Th>
                    <Th>Кв.</Th>
                    <Th>Период</Th>
                    <Th align="right">Сумма</Th>
                    <Th>Срок</Th>
                    <Th>Статус</Th>
                    <Th>Действие</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const meta = STATUS_META[inv.status];
                    return (
                      <tr key={inv.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <Td><span className="text-white/80 text-xs font-mono">{inv.invoice_number}</span></Td>
                        <Td><span className="text-white">№{aptByApt.get(inv.apartment_id) ?? "—"}</span></Td>
                        <Td>
                          <span className="text-white/60 text-xs">
                            {fmtPeriod(inv.billing_period_start, inv.billing_period_end)}
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="text-white font-medium">
                            {Number(inv.total_amount).toLocaleString("ru-RU")} {inv.currency}
                          </span>
                        </Td>
                        <Td>
                          <span className="text-white/60 text-xs">
                            {new Date(inv.due_date).toLocaleDateString("ru-RU")}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-md inline-block"
                            style={{ backgroundColor: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
                          >
                            {meta.label}
                          </span>
                        </Td>
                        <Td>
                          <StatusActions inv={inv} onChange={updateStatus} />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtPeriod(start: string, end: string) {
  const s = new Date(start), e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  return `${fmt(s)} — ${fmt(e)}`;
}

interface SelectorProps {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean;
}
function Selector({ label, value, options, onChange, disabled }: SelectorProps) {
  return (
    <label className="flex flex-col gap-1.5 min-w-[200px]">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none disabled:opacity-50"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {options.length === 0 && <option value="">—</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ backgroundColor: "#0d1117" }}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

interface DateFieldProps { label: string; value: string; onChange: (v: string) => void; }
function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl px-3 py-2.5 text-sm text-white outline-none"
        style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }}
      />
    </label>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>{label}</p>
      <p className="text-2xl text-white mt-2" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
        {value.toLocaleString("ru-RU")} <span className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>UZS</span>
      </p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-4 py-3 text-[10px] uppercase tracking-widest font-medium ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: "rgba(255,255,255,0.4)" }}
    >
      {children}
    </th>
  );
}
function Td({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>;
}

function StatusActions({ inv, onChange }: { inv: InvoiceRow; onChange: (id: string, next: InvoiceStatus) => void }) {
  if (inv.status === "draft") {
    return <ActionBtn onClick={() => onChange(inv.id, "sent")}>Отправить</ActionBtn>;
  }
  if (inv.status === "sent" || inv.status === "overdue") {
    return <ActionBtn onClick={() => onChange(inv.id, "paid")} accent="#34d399">Оплачен</ActionBtn>;
  }
  return <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>—</span>;
}
function ActionBtn({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] px-2.5 py-1 rounded-md transition-colors hover:bg-white/[0.05]"
      style={{ color: accent ?? "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.10)" }}
    >
      {children}
    </button>
  );
}
