import { Link } from "react-router-dom";
import { UserCircle } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <Link to="/" className="flex items-center space-x-2 font-bold text-xl">
          <span>The Gamut</span>
        </Link>
        
        <nav className="flex items-center gap-4">
          <Link to="/profile">
            <UserCircle className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
