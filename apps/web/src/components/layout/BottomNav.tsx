import { Home, Search, Bookmark, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

export function BottomNav() {
  const location = useLocation();

  const NavItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname === to;
    return (
      <Link to={to} className={cn("flex flex-col items-center justify-center w-full h-full space-y-1", isActive ? "text-primary" : "text-muted-foreground")}>
        <Icon className="h-5 w-5" />
        <span className="text-[10px] font-medium">{label}</span>
      </Link>
    );
  };

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-background border-t pb-safe">
      <div className="flex items-center justify-around h-full">
        <NavItem to="/" icon={Home} label="Feed" />
        <NavItem to="/search" icon={Search} label="Search" />
        <NavItem to="/saved" icon={Bookmark} label="Saved" />
        <NavItem to="/profile" icon={User} label="Profile" />
      </div>
    </div>
  );
}
