import { Outlet } from "react-router-dom";
import { NavBar } from "@/components/layout/NavBar";
import { EngineBanner } from "@/components/layout/EngineBanner";

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <EngineBanner />
      <NavBar />
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
