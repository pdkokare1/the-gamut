import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased font-sans selection:bg-primary/20 flex flex-col">
      {/* 1. Sticky Glass Header */}
      <Header />

      {/* 2. Main Content Area */}
      {/* - flex-1: Ensures footer stays at bottom if content is short
          - pt-4: Spacing from header
          - pb-24: EXTRA spacing at bottom for Mobile Nav (so content isn't hidden behind it)
      */}
      <main className="flex-1 container mx-auto px-4 pt-4 pb-24 md:pb-8 max-w-7xl animate-in fade-in duration-500">
        <Outlet />
      </main>

      {/* 3. Mobile Navigation (Hidden on Desktop 'md:hidden') */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}
