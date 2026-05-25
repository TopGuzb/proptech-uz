// ─────────────────────────────────────────────────────────────────────────────
// middleware.ts
//
// This runs on EVERY request before any page does. Its only job is access
// control:
//   1. Public paths (/login, /_next/*, /api, favicon) → let them through.
//   2. Anyone without a "proptech-session" cookie → bounced to /login,
//      with the original URL kept as ?next=... so we can come back after.
//   3. Sales-side role gates (cookie "proptech-role"):
//        /seller/*    → managers only         (others → /dashboard)
//        /users/*     → admins only           (others → their home)
//        /dashboard*  → admins/viewers only   (managers → /seller/dashboard)
//   4. Property-management role gates (cookie "proptech-pm-role"):
//        resident          → forced into /resident/*
//        dispatcher        → forced into /dispatcher/*
//        vendor            → forced into /vendor/*
//        property_manager  → may access /dashboard and /pm/*
//
// PM roles are written by the login page from user_profiles.pm_role.
// They are independent from the sales role — a single user can be e.g.
// "admin" + "property_manager" at once.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Role   = "admin" | "manager" | "viewer";
type PMRole = "property_manager" | "dispatcher" | "vendor" | "resident";

const PUBLIC_PATHS = ["/login", "/pm/login"];

function getRole(req: NextRequest): Role | null {
  return (req.cookies.get("proptech-role")?.value as Role) ?? null;
}

function getPMRole(req: NextRequest): PMRole | null {
  const v = req.cookies.get("proptech-pm-role")?.value;
  return v ? (v as PMRole) : null;
}

/** Where should this role land by default? */
function homePath(role: Role | null): string {
  return role === "manager" ? "/seller/dashboard" : "/dashboard";
}

/** Where should this PM role land by default? */
function pmHomePath(pmRole: PMRole): string {
  switch (pmRole) {
    case "resident":         return "/resident/dashboard";
    case "dispatcher":       return "/dispatcher/dashboard";
    case "vendor":           return "/vendor/dashboard";
    case "property_manager": return "/pm/dashboard";
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Require auth session — bounce to the PM login when the unauthenticated
  // request was aimed at the PM portal so users land in the right portal.
  const session = request.cookies.get("proptech-session");
  if (!session?.value) {
    const isPM = pathname.startsWith("/pm");
    const loginUrl = new URL(isPM ? "/pm/login" : "/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role   = getRole(request);
  const pmRole = getPMRole(request);

  // ── PM-role gates (run BEFORE sales-role gates so a resident can never
  //    end up on /seller/* or /dashboard) ─────────────────────────────────
  if (pmRole === "resident" && !pathname.startsWith("/resident")) {
    return NextResponse.redirect(new URL("/resident/dashboard", request.url));
  }
  if (pmRole === "dispatcher" && !pathname.startsWith("/dispatcher")) {
    return NextResponse.redirect(new URL("/dispatcher/dashboard", request.url));
  }
  if (pmRole === "vendor" && !pathname.startsWith("/vendor")) {
    return NextResponse.redirect(new URL("/vendor/dashboard", request.url));
  }

  // /pm/* is reserved for property_manager + admin/manager (sales side)
  if (pathname.startsWith("/pm")) {
    const allowed =
      pmRole === "property_manager" || role === "admin" || role === "manager";
    if (!allowed) {
      return NextResponse.redirect(new URL(homePath(role), request.url));
    }
  }

  // Anyone without a PM role should not see the resident/dispatcher/vendor
  // portals (those are role-specific).
  if (
    !pmRole &&
    (pathname.startsWith("/resident") ||
      pathname.startsWith("/dispatcher") ||
      pathname.startsWith("/vendor"))
  ) {
    return NextResponse.redirect(new URL(homePath(role), request.url));
  }

  // ── Existing sales-role gates (unchanged) ─────────────────────────────

  // /seller/* → managers only
  if (pathname.startsWith("/seller")) {
    if (role !== "manager") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // /users/* → admins only
  if (pathname.startsWith("/users")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL(homePath(role), request.url));
    }
  }

  // /dashboard* → Sales overview. Property managers without a sales-side
  // admin/viewer role are pushed to their PM home instead.
  if (pathname.startsWith("/dashboard")) {
    if (pmRole === "property_manager" && role !== "admin" && role !== "viewer") {
      return NextResponse.redirect(new URL("/pm/dashboard", request.url));
    }
    if (role === "manager" && pmRole !== "property_manager") {
      return NextResponse.redirect(new URL("/seller/dashboard", request.url));
    }
  }

  // PM-home redirect for users who land on "/" with only a PM role
  if (pathname === "/" && pmRole) {
    return NextResponse.redirect(new URL(pmHomePath(pmRole), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
