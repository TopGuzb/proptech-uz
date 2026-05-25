// ─────────────────────────────────────────────────────────────────────────────
// app/pm/requests/page.tsx
//
// Property Management — central inbox for maintenance requests. Reuses
// <RequestsDashboard> with PM accent (emerald).
// ─────────────────────────────────────────────────────────────────────────────

import RequestsDashboard from "@/components/pm/RequestsDashboard";

export default function PMRequestsPage() {
  return (
    <RequestsDashboard
      title="Заявки на обслуживание"
      subtitle="Все заявки от жильцов — назначайте подрядчиков и следите за SLA."
      accent="#34d399"
    />
  );
}
