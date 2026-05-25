// ─────────────────────────────────────────────────────────────────────────────
// app/pm/login/page.tsx
//
// Route: /pm/login (public — middleware lets it through)
//
// Dedicated login page for the Property Management portal. Visually distinct
// from the Sales /login (teal/emerald accent vs indigo/purple) so users can
// instantly tell "this is the other portal". After successful auth we read
// pm_role from user_profiles and route the user to their PM home. Users
// without any pm_role get a hard error — they belong on the Sales /login.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BRAND } from "@/lib/branding";
import { Wrench, Eye, EyeOff, Loader2 } from "lucide-react";

type PMRole = "property_manager" | "dispatcher" | "vendor" | "resident";

function pmHome(pmRole: PMRole): string {
  switch (pmRole) {
    case "property_manager": return "/pm/dashboard";
    case "dispatcher":       return "/dispatcher/dashboard";
    case "vendor":           return "/vendor/dashboard";
    case "resident":         return "/resident/dashboard";
  }
}

export default function PMLoginPage() {
  const router = useRouter();
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) { setError(authError.message); return; }
      if (!data.session) { setError("Не удалось создать сессию."); return; }

      const week = 60 * 60 * 24 * 7;
      document.cookie = `proptech-session=${data.session.access_token}; path=/; max-age=${week}; SameSite=Lax`;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, pm_role")
        .eq("id", data.user.id)
        .single();

      const role   = (profile?.role    as string)              ?? "manager";
      const pmRole = (profile?.pm_role as PMRole | null)       ?? null;

      if (!pmRole) {
        // Clean up so the user doesn't get stuck in a half-logged-in state
        await supabase.auth.signOut();
        document.cookie = "proptech-session=; path=/; max-age=0";
        document.cookie = "proptech-role=;    path=/; max-age=0";
        document.cookie = "proptech-pm-role=; path=/; max-age=0";
        setError("Этот аккаунт не имеет доступа к PM Portal. Войдите через Sales-логин.");
        return;
      }

      document.cookie = `proptech-role=${role};       path=/; max-age=${week}; SameSite=Lax`;
      document.cookie = `proptech-pm-role=${pmRole}; path=/; max-age=${week}; SameSite=Lax`;

      router.push(pmHome(pmRole));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
      style={{ backgroundColor: "#050a0d" }}
    >
      {/* Animated gradient orbs — emerald/teal palette */}
      <div
        className="orb-1 absolute -top-48 -left-48 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, #10b981 0%, transparent 70%)" }}
      />
      <div
        className="orb-2 absolute -bottom-48 -right-32 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, #14b8a6 0%, transparent 70%)" }}
      />
      <div
        className="orb-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, #059669 0%, transparent 70%)" }}
      />

      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-8"
        style={{
          background:           "rgba(8,12,16,0.85)",
          border:               "1px solid rgba(16,185,129,0.18)",
          backdropFilter:       "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)",
              boxShadow:  "0 0 40px rgba(16,185,129,0.4)",
            }}
          >
            <Wrench className="w-7 h-7 text-white" />
          </div>
          <h1
            className="text-2xl text-white"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            {BRAND.name}
          </h1>
          <p className="text-xs mt-1.5 uppercase tracking-widest" style={{ color: "#34d399" }}>
            Property Management Portal
          </p>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.38)" }}>
            Управление недвижимостью
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@property.uz"
              className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 transition-all"
              style={{
                backgroundColor: "rgba(255,255,255,0.04)",
                border:          "1px solid rgba(255,255,255,0.08)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
              Пароль
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl px-4 py-3 pr-11 text-sm text-white outline-none placeholder:text-slate-600 transition-all"
                style={{
                  backgroundColor: "rgba(255,255,255,0.04)",
                  border:          "1px solid rgba(255,255,255,0.08)",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#10b981")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border:          "1px solid rgba(239,68,68,0.25)",
                color:           "#fca5a5",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-shine w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg, #10b981 0%, #14b8a6 100%)" }}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Входим…</>
            ) : (
              "Войти в PM Portal"
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Link
            href="/login"
            className="text-xs font-medium transition-colors hover:underline"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            Я работаю с продажами → Sales-логин
          </Link>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "rgba(255,255,255,0.18)" }}>
          © {new Date().getFullYear()} {BRAND.legalName} · Property Management
        </p>
      </div>
    </div>
  );
}
