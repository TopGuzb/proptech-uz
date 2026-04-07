import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type Role = "admin" | "manager" | "viewer";

const PUBLIC_PATHS = ["/login"];

function getRole(req: NextRequest): Role | null {
  return (req.cookies.get("proptech-role")?.value as Role) ?? null;
}

/** Where should this role land by default? */
function homePath(role: Role | null): string {
  return role === "manager" ? "/seller/dashboard" : "/dashboard";
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

  // Require auth session
  const session = request.cookies.get("proptech-session");
  if (!session?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = getRole(request);

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

  // /dashboard* → admin and viewer only (managers have /seller/dashboard)
  if (pathname.startsWith("/dashboard")) {
    if (role === "manager") {
      return NextResponse.redirect(new URL("/seller/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
