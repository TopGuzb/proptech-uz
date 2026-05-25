// ─────────────────────────────────────────────────────────────────────────────
// app/resident/polls/page.tsx
//
// Resident-facing poll list. Resolves resident from auth user, fetches polls
// for their building, shows current vote (if any), allows voting on open
// polls. One vote per apartment — re-voting overwrites the previous choice.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Vote, CheckCircle2, CalendarClock, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

type PollStatus = "open" | "closed" | "cancelled";
interface PollOption { id: string; label: string; }

interface PollRow {
  id:          string;
  building_id: string;
  title:       string;
  description: string | null;
  options:     PollOption[];
  status:      PollStatus;
  closes_at:   string | null;
  created_at:  string;
}

interface ResidentInfo { id: string; apartment_id: string; building_id: string; }

export default function ResidentPollsPage() {
  const [loading,  setLoading]  = useState(true);
  const [resident, setResident] = useState<ResidentInfo | null>(null);
  const [polls,    setPolls]    = useState<PollRow[]>([]);
  const [myVotes,  setMyVotes]  = useState<Record<string, string>>({});  // poll_id → option_id
  const [tally,    setTally]    = useState<Record<string, Record<string, number>>>({});
  const [busyPoll, setBusyPoll] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }

      const { data: r } = await supabase
        .from("residents")
        .select("id, apartment_id, is_active, apartments!inner(building_id)")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!r) { setLoading(false); return; }

      // Drill down to building_id (Supabase returns nested object)
      const apartments = (r as unknown as { apartments: { building_id: string } | { building_id: string }[] }).apartments;
      const building_id = Array.isArray(apartments) ? apartments[0]?.building_id : apartments?.building_id;
      if (!building_id) { setLoading(false); return; }

      const info: ResidentInfo = {
        id:           (r as { id: string }).id,
        apartment_id: (r as { apartment_id: string }).apartment_id,
        building_id,
      };
      setResident(info);

      const [pollsRes, votesRes] = await Promise.all([
        supabase.from("polls").select("*").eq("building_id", building_id).order("created_at", { ascending: false }),
        supabase.from("poll_votes").select("poll_id, option_id").eq("apartment_id", info.apartment_id),
      ]);

      const pollList = (pollsRes.data as PollRow[] | null) ?? [];
      setPolls(pollList);

      const mine: Record<string, string> = {};
      for (const v of (votesRes.data as { poll_id: string; option_id: string }[] | null) ?? []) {
        mine[v.poll_id] = v.option_id;
      }
      setMyVotes(mine);

      // Build live tally for the visible polls
      if (pollList.length > 0) {
        const ids = pollList.map((p) => p.id);
        const { data: allVotes } = await supabase
          .from("poll_votes")
          .select("poll_id, option_id")
          .in("poll_id", ids);
        const t: Record<string, Record<string, number>> = {};
        for (const v of allVotes ?? []) {
          t[v.poll_id] = t[v.poll_id] ?? {};
          t[v.poll_id][v.option_id] = (t[v.poll_id][v.option_id] ?? 0) + 1;
        }
        setTally(t);
      }
      setLoading(false);
    })();
  }, []);

  async function vote(pollId: string, optionId: string) {
    if (!resident) return;
    setBusyPoll(pollId);
    setError(null);
    try {
      const res = await fetch("/api/pm/polls/vote", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          poll_id:      pollId,
          option_id:    optionId,
          resident_id:  resident.id,
          apartment_id: resident.apartment_id,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Ошибка"); return; }

      // Update local tally
      setTally((t) => {
        const next = { ...t };
        const prev = myVotes[pollId];
        next[pollId] = { ...(next[pollId] ?? {}) };
        if (prev) next[pollId][prev] = Math.max(0, (next[pollId][prev] ?? 1) - 1);
        next[pollId][optionId] = (next[pollId][optionId] ?? 0) + 1;
        return next;
      });
      setMyVotes((m) => ({ ...m, [pollId]: optionId }));
    } finally {
      setBusyPoll(null);
    }
  }

  const open    = useMemo(() => polls.filter((p) => p.status === "open"),    [polls]);
  const closed  = useMemo(() => polls.filter((p) => p.status !== "open"),    [polls]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.4)" }}>
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!resident) {
    return (
      <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
        Текущий пользователь не привязан к квартире.
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          Голосования
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
          Решения по дому — один голос на квартиру
        </p>
      </header>

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

      {open.length === 0 && closed.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.02)",
            border:          "1px dashed rgba(255,255,255,0.10)",
            color:           "rgba(255,255,255,0.55)",
          }}
        >
          <Vote className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(255,255,255,0.25)" }} />
          <p className="text-sm">Сейчас активных голосований нет.</p>
        </div>
      ) : null}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>Активные</h2>
          {open.map((p) => (
            <ResidentPollCard
              key={p.id}
              poll={p}
              myVote={myVotes[p.id]}
              tally={tally[p.id] ?? {}}
              busy={busyPoll === p.id}
              onVote={(opt) => vote(p.id, opt)}
            />
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>Архив</h2>
          {closed.map((p) => (
            <ResidentPollCard
              key={p.id}
              poll={p}
              myVote={myVotes[p.id]}
              tally={tally[p.id] ?? {}}
              busy={false}
              onVote={() => {}}
              readOnly
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  poll:     PollRow;
  myVote?:  string;
  tally:    Record<string, number>;
  busy:     boolean;
  onVote:   (optionId: string) => void;
  readOnly?: boolean;
}
function ResidentPollCard({ poll, myVote, tally, busy, onVote, readOnly }: CardProps) {
  const total = Object.values(tally).reduce((s, n) => s + n, 0);
  const closed = poll.status !== "open" || readOnly;
  const expired = poll.closes_at ? new Date(poll.closes_at) < new Date() : false;

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: "#0d1117",
        border:          myVote ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-base text-white font-semibold">{poll.title}</p>
          {poll.description && (
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>{poll.description}</p>
          )}
          {poll.closes_at && (
            <p className="text-[11px] mt-1.5 flex items-center gap-1" style={{ color: expired ? "#f87171" : "rgba(255,255,255,0.45)" }}>
              <CalendarClock className="w-3 h-3" />
              До {new Date(poll.closes_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        {closed && (
          <span
            className="text-[11px] px-2 py-0.5 rounded-md flex items-center gap-1"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <Lock className="w-3 h-3" /> Закрыт
          </span>
        )}
      </div>

      <div className="space-y-2">
        {poll.options.map((o) => {
          const count = tally[o.id] ?? 0;
          const pct   = total > 0 ? (count / total) * 100 : 0;
          const mine  = myVote === o.id;
          const disabled = closed || expired || busy;
          return (
            <button
              key={o.id}
              onClick={() => !disabled && onVote(o.id)}
              disabled={disabled}
              className="w-full rounded-lg p-3 relative overflow-hidden transition-all text-left"
              style={{
                backgroundColor: mine ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
                border:          mine ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.06)",
                cursor:          disabled ? "default" : "pointer",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  width: `${pct}%`,
                  background: mine
                    ? "linear-gradient(90deg, rgba(16,185,129,0.18) 0%, rgba(20,184,166,0.05) 100%)"
                    : "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, transparent 100%)",
                }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-sm flex items-center gap-2" style={{ color: mine ? "#6ee7b7" : "white" }}>
                  {mine && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {o.label}
                </span>
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {count} · {pct.toFixed(0)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {!closed && !expired && (
        <p className="text-[11px] mt-3" style={{ color: "rgba(255,255,255,0.4)" }}>
          {myVote ? "Можно изменить выбор до закрытия" : "Кликните на вариант чтобы проголосовать"}
        </p>
      )}
    </div>
  );
}
