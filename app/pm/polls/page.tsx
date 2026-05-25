// ─────────────────────────────────────────────────────────────────────────────
// app/pm/polls/page.tsx
//
// PM-facing poll management. Building selector → list polls with live tally
// + quorum bar. Inline create form with dynamic options + quorum + deadline.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Vote, X, Lock, Trash2, CalendarClock } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Project   { id: string; name: string; }
interface Building  { id: string; name: string; project_id: string; }
interface PollOption { id: string; label: string; }

type PollStatus = "open" | "closed" | "cancelled";

interface PollRow {
  id:          string;
  building_id: string;
  title:       string;
  description: string | null;
  options:     PollOption[];
  status:      PollStatus;
  quorum_pct:  number;
  closes_at:   string | null;
  ai_summary:  string | null;
  vote_counts: Record<string, number>;
  total_votes: number;
  created_at:  string;
}

const STATUS_META: Record<PollStatus, { label: string; bg: string; fg: string; border: string }> = {
  open:      { label: "Идёт",     bg: "rgba(16,185,129,0.12)", fg: "#34d399", border: "rgba(16,185,129,0.35)" },
  closed:    { label: "Завершён", bg: "rgba(255,255,255,0.05)", fg: "rgba(255,255,255,0.6)", border: "rgba(255,255,255,0.10)" },
  cancelled: { label: "Отменён",  bg: "rgba(239,68,68,0.10)",  fg: "#f87171", border: "rgba(239,68,68,0.30)" },
};

