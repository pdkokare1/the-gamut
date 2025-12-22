import { Link } from 'react-router-dom';
import { Newspaper, Cpu, DollarSign, Globe, Stethoscope, Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { id: 'technology', label: 'Technology', icon: Cpu, color: 'from-blue-600 to-cyan-500' },
  { id: 'business', label: 'Business', icon: DollarSign, color: 'from-emerald-600 to-teal-500' },
  { id: 'politics', label: 'Politics', icon: Globe, color: 'from-purple-600 to-indigo-500' },
  { id: 'health', label: 'Health', icon: Stethoscope, color: 'from-rose-600 to-pink-500' },
  { id: 'science', label: 'Science', icon: Zap, color: 'from-amber-500 to-orange-500' },
  { id: 'general', label: 'Top Stories', icon: Newspaper, color: 'from-slate-600 to-slate-500' },
];

const TRENDING_TOPICS = [
  "Election 2024", "AI Regulation", "Space Exploration", "Climate Summit", "Crypto Markets"
];

export function ExplorePage() {
  return (
    <div className="space-y-8 fade-in pb-20">
      
      <div className="space-y-2">
        <h1 className="text-3xl font-logo font-bold">Explore</h1>
        <p className="text-muted-foreground">Discover stories by category or topic.</p>
      </div>

      {/* 1. Categories Grid */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          return (
            <Link 
              key={cat.id} 
              to={`/search?q=${cat.id}&type=category`}
              className="group relative overflow-hidden rounded-2xl aspect-[4/3] flex flex-col items-center justify-center p-4 glass-card hover:scale-[1.02] transition-all duration-300"
            >
              {/* Background Gradient */}
              <div className={cn(
                "absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity bg-gradient-to-br",
                cat.color
              )} />
              
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center mb-3 bg-gradient-to-br shadow-lg",
                cat.color
              )}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              
              <span className="font-bold text-lg">{cat.label}</span>
            </Link>
          );
        })}
      </section>

      {/* 2. Trending Narratives */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="font-bold text-xl">Trending Narratives</h2>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {TRENDING_TOPICS.map((topic, i) => (
            <Link key={i} to={`/search?q=${topic}`}>
              <div className="px-4 py-2 rounded-full glass border border-primary/20 hover:bg-primary/10 hover:border-primary transition-all cursor-pointer">
                <span className="text-sm font-medium">#{topic}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

    </div>
  );
}
