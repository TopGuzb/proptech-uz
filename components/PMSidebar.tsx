// ─────────────────────────────────────────────────────────────────────────────
// components/PMSidebar.tsx
//
// Left-hand navigation panel for the Property Management portal (/pm/*). This
// is intentionally separate from the Sales <Sidebar> so the two portals look
// and feel distinct. Users with both `pm_role` and a sales role can switch
// to the Sales side via the "Перейти к Sales →" link at the bottom.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Wrench, HardHat, UserCheck, Gauge, Receipt, Vote, Boxes, Building,
  LayoutDashboard, LogOut, ArrowLeftRight, Building2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";

type SalesRole = "admin" | "manager" | "viewer";
type PMRole    = "property_manager" | "dispatcher" | "vendor" | "resident";

interface NavItem {
  href:  string;
  label: string;
  icon:  React.ElementType;
}

const PM_NAV: NavItem[] = [
  { href: "/pm/dashboard", label: "Обзор",            icon: LayoutDashboard },
  { href: "/pm/residents", label: "Жильцы",           icon: UserCheck       },
  { href: "/pm/requests",  label: "Заявки",           icon: Wrench          },
  { href: "/pm/vendors",   label: "Подрядчики",       icon: HardHat         },
  { href: "/pm/meters",    label: "Счётчики",         icon: Gauge           },
  { href: "/pm/invoices",  label: "Счета",            icon: Receipt         },
  { href: "/pm/polls",     label: "Голосования",      icon: Vote            },
  { href: "/pm/inventory", label: "Инвентарь",        icon: Boxes           },
  { href: "/pm/communal",  label: "Общее имущество",  icon: Building        },
];

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
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
        backgroundColor: active ? "rgba(16,185,129,0.12)" : "transparent",
        color:           active ? "#6ee7b7" : "rgba(255,255,255,0.45)",
        borderLeft:      active ? "3px solid #10b981" : "3px solid transparent",
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
      <Icon className="w-4 h-4 shrink-0" style={{ color: active ? "#10b981" : "rgba(255,255,255,0.3)" }} />
      <span className={active ? "font-semibold" : "font-normal"}>{label}</span>
    </Link>
  );
}

export default function PMSidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [salesRole, setSalesRole] = useState<SalesRole | null>(null);
  const [pmRole,    setPmRole]    = useState<PMRole    | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    setSalesRole(getCookie("proptech-role")    as SalesRole | null);
    setPmRole(getCookie("proptech-pm-role")    as PMRole    | null);
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null));
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    document.cookie = "proptech-session=; path=/; max-age=0";
    document.cookie = "proptech-role=;    path=/; max-age=0";
    document.cookie = "proptech-pm-role=; path=/; max-age=0";
    router.push("/pm/login");
  }

  // A user with a sales-side admin/manager/viewer role gets the cross-portal
  // switcher. Pure PM users (only pm_role set) do not.
  const canSwitchToSales = salesRole === "admin" || salesRole === "manager" || salesRole === "viewer";

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 flex flex-col w-56"
      style={{
        backgroundColor: "#0a0f0d",
        borderRight:     "1px solid rgba(16,185,129,0.10)",
      }}
    >
      {/* Logo + portal label */}
      <div
        className="flex flex-col gap-1 h-16 px-4 justify-center shrink-0"
        style={{ borderBottom: "1px solid rgba(16,185,129,0.10)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
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
        <span className="text-[9px] uppercase tracking-widest pl-[2.625rem]" style={{ color: "#34d399" }}>
          Property Management
        </span>
      </div>

      <nav className="flex-1 px-2 py-4 overflow-y-auto">
        <p
          className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "rgba(255,255,255,0.22)" }}
        >
          Меню
        </p>
        <div className="space-y-0.5">
          {PM_NAV.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>

        {canSwitchToSales && (
          <>
            <p
              className="px-3 pt-6 pb-3 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.22)" }}
            >
              Переключиться
            </p>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150"
              style={{ color: "rgba(255,255,255,0.45)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.04)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = "transparent")}
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
              Перейти к Sales
            </Link>
          </>
        )}
      </nav>

      <div
        className="px-3 py-4 shrink-0 space-y-2"
        style={{ borderTop: "1px solid rgba(16,185,129,0.10)" }}
      >
        {userEmail && (
          <div
            className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.03)" }}
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #10b981, #14b8a6)" }}
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

        {pmRole && (
          <div className="px-1">
            <span
              className="inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#34d399" }}
            >
              {pmRole === "property_manager" ? "Property Manager" : pmRole}
            </span>
          </div>
        )}

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-all duration-150 hover:bg-white/5"
          style={{ color: "rgba(255,255,255,0.32)" }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