export default function PMPollsPage() {
  const [projects,     setProjects]     = useState<Project[]>([]);
  const [buildings,    setBuildings]    = useState<Building[]>([]);
  const [selectedProj, setSelectedProj] = useState("");
  const [selectedBldg, setSelectedBldg] = useState("");
  const [polls,        setPolls]        = useState<PollRow[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [aptCount,     setAptCount]     = useState(0);
  const [creating,     setCreating]     = useState(false);

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

  async function loadPolls() {
    if (!selectedBldg) { setPolls([]); setAptCount(0); setLoading(false); return; }
    setLoading(true);

    const [{ count: aptC }, res] = await Promise.all([
      supabase.from("apartments").select("*", { count: "exact", head: true }).eq("building_id", selectedBldg),
      fetch(`/api/pm/polls?building_id=${selectedBldg}`),
    ]);
    setAptCount(aptC ?? 0);
    const json = await res.json();
    setPolls((json.polls as PollRow[] | null) ?? []);
    setLoading(false);
  }
  useEffect(() => { loadPolls(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [selectedBldg]);

  async function changeStatus(id: string, status: PollStatus) {
    setPolls((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    await fetch(`/api/pm/polls?id=${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#34d399" }}>
            Property Management
          </p>
          <h1 className="text-3xl text-white mt-1" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Голосования
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            ОСС — общие собрания собственников по дому
          </p>
        </div>
        <button
          onClick={() => setCreating((c) => !c)}
          disabled={!selectedBldg}
          className="rounded-xl px-4 py-2.5 text-sm text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          style={{ background: creating
            ? "rgba(255,255,255,0.05)"
            : "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          {creating ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {creating ? "Отмена" : "Создать"}
        </button>
      </header>

      <div className="flex flex-wrap gap-3">
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

      {creating && selectedBldg && (
        <CreatePollCard
          buildingId={selectedBldg}
          onCreated={() => { setCreating(false); loadPolls(); }}
          onCancel={() => setCreating(false)}
        />
      )}

      {loading ? (
        <div
          className="rounded-2xl p-12 flex items-center justify-center"
          style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
        >
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : polls.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <Vote className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">Голосований нет. Создай первое.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((p) => (
            <PollCard key={p.id} poll={p} aptCount={aptCount} onStatusChange={changeStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create poll form ────────────────────────────────────────────────────────

interface CreateProps { buildingId: string; onCreated: () => void; onCancel: () => void; }
function CreatePollCard({ buildingId, onCreated, onCancel }: CreateProps) {
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [options,     setOptions]     = useState<string[]>(["За", "Против", "Воздержался"]);
  const [quorum,      setQuorum]      = useState(50);
  const [closesAt,    setClosesAt]    = useState("");
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  function setOpt(i: number, v: string) { setOptions((arr) => arr.map((x, idx) => (idx === i ? v : x))); }
  function addOpt() { setOptions((arr) => [...arr, ""]); }
  function removeOpt(i: number) {
    if (options.length <= 2) return;
    setOptions((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function save() {
    setError(null);
    const cleanOpts = options
      .map((o, idx) => ({ id: String.fromCharCode(97 + idx), label: o.trim() }))
      .filter((o) => o.label);
    if (!title.trim()) { setError("Введите заголовок"); return; }
    if (cleanOpts.length < 2) { setError("Минимум 2 варианта"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/pm/polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: buildingId,
          title:       title.trim(),
          description: description.trim() || null,
          options:     cleanOpts,
          quorum_pct:  quorum,
          closes_at:   closesAt ? new Date(closesAt).toISOString() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Ошибка"); return; }
      onCreated();
    } finally { setSaving(false); }
  }

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(16,185,129,0.25)" }}
    >
      <h3 className="text-lg text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>
        Новое голосование
      </h3>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Заголовок (например: Тариф на охрану)"
        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание вопроса"
        rows={3}
        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none resize-none"
        style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      />

      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
          Варианты ответа
        </p>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => setOpt(i, e.target.value)}
                className="flex-1 rounded-xl px-3 py-2 text-sm text-white outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <button
                onClick={() => removeOpt(i)}
                disabled={options.length <= 2}
                className="p-2 rounded-lg transition-colors hover:bg-white/[0.06] disabled:opacity-30"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addOpt} className="mt-2 text-xs flex items-center gap-1" style={{ color: "#34d399" }}>
          <Plus className="w-3.5 h-3.5" /> Добавить вариант
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            Кворум, %
          </p>
          <input
            type="number"
            min={0} max={100}
            value={quorum}
            onChange={(e) => setQuorum(Math.max(0, Math.min(100, Number(e.target.value))))}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
            Закрыть до
          </p>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }}
          />
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm transition-colors"
          style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Отмена
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Запустить голосование
        </button>
      </div>
    </div>
  );
}

// ── Poll card ────────────────────────────────────────────────────────────────

interface PollCardProps {
  poll: PollRow;
  aptCount: number;
  onStatusChange: (id: string, s: PollStatus) => void;
}
function PollCard({ poll, aptCount, onStatusChange }: PollCardProps) {
  const meta = STATUS_META[poll.status];
  const quorumThreshold = Math.ceil(aptCount * poll.quorum_pct / 100);
  const quorumPct = aptCount > 0 ? Math.min(100, (poll.total_votes / aptCount) * 100) : 0;
  const quorumMet = poll.total_votes >= quorumThreshold && quorumThreshold > 0;

  return (
    <div
      className="rounded-2xl p-5"
      style={{ backgroundColor: "#0d1117", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-base text-white font-semibold">{poll.title}</p>
          {poll.description && (
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>{poll.description}</p>
          )}
          {poll.closes_at && (
            <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              <CalendarClock className="w-3 h-3" />
              До {new Date(poll.closes_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <span
          className="text-[11px] px-2 py-0.5 rounded-md shrink-0"
          style={{ backgroundColor: meta.bg, color: meta.fg, border: `1px solid ${meta.border}` }}
        >
          {meta.label}
        </span>
      </div>

      {/* Quorum bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
          <span>Кворум {poll.quorum_pct}%</span>
          <span>
            {poll.total_votes} / {aptCount} голосов
            {quorumMet && <span style={{ color: "#34d399" }}> · достигнут</span>}
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
        >
          <div
            className="h-full transition-all"
            style={{
              width: `${quorumPct}%`,
              background: quorumMet
                ? "linear-gradient(90deg, #10b981 0%, #14b8a6 100%)"
                : "linear-gradient(90deg, #fbbf24 0%, #f97316 100%)",
            }}
          />
        </div>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((o) => {
          const count = poll.vote_counts[o.id] ?? 0;
          const pct   = poll.total_votes > 0 ? (count / poll.total_votes) * 100 : 0;
          return (
            <div
              key={o.id}
              className="rounded-lg p-3 relative overflow-hidden"
              style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg, rgba(16,185,129,0.15) 0%, rgba(20,184,166,0.05) 100%)",
                }}
              />
              <div className="relative flex items-center justify-between">
                <span className="text-sm text-white">{o.label}</span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {count} · {pct.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {poll.status === "open" && (
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => onStatusChange(poll.id, "closed")}
            className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <Lock className="w-3 h-3" /> Завершить
          </button>
          <button
            onClick={() => onStatusChange(poll.id, "cancelled")}
            className="px-3 py-1.5 rounded-lg text-xs"
            style={{ color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            Отменить
          </button>
        </div>
      )}
    </div>
  );
}

// ── Selector ────────────────────────────────────────────────────────────────

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
