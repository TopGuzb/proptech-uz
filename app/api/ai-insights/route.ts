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

    // Extract JSON array even if Claude adds extra text
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
