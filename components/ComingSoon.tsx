// ─────────────────────────────────────────────────────────────────────────────
// components/ComingSoon.tsx
//
// Reusable placeholder card for stub pages. Used heavily in Sprint 1 because
// most PM screens are empty until their respective Sprints land.
// ─────────────────────────────────────────────────────────────────────────────

import { Sparkles } from "lucide-react";

export default function ComingSoon({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center"
      style={{
        backgroundColor: "#0d1117",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl"
        style={{ backgroundColor: "#1e1b4b" }}
      >
        <Sparkles className="w-5 h-5" style={{ color: "#6366f1" }} />
      </div>
      <h2
        className="text-lg text-white"
        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
      >
        {title}
      </h2>
      <p className="text-sm max-w-md" style={{ color: "rgba(255,255,255,0.4)" }}>
        {hint ?? "Coming soon — раздел будет добавлен в следующем спринте."}
      </p>
    </div>
  );
}
