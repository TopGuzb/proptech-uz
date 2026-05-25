// ─────────────────────────────────────────────────────────────────────────────
// app/api/ai-email/route.ts
//
// Endpoint:  POST /api/ai-email
// Called by: app/clients/[id]/page.tsx  (the "Generate AI Email" button on a
//            client's profile page)
//
// What happens:
//   1. Receive client info  (name, budget, apartment of interest, notes, status).
//   2. Stitch them into a Russian system prompt and ask Claude (Sonnet) to write
//      a polite outreach email — must come back as JSON  { subject, body }.
//   3. Strip optional ```json ... ``` fences from Claude's reply, parse, and
//      return it. Falls back to a regex grab of the first { ... } block if
//      Claude wraps the JSON in extra prose.
//
// Always responds in Russian — that's the target market language.
// Requires env var: ANTHROPIC_API_KEY.
//
// The endpoint deliberately does NOT send the email — it only generates the
// draft. The manager copies it into their own email client. Auto-send was a
// design decision against: we don't want the platform held responsible for a
// bad AI-generated message reaching a real client.
//
// Two-stage parse on the response:
//   1. Strip optional ```json ... ``` markdown fences.
//   2. JSON.parse; if that throws, regex-extract the first {...} block as a
//      last-ditch rescue. Same defensive philosophy as ai-insights.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { BRAND } from "@/lib/branding";

interface EmailRequest {
  client_name: string;
  budget: number | null;
  interested_apartment: string | null;
  notes: string | null;
  status?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as EmailRequest;
    const { client_name, budget, interested_apartment, notes, status } = body;

    if (!client_name?.trim()) {
      return NextResponse.json({ error: "client_name is required" }, { status: 400 });
    }

    // ── Build context for Claude ──────────────────────────────────────────────
    const clientContext = [
      `Имя клиента: ${client_name}`,
      budget               ? `Бюджет: $${budget.toLocaleString()}` : null,
      interested_apartment ? `Интересующая квартира: ${interested_apartment}` : null,
      status               ? `Текущий статус в CRM: ${status}` : null,
      notes                ? `Заметки менеджера: ${notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // ── Call Claude ───────────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: "claude-sonnet-4-0",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Ты менеджер по продажам недвижимости в Узбекистане. Напиши профессиональное персонализированное письмо на русском языке для клиента на основе следующих данных:

${clientContext}

Требования к письму:
- Тёплое, профессиональное приветствие с обращением по имени
- Краткое упоминание преимуществ нашей недвижимости (качество, расположение в Ташкенте, современные планировки)
- Предложение следующего шага (просмотр, встреча, звонок)
- Подпись от имени менеджера ${BRAND.name}

Верни ТОЛЬКО корректный JSON без markdown, без обёртки:
{
  "subject": "тема письма",
  "body": "тело письма"
}`,
        },
      ],
    });

    // ── Parse response ────────────────────────────────────────────────────────
    const textBlock = message.content.find((b) => b.type === "text");
    const rawText   = textBlock?.type === "text" ? textBlock.text.trim() : "";

    // Strip optional markdown code fences. Even with the "no markdown"
    // instruction in the prompt, Claude sometimes returns ```json {...} ```
    // — we'd rather rescue the JSON than fail the user.
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let result: { subject: string; body: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: try to extract JSON object
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json(
          { error: "Could not parse AI response", raw: rawText },
          { status: 500 }
        );
      }
      result = JSON.parse(jsonMatch[0]);
    }

    if (!result.subject || !result.body) {
      return NextResponse.json({ error: "Invalid AI response structure" }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
