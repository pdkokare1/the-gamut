import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Header */}
      <Header />

      {/* Main Content Area */}
      <main className="flex-1 container px-4 py-4 pb-24 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav (Visible only on small screens typically, but we keep it generic for now) */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
