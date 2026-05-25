// ─────────────────────────────────────────────────────────────────────────────
// components/ResidentNav.tsx
//
// Top navigation bar for the Resident portal (/resident/*).
// Logo on the left, tabs in the middle, user name + sign-out on the right.
// Dark theme matches the rest of the app.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";

const TABS = [
  { href: "/resident/dashboard",   label: "Моя квартира" },
  { href: "/resident/requests",    label: "Заявки"        },
  { href: "/resident/invoices",    label: "Счета"         },
  { href: "/resident/consumption", label: "Потребление"   },
  { href: "/resident/polls",       label: "Голосования"   },
];

export default function ResidentNav() {
  const pathname = usePathname();
  const router   = useRouter();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const { data: resident } = await supabase
        .from("residents")
        .select("full_name")
        .eq("user_id", data.user.id)
        .maybeSingle();
      setName(resident?.full_name ?? data.user.email ?? "");
    })();
    return () => { cancelled = true; };
  }, []);

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
      {/* Logo */}
      <Link href="/resident/dashboard" className="flex items-center gap-2.5 shrink-0">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <span
          className="text-sm text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
        >
          {BRAND.name}
        </span>
      </Link>

      {/* Tabs */}
      <nav className="flex items-center gap-1">
        {TABS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: active ? "rgba(99,102,241,0.12)" : "transparent",
                color:           active ? "#a5b4fc" : "rgba(255,255,255,0.55)",
              }}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="flex items-center gap-3 shrink-0">
        {name && (
          <span className="text-xs text-white truncate max-w-[160px]">{name}</span>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <LogOut className="w-3.5 h-3.5" />
          Выйти
        </button>
      </div>
    </header>
  );
}
