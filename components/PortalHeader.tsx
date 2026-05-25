// ─────────────────────────────────────────────────────────────────────────────
// components/PortalHeader.tsx
//
// Minimal top bar used by the dispatcher and vendor portals (which don't yet
// have full tab navigation in Sprint 1). Resident portal uses ResidentNav
// instead — that one has tabs.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";

export default function PortalHeader({ subtitle }: { subtitle?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    document.cookie = "proptech-session=; path=/; max-age=0";
    document.cookie = "proptech-role=;    path=/; max-age=0";
    document.cookie = "proptech-pm-role=; path=/; max-age=0";
    router.push("/login");
  }

  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between h-14 px-6"
      style={{
        backgroundColor: "#0d1117",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span
            className="text-sm text-white tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {BRAND.name}
          </span>
          {subtitle && (
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {subtitle}
            </span>
          )}
        </div>
      </Link>

      <button
        onClick={handleSignOut}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        <LogOut className="w-3.5 h-3.5" />
        Выйти
      </button>
    </header>
  );
}
