// ─────────────────────────────────────────────────────────────────────────────
// app/api/ai/scan-utility-bill/route.ts
//
// Vision OCR for utility meter readings / bills.
// Accepts { photo_url, meter_type? } and asks Claude (vision-enabled Sonnet)
// to extract: meter type, current reading, units, billing period (if shown),
// total amount (if shown), and a confidence score.
//
// We pass the photo as a `url` source — Anthropic's vision API will fetch and
// downscale it server-side.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, extractText, parseJsonLoose } from "@/lib/ai/claude";

export const runtime = "nodejs";

type MeterType = "electricity" | "gas" | "water_cold" | "water_hot" | "heating";

interface ScanResult {
  meter_type:    MeterType | null;
  reading_value: number    | null;
  unit:          string    | null;
  period_start:  string    | null;   // YYYY-MM-DD
  period_end:    string    | null;
  total_amount:  number    | null;   // UZS
  confidence:    number;             // 0..1
  notes:         string;             // human-readable
}

const VALID_TYPES: MeterType[] = ["electricity","gas","water_cold","water_hot","heating"];

const SYSTEM_PROMPT = `Ты — OCR-помощник для счётчиков и квитанций ЖКХ в Узбекистане.
Анализируешь фото счётчика или платёжки и возвращаешь СТРОГО JSON без markdown:
{
  "meter_type": одна из ["electricity","gas","water_cold","water_hot","heating"] или null,
  "reading_value": текущее показание счётчика (число) или null,
  "unit": единица измерения ("кВт·ч", "м³", "Гкал" и т.п.) или null,
  "period_start": "YYYY-MM-DD" или null,
  "period_end": "YYYY-MM-DD" или null,
  "total_amount": сумма к оплате в сумах (число без валюты) или null,
  "confidence": 0..1,
  "notes": краткое примечание на русском (1 предложение)
}

Если изображение не похоже на счётчик/платёжку — поставь confidence < 0.3 и поясни в notes.
Никогда не выдумывай числа: если не уверен в показании — null.`;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { photo_url?: string; meter_type?: MeterType }
      | null;

    if (!body?.photo_url || typeof body.photo_url !== "string") {
      return NextResponse.json({ error: "photo_url обязателен" }, { status: 400 });
    }

    const hint = body.meter_type && VALID_TYPES.includes(body.meter_type)
      ? `Подсказка: тип счётчика, скорее всего, "${body.meter_type}".`
      : "";

    const message = await anthropic.messages.create({
      model:      CLAUDE_MODEL,
      max_tokens: 800,
      system:     SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "url", url: body.photo_url },
            },
            {
              type: "text",
              text: `Извлеки данные счётчика/квитанции с фото. ${hint}`.trim(),
            },
          ],
        },
      ],
    });

    const raw    = extractText(message);
    const parsed = parseJsonLoose<Partial<ScanResult>>(raw);

    if (!parsed) {
      return NextResponse.json(
        { error: "AI вернул невалидный ответ", raw },
        { status: 502 },
      );
    }

    const result: ScanResult = {
      meter_type:
        VALID_TYPES.includes(parsed.meter_type as MeterType)
          ? (parsed.meter_type as MeterType)
          : null,
      reading_value: typeof parsed.reading_value === "number" ? parsed.reading_value : null,
      unit:          typeof parsed.unit === "string"          ? parsed.unit          : null,
      period_start:  typeof parsed.period_start === "string"  ? parsed.period_start  : null,
      period_end:    typeof parsed.period_end === "string"    ? parsed.period_end    : null,
      total_amount:  typeof parsed.total_amount === "number"  ? parsed.total_amount  : null,
      confidence:    typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
      notes:         typeof parsed.notes === "string" ? parsed.notes.slice(0, 300) : "",
    };

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI Vision недоступен";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
