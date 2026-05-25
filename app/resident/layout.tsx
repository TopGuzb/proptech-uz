// ─────────────────────────────────────────────────────────────────────────────
// app/resident/layout.tsx
//
// Shared layout for the Resident portal. Renders the top nav and the page
// content underneath on the dark background.
// ─────────────────────────────────────────────────────────────────────────────

import ResidentNav from "@/components/ResidentNav";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <ResidentNav />
      <main className="px-6 py-6 max-w-6xl mx-auto w-full">{children}</main>
    </div>
  );
}
