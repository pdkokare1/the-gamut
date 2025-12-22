import { NewsFeed } from '../components/NewsFeed';
import { Button } from '../components/ui/button';
import { Sparkles } from 'lucide-react';

export function HomePage() {
  return (
    <div className="space-y-8">
      
      {/* 1. Hero / Welcome Section */}
      <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-logo font-bold text-foreground">
            Your Briefing
          </h2>
          <p className="text-muted-foreground mt-1">
            AI-curated insights from across the spectrum.
          </p>
        </div>
        
        {/* Quick Action */}
        <Button variant="luxury" size="sm" className="gap-2 shadow-gold/20">
          <Sparkles className="h-4 w-4" />
          Smart Summary
        </Button>
      </section>

      {/* 2. The Feed */}
      <NewsFeed />
    </div>
  );
}
