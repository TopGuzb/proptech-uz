// ─────────────────────────────────────────────────────────────────────────────
// app/pricing/page.tsx
//
// Route:  /pricing   (visible from sidebar — added in commit 2bcc698)
//
// Static marketing-style pricing page. No Supabase calls, no API calls.
//
// Layout:
//   • Hero header
//   • Monthly / Annual toggle (annual = ~20% off)
//   • Three plan cards — Starter, Pro (highlighted), Enterprise
//     Each card lists features with check icons.
//   • FAQ accordion at the bottom (chevron toggles open/close).
//
// Buttons here are decorative for now — a real billing flow is not wired up.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { Check, Zap, Building2, Globe, ChevronDown, ChevronUp } from "lucide-react";

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS = [
  {
    key:       "starter",
    name:      "Starter",
    monthly:   49,
    annual:    39,
    icon:      Zap,
    iconColor: "#10b981",
    iconBg:    "rgba(16,185,129,0.12)",
    popular:   false,
    features: [
      "Up to 3 users",
      "CRM + Visual Floor Plan",
      "AI Sales Insights",
      "Basic Analytics",
      "Bulk Apartment Generator",
      "Email support",
    ],
    cta:      "Current Plan",
    ctaStyle: "muted",
  },
  {
    key:       "professional",
    name:      "Professional",
    monthly:   99,
    annual:    79,
    icon:      Building2,
    iconColor: "#6366f1",
    iconBg:    "rgba(99,102,241,0.15)",
    popular:   true,
    features: [
      "Up to 10 users",
      "Everything in Starter",
      "AI Contract PDF generation",
      "Excel Import / Export",
      "Telegram notifications",
      "Bulk Generator (unlimited)",
      "Priority email support",
    ],
    cta:      "Upgrade Now",
    ctaStyle: "gradient",
  },
  {
    key:       "enterprise",
    name:      "Enterprise",
    monthly:   199,
    annual:    159,
    icon:      Globe,
    iconColor: "#f59e0b",
    iconBg:    "rgba(245,158,11,0.12)",
    popular:   false,
    features: [
      "Unlimited users",
      "Everything in Professional",
      "Multi-tenancy",
      "Custom domain + branding",
      "SLA guarantee (99.9% uptime)",
      "Dedicated account manager",
      "On-premise deployment option",
    ],
    cta:      "Contact Us",
    ctaStyle: "outline",
  },
] as const;

