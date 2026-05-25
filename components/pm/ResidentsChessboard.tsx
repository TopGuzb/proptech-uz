// ─────────────────────────────────────────────────────────────────────────────
// components/pm/ResidentsChessboard.tsx
//
// Visual "chessboard" of apartments grouped by floor. Each cell is colored
// by the apartment's PM status:
//   • green  — занят, всё ок
//   • amber  — есть открытая заявка
//   • red    — экстренная заявка
//   • blue   — есть просроченный счёт
//   • gray   — пустая (нет жильца)
// Click a cell to open <ApartmentDetailDrawer>.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useMemo, useState } from "react";

export type ChessboardStatus =
  | "ok"
  | "open_request"
  | "emergency"
  | "overdue"
  | "empty";

export interface ChessboardApartment {
  id:            string;
  number:        string;
  floor:         number;
  size_m2:       number | null;
  rooms_count:   number | null;
  status:        ChessboardStatus;
  resident_name: string | null;
}

interface Props {
  apartments:  ChessboardApartment[];
  onSelect:    (apartmentId: string) => void;
}

const STATUS_COLOR: Record<ChessboardStatus, { bg: string; border: string; text: string }> = {
  ok:           { bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.35)", text: "#6ee7b7" },
  open_request: { bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.35)", text: "#fcd34d" },
  emergency:    { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.45)",  text: "#fca5a5" },
  overdue:      { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.35)", text: "#93c5fd" },
  empty:        { bg: "rgba(100,116,139,0.06)", border: "rgba(100,116,139,0.18)", text: "rgba(255,255,255,0.32)" },
};

const STATUS_LABEL: Record<ChessboardStatus, string> = {
  ok:           "Занят, всё ок",
  open_request: "Открытая заявка",
  emergency:    "Экстренная заявка",
  overdue:      "Просроченный счёт",
  empty:        "Пусто",
};

export default function ResidentsChessboard({ apartments, onSelect }: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const byFloor = useMemo(() => {
    const map = new Map<number, ChessboardApartment[]>();
    for (const a of apartments) {
      if (!map.has(a.floor)) map.set(a.floor, []);
      map.get(a.floor)!.push(a);
    }
    for (const list of map.values()) {
      list.sort((x, y) => x.number.localeCompare(y.number, "ru", { numeric: true }));
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [apartments]);

  if (apartments.length === 0) {
    return (
      <div
        className="rounded-2xl p-12 text-center text-sm"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.06)",
          color:           "rgba(255,255,255,0.4)",
        }}
      >
        Нет квартир для отображения. Выберите проект и здание выше.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {(Object.keys(STATUS_LABEL) as ChessboardStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded"
              style={{
                backgroundColor: STATUS_COLOR[s].bg,
                border:          `1px solid ${STATUS_COLOR[s].border}`,
              }}
            />
            <span style={{ color: "rgba(255,255,255,0.55)" }}>{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {/* Chessboard */}
      <div
        className="rounded-2xl p-6 space-y-3"
        style={{
          backgroundColor: "#0d1117",
          border:          "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {byFloor.map(([floor, list]) => (
          <div key={floor} className="flex items-start gap-4">
            <div
              className="text-xs font-semibold w-12 shrink-0 pt-2"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {floor} эт.
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {list.map((apt) => {
                const c = STATUS_COLOR[apt.status];
                const isHover = hoverId === apt.id;
                return (
                  <button
                    key={apt.id}
                    type="button"
                    onClick={() => onSelect(apt.id)}
                    onMouseEnter={() => setHoverId(apt.id)}
                    onMouseLeave={() => setHoverId(null)}
                    className="relative rounded-lg px-3 py-2 text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: c.bg,
                      border:          `1px solid ${c.border}`,
                      color:           c.text,
                      minWidth:        "56px",
                      transform:       isHover ? "translateY(-2px)" : "none",
                      boxShadow:       isHover ? `0 4px 12px ${c.border}` : "none",
                    }}
                  >
                    №{apt.number}
                    {isHover && (
                      <div
                        className="absolute z-10 left-1/2 -translate-x-1/2 -top-2 -translate-y-full whitespace-nowrap rounded-lg px-3 py-2 text-[11px]"
                        style={{
                          backgroundColor: "#1e2536",
                          border:          "1px solid rgba(255,255,255,0.08)",
                          color:           "rgba(255,255,255,0.85)",
                          fontWeight:      400,
                          minWidth:        "200px",
                          textAlign:       "left",
                        }}
                      >
                        <div className="font-semibold text-white">Квартира №{apt.number}</div>
                        <div style={{ color: "rgba(255,255,255,0.55)" }}>
                          {apt.rooms_count ? `${apt.rooms_count} комн.` : ""}
                          {apt.size_m2 ? ` · ${apt.size_m2} м²` : ""}
                        </div>
                        <div className="mt-1" style={{ color: c.text }}>
                          {STATUS_LABEL[apt.status]}
                        </div>
                        {apt.resident_name && (
                          <div className="mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>
                            👤 {apt.resident_name}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
