import { Link, useLocation } from 'react-router-dom';
import { Search, User, Bell, Menu } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

export function Header() {
  const location = useLocation();
  const isSearchPage = location.pathname === '/search';

  return (
    <header className="sticky top-0 z-50 w-full mb-6">
      {/* Glassmorphism Effect applied via our custom .glass utility */}
      <div className="glass px-4 h-16 flex items-center justify-between rounded-b-xl md:rounded-b-2xl mx-auto max-w-7xl md:mt-2">
        
        {/* LEFT: Branding */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground">
            <Menu className="h-5 w-5" />
          </Button>
          
          <Link to="/" className="flex items-center gap-2 group">
             {/* The Logo Symbol */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-700 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-serif font-bold text-lg">N</span>
            </div>
            {/* The Wordmark */}
            <h1 className="font-logo text-2xl font-bold tracking-tight text-foreground hidden md:block">
              Narrative<span className="text-primary">.</span>
            </h1>
          </Link>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex items-center gap-1 md:gap-2">
          
          {/* Search Toggle (Hide if already on search page) */}
          {!isSearchPage && (
            <Link to="/search">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary transition-colors">
                <Search className="h-5 w-5" />
              </Button>
            </Link>
          )}

          {/* Notifications */}
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary transition-colors">
            <Bell className="h-5 w-5" />
          </Button>

          {/* Profile Link */}
          <Link to="/profile">
            <Button variant="ghost" size="icon" className="relative group">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center border border-border group-hover:border-primary transition-colors">
                <User className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              </div>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
