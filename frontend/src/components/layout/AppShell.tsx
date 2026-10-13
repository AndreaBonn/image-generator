import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";
import { EngineBanner } from "@/components/layout/EngineBanner";
import { ActiveJobsIndicator } from "@/components/layout/ActiveJobsIndicator";

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <EngineBanner />
      <NavBar status={<ActiveJobsIndicator />} />
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
