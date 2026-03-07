"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";

type Role = "admin" | "manager" | "viewer";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "admin", label: "Admin", description: "Full access" },
  { value: "manager", label: "Manager", description: "Manage projects & sales" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.session) {
        // Store session token in cookie for middleware access
        document.cookie = `proptech-session=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        // Store selected role
        document.cookie = `proptech-role=${role}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        router.push("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#080b14" }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        aria-hidden
      >
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: "#6366f1" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: "#6366f1" }}
        />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: "#6366f1" }}
          >
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            PropTech CRM
          </h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Real estate platform for Uzbekistan
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8"
          style={{
            backgroundColor: "#0d1117",
            borderColor: "#1e2536",
          }}
        >
          <h2 className="text-lg font-semibold text-white mb-6">
            Sign in to your account
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#94a3b8" }}
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.uz"
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:ring-2"
                style={{
                  backgroundColor: "#080b14",
                  border: "1px solid #1e2536",
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = "#6366f1")
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "#1e2536")
                }
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "#94a3b8" }}
              >
                Password
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
                  className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:ring-2"
                  style={{
                    backgroundColor: "#080b14",
                    border: "1px solid #1e2536",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "#6366f1")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "#1e2536")
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: "#475569" }}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Role selector */}
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "#94a3b8" }}
              >
                Access role
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className="flex flex-col items-center gap-0.5 rounded-lg px-3 py-2.5 text-sm transition-all border"
                    style={{
                      backgroundColor:
                        role === r.value ? "#1e1b4b" : "#080b14",
                      borderColor:
                        role === r.value ? "#6366f1" : "#1e2536",
                      color: role === r.value ? "#a5b4fc" : "#64748b",
                    }}
                  >
                    <span className="font-medium text-xs">{r.label}</span>
                    <span className="text-xs opacity-70">{r.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="rounded-lg px-4 py-3 text-sm"
                style={{
                  backgroundColor: "#1f0a0a",
                  borderColor: "#7f1d1d",
                  border: "1px solid",
                  color: "#fca5a5",
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: "#6366f1" }}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "#334155" }}>
          © {new Date().getFullYear()} PropTech UZ. All rights reserved.
        </p>
      </div>
    </div>
  );
}
