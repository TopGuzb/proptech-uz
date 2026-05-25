// Layout for the Vendor portal.
import PortalHeader from "@/components/PortalHeader";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <PortalHeader subtitle="Подрядчик" />
      <main className="px-6 py-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  );
}