const FAQS = [
  {
    q: "Can I change plans at any time?",
    a: "Yes. You can upgrade or downgrade your plan at any time. Changes take effect at the start of the next billing cycle.",
  },
  {
    q: "Is there a free trial?",
    a: "All plans include a 14-day free trial with full access to all features. No credit card required to start.",
  },
  {
    q: "How does the AI usage work?",
    a: "AI Insights and AI Email Generator are included in all plans. Usage is powered by the Anthropic Claude API and billed per request on Professional and Enterprise plans beyond the monthly quota.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards (Visa, Mastercard), bank transfer, and Payme / Click for Uzbekistan-based customers.",
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PricingPage() {
  const [annual,  setAnnual]  = useState(false);
  const [toast,   setToast]   = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function showToast() {
    setToast(true);
    setTimeout(() => setToast(false), 2800);
  }

  return (
    <AppShell>
      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full text-sm font-medium shadow-2xl pointer-events-none"
          style={{
            backgroundColor: "#1e1b4b",
            border:          "1px solid #4338ca",
            color:           "#a5b4fc",
          }}
        >
          🚀 Coming soon — we&apos;ll notify you!
        </div>
      )}

      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-14 border-b shrink-0"
        style={{ backgroundColor: "#0d1117", borderColor: "rgba(255,255,255,0.06)" }}
      >
        <div>
          <h1
            className="text-sm font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pricing
          </h1>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Choose the plan that fits your team
          </p>
        </div>
      </header>

      <main className="px-6 py-12 max-w-5xl mx-auto w-full">

        {/* ── Hero text ── */}
        <div className="text-center mb-10">
          <h2
            className="text-4xl text-white mb-3"
            style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
          >
            Simple, transparent pricing
          </h2>
          <p className="text-base" style={{ color: "rgba(255,255,255,0.45)" }}>
            All plans include a 14-day free trial. No credit card required.
          </p>

          {/* Annual / Monthly toggle */}
          <div className="flex items-center justify-center gap-3 mt-6">
            <span className="text-sm font-medium" style={{ color: annual ? "rgba(255,255,255,0.38)" : "white" }}>
              Monthly
            </span>
            <button
              onClick={() => setAnnual((v) => !v)}
              className="relative w-12 h-6 rounded-full transition-colors duration-200"
              style={{ backgroundColor: annual ? "#6366f1" : "rgba(255,255,255,0.1)" }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200"
                style={{ transform: annual ? "translateX(26px)" : "translateX(2px)" }}
              />
            </button>
            <span className="text-sm font-medium" style={{ color: annual ? "white" : "rgba(255,255,255,0.38)" }}>
              Annual
            </span>
            {annual && (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#10b981" }}
              >
                Save 20%
              </span>
            )}
          </div>
        </div>

        {/* ── Plan cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan) => {
            const Icon  = plan.icon;
            const price = annual ? plan.annual : plan.monthly;

            return (
              <div
                key={plan.key}
                className="relative rounded-2xl p-6 flex flex-col"
                style={{
                  backgroundColor: plan.popular ? "rgba(99,102,241,0.06)" : "#0d1117",
                  border:          plan.popular
                    ? "1px solid rgba(99,102,241,0.5)"
                    : "1px solid rgba(255,255,255,0.07)",
                  boxShadow: plan.popular ? "0 0 40px rgba(99,102,241,0.12)" : "none",
                }}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span
                      className="px-4 py-1 rounded-full text-xs font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    >
                      ⭐ Most Popular
                    </span>
                  </div>
                )}

                {/* Icon + name */}
                <div className="flex items-center gap-3 mb-5">
                  <div
                    className="flex items-center justify-center w-10 h-10 rounded-xl"
                    style={{ backgroundColor: plan.iconBg }}
                  >
                    <Icon className="w-5 h-5" style={{ color: plan.iconColor }} />
                  </div>
                  <h3
                    className="text-base text-white"
                    style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                  >
                    {plan.name}
                  </h3>
                </div>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-end gap-1">
                    <span
                      className="text-5xl text-white"
                      style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
                    >
                      ${price}
                    </span>
                    <span className="text-sm mb-2.5" style={{ color: "rgba(255,255,255,0.38)" }}>
                      /mo{annual && <span className="ml-1 text-[10px] text-emerald-400">billed annually</span>}
                    </span>
                  </div>
                  {plan.key === "enterprise" && (
                    <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                      Starting price · custom quote available
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-1 mb-7">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <div
                        className="flex items-center justify-center w-4.5 h-4.5 rounded-full shrink-0 mt-0.5"
                        style={{ backgroundColor: "rgba(16,185,129,0.15)" }}
                      >
                        <Check className="w-2.5 h-2.5" style={{ color: "#10b981" }} />
                      </div>
                      <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                {plan.ctaStyle === "gradient" && (
                  <button
                    onClick={showToast}
                    className="btn-shine w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                  >
                    {plan.cta}
                  </button>
                )}
                {plan.ctaStyle === "muted" && (
                  <button
                    disabled
                    className="w-full py-3 rounded-xl text-sm font-semibold cursor-not-allowed"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.05)",
                      color:           "rgba(255,255,255,0.3)",
                    }}
                  >
                    {plan.cta}
                  </button>
                )}
                {plan.ctaStyle === "outline" && (
                  <a
                    href="mailto:hello@proptech.uz"
                    className="block text-center w-full py-3 rounded-xl text-sm font-semibold transition-colors hover:bg-white/5"
                    style={{
                      border: "1px solid rgba(255,255,255,0.15)",
                      color:  "rgba(255,255,255,0.75)",
                    }}
                  >
                    {plan.cta}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* ── FAQ ── */}
        <div className="max-w-2xl mx-auto">
          <h3
            className="text-xl text-white text-center mb-6"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            Frequently Asked Questions
          </h3>
          <div className="space-y-2">
            {FAQS.map((faq, i) => {
              const open = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden"
                  style={{
                    border:          "1px solid rgba(255,255,255,0.07)",
                    backgroundColor: open ? "rgba(255,255,255,0.02)" : "#0d1117",
                  }}
                >
                  <button
                    className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    <span className="text-sm font-medium text-white">{faq.q}</span>
                    {open
                      ? <ChevronUp   className="w-4 h-4 shrink-0" style={{ color: "#6366f1" }} />
                      : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.3)" }} />
                    }
                  </button>
                  {open && (
                    <div className="px-5 pb-4">
                      <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom CTA ── */}
        <div
          className="mt-16 text-center rounded-2xl p-10"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))",
            border:     "1px solid rgba(99,102,241,0.2)",
          }}
        >
          <h3
            className="text-2xl text-white mb-2"
            style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
          >
            Need a custom solution?
          </h3>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
            Talk to us about multi-tenancy, white-labelling, or on-premise deployment.
          </p>
          <a
            href="mailto:hello@proptech.uz"
            className="btn-shine inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
          >
            Contact our team →
          </a>
        </div>

      </main>
    </AppShell>
  );
}
