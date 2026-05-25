// ─────────────────────────────────────────────────────────────────────────────
// lib/supabase.ts
//
// Single shared Supabase client used everywhere in the app (pages, components,
// API routes). Reads the project URL + anon key from .env.local, so make sure
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
//
// Import like this:   import { supabase } from "@/lib/supabase"
// Then use:           await supabase.from("clients").select("*")
//
// All Row Level Security (RLS) rules live in Supabase itself — this client
// only carries the public anon key, so nothing sensitive lives here.
//
// Supabase was chosen over a hand-rolled Postgres + Express stack because it
// gives us three things out of the box that would otherwise be substantial
// engineering work:
//   1. JWT-based auth with email/password
//   2. Row Level Security for multi-tenant isolation
//   3. Real-time subscriptions over WebSockets
// Underneath it's still plain Postgres, so we keep relational integrity
// (foreign keys, CASCADE) — important for the 5-level property hierarchy
// Company → Project → Building → Floor → Apartment.
//
// Exporting a single shared instance avoids opening a new connection per
// component and keeps auth state consistent across the whole app.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)
