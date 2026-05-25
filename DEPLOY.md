# PropTech UZ — деплой на Vercel

## Что делает MVP

Полнофункциональная SaaS-платформа управления недвижимостью с пятью порталами:

| Портал                | URL                  | Кто видит                     |
| --------------------- | -------------------- | ----------------------------- |
| Sales (CRM застройщика) | `/dashboard`        | admin / manager / viewer      |
| Property Manager      | `/pm/*`              | property_manager + admin/mgr  |
| Диспетчер             | `/dispatcher/*`      | dispatcher                    |
| Подрядчик             | `/vendor/*`          | vendor                        |
| Жилец                 | `/resident/*`        | resident                      |

Все вкладки PM-портала рабочие end-to-end:
- **Обзор** — метрики по заявкам/счетам
- **Жильцы** — реестр жильцов с импортом
- **Заявки** — AI-категоризация + назначение подрядчиков + Vision OCR фото счётчиков
- **Подрядчики** — рейтинги, специализации, история работ
- **Счётчики** — показания + анализ потребления + AI-сканирование квитанций
- **Счета** — генерация (тариф × потребление + PM-fee) + PDF
- **Голосования** — ОСС-стиль с кворумом, голосует одна квартира — один голос
- **Инвентарь** — оборудование (лифты, насосы, котлы) с графиком ТО
- **Общее имущество** — подъезды, парковки, площадки с инспекциями

---

## Переменные окружения

Добавить в **Vercel → Settings → Environment Variables** (для всех окружений):

```
NEXT_PUBLIC_SUPABASE_URL          = https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = <anon key из Supabase>
SUPABASE_SERVICE_ROLE_KEY         = <service role key — Secret>
ANTHROPIC_API_KEY                 = sk-ant-...
```

Все четыре **обязательны**. Без `SUPABASE_SERVICE_ROLE_KEY` API-роуты упадут на RLS, без `ANTHROPIC_API_KEY` упадут AI-фичи.

---

## Шаги деплоя

### 1. Применить миграции в Supabase

Через SQL Editor применить по порядку:
1. `supabase/migrations/20260429000001_pm_foundation.sql` — базовые PM-таблицы (vendors, residents, requests, meters, invoices)
2. `supabase/migrations/20260429000002_pm_rls_policies.sql` — RLS политики
3. `supabase/migrations/20260501000001_polls_inventory.sql` — Sprint 6 (polls + pm_assets)
4. (если есть последующие)

### 2. Заполнить базу демо-данными

Локально, с настроенным `.env.local`:
```bash
npx tsx scripts/seed-pm-data.ts        # резиденты, заявки, счетчики, инвойсы
npx tsx scripts/seed-sprint6.ts        # подрядчики + голосования + инвентарь
npx tsx scripts/seed-demo-users.ts     # 4 демо-аккаунта в Auth + линковка
```

> Порядок важен: `seed-demo-users.ts` цепляет vendor@/resident@ к уже существующим записям, поэтому сначала PM-данные, потом юзеры.

### 3. Подключить репозиторий к Vercel

```
vercel              # из корня проекта
```
или через UI: **New Project → Import Git Repository → выбрать proptech-uz**.

Vercel сам определит Next.js 16 + Turbopack. Build command по умолчанию `next build`, output — `.next`.

### 4. Прописать env vars (см. выше) и нажать Deploy

Билд занимает ~30 сек. После деплоя:
- открыть production URL
- зайти как `pm@test.uz` (или твой PM-аккаунт)
- проверить что все вкладки в сайдбаре открываются с данными

---

## Тестовые аккаунты

Создаются автоматически скриптом `seed-demo-users.ts`. Все пароли — `demo1234`.

| Роль              | Email             | Пароль    | Что показывает                              |
| ----------------- | ----------------- | --------- | ------------------------------------------- |
| Property Manager  | pm@test.uz        | demo1234  | весь PM-портал                              |
| Диспетчер         | disp@test.uz      | demo1234  | очередь заявок, назначение подрядчиков     |
| Подрядчик         | vendor@test.uz    | demo1234  | свои заявки + статусы (линкуется к vendor) |
| Жилец             | resident@test.uz  | demo1234  | подача заявки, голосования, счета          |

Логин — на `/pm/login`. После входа middleware сам кидает каждого в его портал.

---

## Известные деплой-замечания

- **`middleware.ts`** даёт варнинг "use proxy instead" в Next 16. Работает, переименовывать не нужно для MVP.
- **`useSearchParams`** уже обёрнут в Suspense на `/resident/requests`.
- **`lib/ai/claude.ts`** инициализирует Anthropic-клиента лениво — билд не падает при отсутствии ключа на момент сборки.
- Service-role ключ используется в API-роутах (`app/api/pm/*`) — никогда не уходит в браузер.

---

## Команды разработки

```bash
npm install
npm run dev           # localhost:3000
npm run build         # проверить production-сборку
npx tsc --noEmit      # проверить типы
```
