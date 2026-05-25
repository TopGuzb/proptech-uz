// ─────────────────────────────────────────────────────────────────────────────
// app/api/ai-insights/route.ts
//
// Endpoint:  GET /api/ai-insights
// Called by: app/dashboard/page.tsx  (the "Analyse with AI" button)
//
// Three steps:
//   1. Pull every apartment's status + price from Supabase and crunch totals
//      (sold, reserved, available, revenue, conversion %, avg sale price).
//   2. Build a Russian prompt and ask Claude (Sonnet) for EXACTLY 3 insights
//      as a plain JSON array — no markdown, no extra text.
//   3. Pull the JSON array out of Claude's reply and return  { insights: [...] }
//
// If Claude wraps its answer in extra prose, the regex on `jsonMatch` rescues
// the array. Anything else 500s with a useful message.
// Requires env var: ANTHROPIC_API_KEY.
//
// Why claude-sonnet-4-0 specifically:
//   - Russian-language quality is noticeably better than Haiku for nuanced
//     business phrasing (sales insights need to read naturally, not literally
//     translated).
//   - Reliable structured JSON output — Sonnet rarely deviates from the
//     "return only a JSON array" instruction.
//   - Cost-per-call is low enough to be sustainable; Opus would be overkill
//     for a 3-bullet summary task.
//
// Why we compute the metrics in code, not let Claude do the maths:
//   LLMs are unreliable at arithmetic on long lists. Doing the totals in JS
//   gives Claude clean, trustworthy numbers to reason about — its job is the
//   commentary, not the calculation.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export async function GET() {
  try {
    // ── 1. Fetch real data from Supabase ───────────────────────────────────
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: apartments, error: dbError } = await supabase
      .from("apartments")
      .select("status, price");

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const apts = apartments ?? [];
    const total     = apts.length;
    const sold      = apts.filter((a) => a.status === "sold").length;
    const reserved  = apts.filter((a) => a.status === "reserved").length;
    const available = apts.filter((a) => a.status === "available").length;
    const revenue   = apts
      .filter((a) => a.status === "sold")
      .reduce((sum, a) => sum + (a.price ?? 0), 0);
    const conversionRate =
      total > 0 ? ((sold / total) * 100).toFixed(1) : "0.0";
    const avgSalePrice =
      sold > 0 ? Math.round(revenue / sold).toLocaleString() : "N/A";

    // ── 2. Call Claude ─────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-0",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Ты аналитик рынка недвижимости в Узбекистане. На основе данных о продажах дай ровно 3 конкретных и полезных инсайта на русском языке.

Данные:
- Всего квартир: ${total}
- Продано: ${sold} (${conversionRate}% конверсия)
- Зарезервировано: ${reserved}
- Доступно для продажи: ${available}
- Общая выручка: $${revenue.toLocaleString()}
- Средняя цена продажи: $${avgSalePrice}

Верни ТОЛЬКО корректный JSON-массив из ровно 3 строк, без пояснений, без markdown:
["инсайт 1", "инсайт 2", "инсайт 3"]`,
        },
      ],
    });

    // ── 3. Parse response ──────────────────────────────────────────────────
    const textBlock = message.content.find((b) => b.type === "text");
    const rawText   = textBlock?.type === "text" ? textBlock.text.trim() : "";

    // Defensive parsing — even with explicit "no markdown" instructions Claude
    // occasionally wraps the JSON in prose like "Sure, here are the insights:
    // [...]". The non-greedy [\s\S]*? grabs the first [...] block regardless.
    const jsonMatch = rawText.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Could not parse AI response", raw: rawText },
        { status: 500 }
      );
    }

    const insights: string[] = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ insights });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
