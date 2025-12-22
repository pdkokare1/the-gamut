import { Link, useLocation } from 'react-router-dom';
import { Home, Compass, Radio, User, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const location = useLocation();

  const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Explore', icon: Compass, path: '/explore' },
    { label: 'Search', icon: Search, path: '/search' },
    { label: 'Listen', icon: Radio, path: '/listen' },
    { label: 'Profile', icon: User, path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50">
      {/* Glass Panel 
          - shadow-[...] adds a subtle lift effect 
          - pb-6 handles iPhone safe area
      */}
      <div className="glass rounded-t-2xl px-6 pb-6 pt-4 flex justify-between items-center shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 transition-all duration-300 relative group",
                isActive ? "text-primary -translate-y-1" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {/* Active Indicator Dot (Subtle glow behind icon) */}
              {isActive && (
                 <span className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-8 bg-primary/20 blur-xl rounded-full" />
              )}

              {/* Icon Container */}
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-300",
                isActive ? "bg-primary/10" : "bg-transparent group-hover:bg-secondary"
              )}>
                <Icon className={cn("h-5 w-5", isActive && "fill-current")} />
              </div>
              
              <span className="text-[10px] font-medium tracking-wide">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
