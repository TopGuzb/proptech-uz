// ─────────────────────────────────────────────────────────────────────────────
// app/api/ai/categorize-request/route.ts
//
// AI-powered triage. Given a free-text title + description from a resident,
// Claude returns: category, priority, short Russian summary, confidence.
// Used both at request creation (auto-fill) and inside the PM drawer
// (Apply suggestion button).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { anthropic, CLAUDE_MODEL, extractText, parseJsonLoose } from "@/lib/ai/claude";

export const runtime = "nodejs";

type Category =
  | "plumbing" | "electrical" | "heating" | "cleaning"
  | "elevator" | "appliance" | "structural" | "other";

type Priority = "low" | "medium" | "high" | "emergency";

interface AIResult {
  category:   Category;
  priority:   Priority;
  summary:    string;
  confidence: number;
}

const VALID_CATEGORIES: Category[] = [
  "plumbing","electrical","heating","cleaning",
  "elevator","appliance","structural","other",
];
const VALID_PRIORITIES: Priority[] = ["low","medium","high","emergency"];

const SYSTEM_PROMPT = `Ты — диспетчер обслуживания жилого комплекса в Узбекистане.
Анализируешь заявки от жильцов на русском или узбекском языке и возвращаешь
СТРОГО JSON без пояснений и без markdown:
{
  "category": одна из ["plumbing","electrical","heating","cleaning","elevator","appliance","structural","other"],
  "priority": одна из ["low","medium","high","emergency"],
  "summary": краткое описание для диспетчера на русском, 1 предложение, до 120 символов,
  "confidence": число от 0 до 1
}

Категории:
- plumbing — сантехника, протечки, краны, трубы, канализация
- electrical — электрика, розетки, лампы, проводка, щиток
- heating — отопление, радиаторы, бойлер
- cleaning — уборка подъезда, мусор, ХВС подвала
- elevator — лифт
- appliance — встроенная техника (плита, посудомойка, холодильник)
- structural — двери, окна, стены, потолок, газ, пожарная безопасность
- other — всё остальное

Приоритеты:
- emergency — угроза жизни/имуществу: газ, прорыв, пожар, поражение током, лифт с человеком
- high — серьёзная неисправность без угрозы жизни: нет тепла зимой, нет воды, лифт стоит
- medium — некритично, но мешает: капает кран, не работает розетка, шумит вентиляция
- low — косметика и плановые работы: лампочка, царапина, плановая замена фильтра`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as
      | { title?: string; description?: string; photos?: string[] }
      | null;

    if (!body || typeof body.title !== "string" || typeof body.description !== "string") {
      return NextResponse.json(
        { error: "title и description обязательны" },
        { status: 400 },
      );
    }

    const userText = `Заголовок: ${body.title.trim()}
Описание: ${body.description.trim()}`.trim();

    const message = await anthropic.messages.create({
      model:      CLAUDE_MODEL,
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    });

    const raw    = extractText(message);
    const parsed = parseJsonLoose<Partial<AIResult>>(raw);

    if (!parsed) {
      return NextResponse.json(
        { error: "AI вернул невалидный ответ", raw },
        { status: 502 },
      );
    }

    const category: Category =
      VALID_CATEGORIES.includes(parsed.category as Category)
        ? (parsed.category as Category)
        : "other";

    const priority: Priority =
      VALID_PRIORITIES.includes(parsed.priority as Priority)
        ? (parsed.priority as Priority)
        : "medium";

    const summary    = typeof parsed.summary === "string" ? parsed.summary.slice(0, 200) : "";
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    const result: AIResult = { category, priority, summary, confidence };
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI сервис недоступен";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
