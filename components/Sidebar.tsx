"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2, LayoutDashboard, FolderKanban, Home,
  Users, BarChart2, ShieldCheck, LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Role = "admin" | "manager" | "viewer";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",  label: "Overview",    icon: LayoutDashboard },
  { href: "/projects",   label: "Projects",    icon: FolderKanban },
  { href: "/apartments", label: "Apartments",  icon: Home },
  { href: "/clients",    label: "Clients",     icon: Users },
  { href: "/seller",     label: "My Stats",    icon: BarChart2 },
  { href: "/users",      label: "Users",       icon: ShieldCheck, adminOnly: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoleCookie(): Role | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )proptech-role=([^;]*)/);
  return match ? (decodeURIComponent(match[1]) as Role) : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    setRole(getRoleCookie());
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    document.cookie = "proptech-session=; path=/; max-age=0";
    document.cookie = "proptech-role=; path=/; max-age=0";
    router.push("/login");
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || role === "admin"
  );

  const roleBadge: Record<Role, { label: string; bg: string; text: string }> = {
    admin:   { label: "Admin",   bg: "#1e1b4b", text: "#a5b4fc" },
    manager: { label: "Manager", bg: "#052e16", text: "#34d399" },
    viewer:  { label: "Viewer",  bg: "#1e2536", text: "#64748b" },
  };

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col w-56 border-r"
      style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 h-14 px-4 border-b shrink-0"
        style={{ borderColor: "#1e2536" }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
          style={{ backgroundColor: "#6366f1" }}
        >
          <Building2 className="w-4 h-4 text-white" />
        </div>
        <span className="font-semibold text-white text-sm leading-tight">
          PropTech CRM
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p
          className="px-2 pb-2 text-xs font-semibold uppercase tracking-widest"
          style={{ color: "#334155" }}
        >
          Menu
        </p>
        {visibleItems.map(({ href, label, icon: Icon, adminOnly }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                backgroundColor: active ? "#1e1b4b" : "transparent",
                color: active ? "#a5b4fc" : "#64748b",
              }}
            >
              <Icon
                className="w-4 h-4 shrink-0"
                style={{ color: active ? "#6366f1" : adminOnly ? "#f59e0b" : "#475569" }}
              />
              {label}
              {adminOnly && (
                <span
                  className="ml-auto text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "#1c1003", color: "#f59e0b" }}
                >
                  Admin
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Role badge + sign out */}
      <div className="px-3 py-4 border-t shrink-0 space-y-2" style={{ borderColor: "#1e2536" }}>
        {role && (
          <div className="px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ backgroundColor: "#080b14" }}>
            <span className="text-xs" style={{ color: "#334155" }}>Role:</span>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: roleBadge[role]?.bg,
                color: roleBadge[role]?.text,
              }}
            >
              {roleBadge[role]?.label}
            </span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/5"
          style={{ color: "#475569" }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
