"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Building2, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
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

      if (data.session) {
        // Store session token
        document.cookie = `proptech-session=${data.session.access_token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

        // Ensure user_profiles row exists (auto-create if missing)
        const { data: existingProfile } = await supabase
          .from("user_profiles")
          .select("id, role")
          .eq("id", data.user.id)
          .single();

        if (!existingProfile) {
          await supabase.from("user_profiles").upsert({
            id:        data.user.id,
            email:     data.user.email,
            role:      "manager",
            full_name: data.user.email,
          });
        }

        const role = (existingProfile?.role as string) ?? "manager";
        document.cookie = `proptech-role=${role}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;

        router.push(role === "manager" ? "/seller/dashboard" : "/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#080b14" }}>
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: "#6366f1" }} />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{ backgroundColor: "#6366f1" }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: "#6366f1" }}>
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">PropTech CRM</h1>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Real estate platform for Uzbekistan
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border p-8"
          style={{ backgroundColor: "#0d1117", borderColor: "#1e2536" }}>
          <h2 className="text-lg font-semibold text-white mb-6">Sign in to your account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5"
                style={{ color: "#94a3b8" }}>
                Email address
              </label>
              <input id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.uz"
                className="w-full rounded-lg px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-600"
                style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5"
                style={{ color: "#94a3b8" }}>
                Password
              </label>
              <div className="relative">
                <input id="password" type={showPassword ? "text" : "password"}
                  autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-slate-600"
                  style={{ backgroundColor: "#080b14", border: "1px solid #1e2536" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6366f1")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "#1e2536")} />
                <button type="button" tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:text-white transition-colors"
                  style={{ color: "#475569" }}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg px-4 py-3 text-sm border"
                style={{ backgroundColor: "#1f0a0a", borderColor: "#7f1d1d", color: "#fca5a5" }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "#6366f1" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Signing in…</> : "Sign in"}
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
