import React from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '@/utils/trpc';
import { cn } from '@/lib/utils';

export const InFocusBar: React.FC = () => {
  const navigate = useNavigate();
  
  // OPTIMIZATION: Replaced Axios with tRPC for caching and type safety
  // This ensures the bar doesn't re-fetch on every page navigation
  const { data, isLoading } = trpc.article.getTrendingTopics.useQuery(undefined, {
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const topics = data?.topics || [];

  if (!isLoading && topics.length === 0) return null;

  return (
    // OPTIMIZATION: Tailwind replaces 'infocus-container' class
    // 'sticky top-[3.5rem]' keeps it visible below the header
    <div className="w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border sticky top-[3.5rem] z-30 flex items-center h-12 px-4 shadow-sm transition-all duration-300">
      
      {/* Label Section with "Live" Dot */}
      <div className="flex items-center gap-2 pr-4 border-r border-border mr-4 shrink-0">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/75 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
        </span>
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase font-mono">
          In Focus
        </span>
      </div>
      
      {/* Scroll Area */}
      {/* OPTIMIZATION: Native scroll snapping replaces manual 'onWheel' JS logic */}
      <div className="flex-1 flex gap-2 overflow-x-auto no-scrollbar mask-gradient items-center scroll-smooth snap-x">
        {isLoading ? (
           // Lightweight Skeleton Loader (replaces complex separate component)
           Array.from({ length: 5 }).map((_, i) => (
             <div key={i} className="h-6 w-24 rounded-full bg-muted/50 animate-pulse shrink-0" />
           ))
        ) : (
          topics.map((item: any, index: number) => (
            <button 
              key={index} 
              className={cn(
                "whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-medium transition-all snap-start",
                "bg-secondary/50 hover:bg-primary/10 hover:text-primary text-secondary-foreground border border-transparent hover:border-primary/20"
              )}
              onClick={() => navigate(`/search?q=${encodeURIComponent(item.topic)}`)}
            >
              #{item.topic}
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default InFocusBar;
