// ─────────────────────────────────────────────────────────────────────────────
// app/dispatcher/dashboard/page.tsx
//
// Dispatcher inbox. Same RequestsDashboard component as the PM portal — the
// dispatcher's job is to triage incoming requests and assign vendors.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import RequestsDashboard from "@/components/pm/RequestsDashboard";

export default function DispatcherDashboardPage() {
  return (
    <RequestsDashboard
      title="Панель диспетчера"
      subtitle="Заявки от жильцов и распределение подрядчиков."
      accent="#6366f1"
    />
  );
}
