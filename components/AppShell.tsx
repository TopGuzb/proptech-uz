// ─────────────────────────────────────────────────────────────────────────────
// components/AppShell.tsx
//
// The "frame" wrapper used by every authenticated page. It just glues the
// fixed Sidebar on the left to the page content on the right, and sets the
// dark background colour for the whole screen.
//
// Usage inside a page:
//   <AppShell>
//     <header>...</header>
//     <main>...page content...</main>
//   </AppShell>
//
// The sidebar is 14rem (224px) wide, hence the 14rem left margin on the
// content column so nothing slides under it.
// ─────────────────────────────────────────────────────────────────────────────

import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <Sidebar />
      <div className="flex flex-col flex-1" style={{ marginLeft: "14rem" }}>
        {children}
      </div>
    </div>
  );
}
