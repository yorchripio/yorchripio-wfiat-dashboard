import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <div className="flex min-h-screen bg-[#FFFFFF]">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto">{children}</main>
    </div>
  );
}
