import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary/20">
      {/* 1. Sticky Glass Header */}
      <Header />

      {/* 2. Main Content Area */}
      {/* We add padding-top to account for the fixed header and padding-bottom for the mobile nav */}
      <main className="container mx-auto px-4 pt-4 pb-24 md:pb-8 max-w-7xl animate-in fade-in duration-500">
        <Outlet />
      </main>

      {/* 3. Mobile Navigation (Hidden on Desktop) */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
