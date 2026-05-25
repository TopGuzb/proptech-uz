// ─────────────────────────────────────────────────────────────────────────────
// lib/ai/claude.ts
//
// Shared Anthropic client + helpers for AI features (categorization,
// vision OCR, anomaly detection). Server-only — relies on ANTHROPIC_API_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";

// Lazy-init so missing env var doesn't crash the Vercel build (which evaluates
// route modules at build time without runtime secrets). The SDK is constructed
// on first use; if the key is still missing then, we surface a clear error.
let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY in environment");
  _client = new Anthropic({ apiKey });
  return _client;
}

export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export const CLAUDE_MODEL = "claude-sonnet-4-0";

/**
 * Extract the first text block from a Claude response.
 */
export function extractText(message: Anthropic.Message): string {
  const block = message.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}

/**
 * Defensive JSON parsing. Tolerates code fences, leading/trailing prose,
 * and falls back to extracting the first {…} or […] block.
 */
export function parseJsonLoose<T = unknown>(raw: string): T | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }

  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      /* fall through */
    }
  }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]) as T;
    } catch {
      return null;
    }
  }
  return null;
}
