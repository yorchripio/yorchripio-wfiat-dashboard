import { Sidebar } from "@/components/layout/Sidebar";
import { TwoFactorBanner } from "@/components/layout/TwoFactorBanner";

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <div className="flex min-h-screen bg-[#FFFFFF]">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto">
        <TwoFactorBanner />
        {children}
      </main>
    </div>
  );
}
