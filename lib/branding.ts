// ─────────────────────────────────────────────────────────────────────────────
// lib/branding.ts
//
// Single source of truth for brand strings (logo text, tagline, full name).
// Override at deploy time per-customer with these env vars:
//
//   NEXT_PUBLIC_BRAND_NAME       — short name shown on logos / sidebar
//   NEXT_PUBLIC_BRAND_TAGLINE    — small subtitle under the logo
//   NEXT_PUBLIC_BRAND_LEGAL_NAME — full legal name used in PDFs / footers
//
// All three are optional; sensible defaults for our internal demo.
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  name:       process.env.NEXT_PUBLIC_BRAND_NAME       ?? "PropTech UZ",
  tagline:    process.env.NEXT_PUBLIC_BRAND_TAGLINE    ?? "Real Estate Suite",
  legalName:  process.env.NEXT_PUBLIC_BRAND_LEGAL_NAME ?? "PropTech UZ",
} as const;

export type Brand = typeof BRAND;
