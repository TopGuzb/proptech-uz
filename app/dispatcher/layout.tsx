// Layout for the Dispatcher portal.
import PortalHeader from "@/components/PortalHeader";

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <PortalHeader subtitle="Диспетчер" />
      <main className="px-6 py-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
