// ─────────────────────────────────────────────────────────────────────────────
// components/Sidebar.tsx
//
// Left-hand navigation panel. Lives inside <AppShell>. The links shown here
// depend on the user's role (admin / manager / viewer), which is read from
// the "proptech-role" cookie that was set during login.
//
// Quick map of this file:
//   • Logo block at the top     → just branding
//   • <nav> in the middle       → role-aware menu (NAV_BY_ROLE map below)
//   • Bottom block              → user avatar + role pill + Sign out button
//
// Role → routes:
//   admin    : /dashboard, /projects, /apartments, /clients, /calculator,
//              /users, /pricing
//   manager  : /seller/dashboard, /clients (own), /apartments, /calculator
//   viewer   : /dashboard, /calculator
//
// Sign out clears Supabase session AND both cookies, then sends user to /login.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2, LayoutDashboard, FolderKanban, Home,
  Users, BarChart2, ShieldCheck, LogOut, Calculator, CreditCard,
  ArrowRightLeft,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "admin" | "manager" | "viewer";

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ElementType;
}

// ── Nav definitions ───────────────────────────────────────────────────────────

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    { href: "/dashboard",  label: "Overview",    icon: LayoutDashboard },
    { href: "/projects",   label: "Projects",    icon: FolderKanban    },
    { href: "/apartments", label: "Apartments",  icon: Home            },
    { href: "/clients",    label: "Clients",     icon: Users           },
    { href: "/calculator", label: "Calculator",  icon: Calculator      },
    { href: "/users",      label: "Users",       icon: ShieldCheck     },
    { href: "/pricing",    label: "Pricing",     icon: CreditCard      },
  ],
  manager: [
    { href: "/seller/dashboard", label: "My Dashboard", icon: BarChart2  },
    { href: "/clients",          label: "My Clients",   icon: Users      },
    { href: "/apartments",       label: "Apartments",   icon: Home       },
    { href: "/calculator",       label: "Calculator",   icon: Calculator },
  ],
  viewer: [
    { href: "/dashboard",  label: "Overview",   icon: LayoutDashboard },
    { href: "/calculator", label: "Calculator", icon: Calculator      },
  ],
};

const ROLE_BADGE: Record<Role, { label: string; bg: string; text: string }> = {
  admin:   { label: "Admin",   bg: "rgba(99,102,241,0.15)",  text: "#a5b4fc" },
  manager: { label: "Manager", bg: "rgba(16,185,129,0.12)",  text: "#34d399" },
  viewer:  { label: "Viewer",  bg: "rgba(100,116,139,0.15)", text: "#64748b" },
};

function getRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )proptech-role=([^;]*)/);
  return m ? (decodeURIComponent(m[1]) as Role) : null;
}

function getPMRoleCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|; )proptech-pm-role=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
      style={{
        backgroundColor: active ? "rgba(99,102,241,0.12)" : "transparent",
        color:           active ? "#a5b4fc" : "rgba(255,255,255,0.45)",
        borderLeft:      active ? "3px solid #6366f1" : "3px solid transparent",
        marginLeft:      "-2px",
        paddingLeft:     active ? "calc(0.75rem - 1px)" : "0.75rem",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
      }}
    >
      <Icon
        className="w-4 h-4 shrink-0"
        style={{ color: active ? "#6366f1" : "rgba(255,255,255,0.3)" }}
      />
      <span className={active ? "font-semibold" : "font-normal"}>{label}</span>
    </Link>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [role,      setRole]      = useState<Role | null>(null);
  const [pmRole,    setPmRole]    = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    setRole(getRoleCookie());
    setPmRole(getPMRoleCookie());
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  // Where should "Go to PM Portal" actually take this user?
  const pmDest =
    pmRole === "property_manager" ? "/pm/dashboard" :
    pmRole === "dispatcher"       ? "/dispatcher/dashboard" :
    pmRole === "vendor"           ? "/vendor/dashboard" :
    pmRole === "resident"         ? "/resident/dashboard" :
    null;

  async function handleSignOut() {
    await supabase.auth.signOut();
    document.cookie = "proptech-session=; path=/; max-age=0";
    document.cookie = "proptech-role=;    path=/; max-age=0";
    document.cookie = "proptech-pm-role=; path=/; max-age=0";
    router.push("/login");
  }

  const navItems = role ? NAV_BY_ROLE[role] : [];
  const badge    = role ? ROLE_BADGE[role]   : null;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col w-56"
      style={{
        backgroundColor: "#0d1117",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* ── Logo ── */}
      <div
        className="flex items-center gap-2.5 h-14 px-4 shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
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
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <p
          className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.22)" }}
        >
          Menu
        </p>
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* ── PM Portal switcher (only if user has any pm_role) ── */}
      {pmDest && (
        <div className="px-3 pt-3 pb-1 shrink-0">
          <Link
            href={pmDest}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{
              backgroundColor: "rgba(16,185,129,0.10)",
              color:           "#6ee7b7",
              border:          "1px solid rgba(16,185,129,0.25)",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(16,185,129,0.18)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(16,185,129,0.10)")}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
            Перейти в PM Portal
          </Link>
        </div>
      )}

      {/* ── User info + sign out ── */}
      <div
        className="px-3 py-4 shrink-0 space-y-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* User card */}
        {userEmail && (
          <div
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
            >
              {initials(userEmail)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-snug">
                {userEmail.split("@")[0]}
              </p>
              <p className="text-[10px] truncate leading-snug" style={{ color: "rgba(255,255,255,0.28)" }}>
                {userEmail}
              </p>
            </div>
          </div>
        )}

        {/* Role pill */}
        {badge && (
          <div className="px-1">
            <span
              className="inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              {badge.label}
            </span>
          </div>
        )}

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.32)" }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
