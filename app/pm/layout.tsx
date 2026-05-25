// ─────────────────────────────────────────────────────────────────────────────
// app/pm/layout.tsx
//
// Wraps the entire /pm/* tree in a PM-specific shell with the dedicated
// PMSidebar (emerald accent). The /pm/login page is excluded — it has its
// own full-screen layout.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { usePathname } from "next/navigation";
import PMSidebar from "@/components/PMSidebar";

export default function PMLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin  = pathname === "/pm/login" || pathname.startsWith("/pm/login/");

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <PMSidebar />
      <div className="flex flex-col flex-1" style={{ marginLeft: "14rem" }}>
        <main className="px-6 py-6 max-w-7xl mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}
