# PropTech UZ

AI-Powered Real Estate Sales Platform for Uzbekistan

## Live Demo

https://proptech-uz.vercel.app

## Tech Stack

- **Next.js 14** + TypeScript
- **Supabase** (PostgreSQL + Auth + RLS)
- **Anthropic Claude API** (AI insights & email)
- **Tailwind CSS** (dark theme)
- **Recharts** (analytics charts)
- **Vercel** (deployment)

## Run with Docker

```bash
cp .env.example .env.local
# fill in your keys
docker-compose up --build
```

## Run locally

```bash
npm install
cp .env.example .env.local
# fill in your keys
npm run dev
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=
```

## Features

- **Role-based CRM** — Admin / Sales Manager / Viewer
- **AI Sales Insights** — Claude analyses real sales data
- **Visual Floor Plan** — interactive apartment grid per floor
- **Bulk Apartment Generator** — create 100s of units in one click
- **Client Pipeline** — New → Contacted → Viewing → Reserved → Bought
- **AI Email Generator** — personalised outreach per client
- **Instalment Calculator** — monthly payment schedule with interest
- **Notification Bell** — live feed of recent client activity
- **Project & Building Management** — full CRUD with edit/delete
- **Link Apartments to Clients** — track who owns what

## Database Schema

```
projects → buildings → apartments → clients
user_profiles (role: admin | manager | viewer)
```

## Roles

| Feature        | Admin | Manager  | Viewer |
|----------------|-------|----------|--------|
| Dashboard      | ✓     | ✓        | ✓      |
| All Clients    | ✓     | own only | —      |
| Projects       | ✓     | read     | —      |
| Apartments     | ✓     | ✓        | —      |
| Calculator     | ✓     | ✓        | ✓      |
| Users          | ✓     | —        | —      |
| AI Insights    | ✓     | —        | —      |
