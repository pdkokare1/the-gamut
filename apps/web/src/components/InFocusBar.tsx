import React, { useRef } from 'react';
import { trpc } from '@/utils/trpc';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface InFocusBarProps {
  onTopicClick?: (topic: string) => void;
  activeTopic?: string | null;
}

const InFocusBar: React.FC<InFocusBarProps> = ({ onTopicClick, activeTopic }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Fetch Trending Topics
  const { data: topics, isLoading } = trpc.article.trending.useQuery({ limit: 15 });

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  if (!isLoading && (!topics || topics.length === 0)) return null;

  return (
    <div className="w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[56px] z-40">
      <div className="flex items-center h-12 px-4 gap-4">
        
        {/* Label */}
        <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground whitespace-nowrap">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          IN FOCUS
        </div>
        
        {/* Scroll Area */}
        <div 
            ref={scrollRef}
            onWheel={handleWheel}
            className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar mask-gradient-right"
        >
          {isLoading ? (
             Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
             ))
          ) : (
            topics?.map((item) => (
              <button 
                key={item.topic} 
                onClick={() => onTopicClick?.(item.topic)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border",
                  item.topic === activeTopic 
                    ? "bg-primary text-primary-foreground border-primary" 
                    : "bg-muted/50 hover:bg-muted text-muted-foreground border-transparent hover:border-border"
                )}
              >
                #{item.topic}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default InFocusBar;
