import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#080b14" }}>
      <Sidebar />
      <div className="flex flex-col flex-1" style={{ marginLeft: "14rem" }}>
        {children}
      </div>
    </div>
  );
}
