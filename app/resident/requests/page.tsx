// ─────────────────────────────────────────────────────────────────────────────
// app/resident/requests/page.tsx
//
// Resident's own request history. Cards show priority, status, title, date
// and photo thumbnails. Newest first.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { MaintenanceRequest } from "@/lib/types/database";

interface PhotoRow {
  request_id: string;
  photo_url:  string;
  photo_type: string;
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

export default function ResidentRequestsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "rgba(255,255,255,0.4)" }} />
      </div>
    }>
      <ResidentRequestsInner />
    </Suspense>
  );
}

function ResidentRequestsInner() {
  const searchParams = useSearchParams();
  const justCreated  = searchParams.get("created") === "1";

  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [photos,   setPhotos]   = useState<Map<string, string[]>>(new Map());
  const [showSuccess, setShowSuccess] = useState(justCreated);

  useEffect(() => {
    if (!showSuccess) return;
    const t = setTimeout(() => setShowSuccess(false), 4000);
    return () => clearTimeout(t);
  }, [showSuccess]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setLoading(false); return; }

      const { data: residentRow } = await supabase
        .from("residents")
        .select("id, apartment_id")
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (!residentRow) { setLoading(false); return; }

      const { data: reqs } = await supabase
        .from("maintenance_requests")
        .select("*")
        .eq("apartment_id", residentRow.apartment_id)
        .order("created_at", { ascending: false });

      const list = (reqs as MaintenanceRequest[] | null) ?? [];
      setRequests(list);

      if (list.length > 0) {
        const { data: ph } = await supabase
          .from("maintenance_photos")
          .select("request_id, photo_url, photo_type")
          .in("request_id", list.map((r) => r.id));
        const map = new Map<string, string[]>();
        for (const p of (ph as PhotoRow[] | null) ?? []) {
          const arr = map.get(p.request_id) ?? [];
          arr.push(p.photo_url);
          map.set(p.request_id, arr);
        }
        setPhotos(map);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl text-white" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
            Мои заявки
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            {requests.length === 0 ? "Заявок ещё нет" : `${requests.length} всего`}
          </p>
        </div>
        <Link
          href="/resident/requests/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
        >
          <Plus className="w-4 h-4" />
          Создать заявку
        </Link>
      </header>

      {showSuccess && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: "rgba(16,185,129,0.10)",
            border:          "1px solid rgba(16,185,129,0.30)",
            color:           "#6ee7b7",
          }}
        >
          <CheckCircle2 className="w-4 h-4" />
          Заявка создана. Управляющий уже её увидел.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.4)" }}>
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{
            backgroundColor: "#0d1117",
            border:          "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
            Здесь будут ваши заявки. Нажмите «Создать заявку», чтобы оформить первую.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const p   = PRIORITY_COLOR[r.priority];
            const s   = STATUS_COLOR[r.status];
            const pix = photos.get(r.id) ?? [];
            return (
              <div
                key={r.id}
                className="rounded-2xl p-5"
                style={{
                  backgroundColor: "#0d1117",
                  border:          "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white">{r.title}</h3>
                    <p className="text-sm mt-1 line-clamp-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {r.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: p.bg, color: p.text }}
                    >
                      {p.label}
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: s.bg, color: s.text }}
                    >
                      {s.label}
                    </span>
                  </div>
                </div>

                {pix.length > 0 && (
                  <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                    {pix.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${r.id}-${i}`}
                        src={url}
                        alt=""
                        className="rounded-lg shrink-0"
                        style={{ width: 72, height: 72, objectFit: "cover", border: "1px solid rgba(255,255,255,0.06)" }}
                      />
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <span>Создана {new Date(r.created_at).toLocaleString("ru-RU")}</span>
                  {r.completed_at && (
                    <span>Завершена {new Date(r.completed_at).toLocaleDateString("ru-RU")}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
