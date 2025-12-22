// apps/web/src/components/NewsFeed.tsx

import { useState, useRef, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { trpc } from '../utils/trpc';
import { useHaptic } from '../hooks/use-haptic';
import { cn } from '../lib/utils';
import { ArticleCard } from './ArticleCard'; // Ensure you have this component
import { Loader2, RefreshCcw, WifiOff } from 'lucide-react';
import { Button } from './ui/button';
import { useMediaQuery } from '../hooks/use-pwa-install'; // Assuming you have a media query hook, or use standard CSS media queries

// Types
type FeedMode = 'latest' | 'balanced' | 'foryou';

export function NewsFeed() {
  const [mode, setMode] = useState<FeedMode>('latest');
  const [isSwiping, setIsSwiping] = useState(false);
  const vibrate = useHaptic();
  
  // Swipe References
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 50;

  // --- 1. DATA FETCHING ---
  // We map the 'mode' to specific filters for the backend
  const getFilterForMode = (m: FeedMode) => {
    switch (m) {
      case 'balanced': return { sentiment: 'Neutral' as const };
      case 'foryou': return { country: 'USA' }; // Placeholder for personalization logic
      default: return {};
    }
  };

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching
  } = trpc.article.getFeed.useInfiniteQuery(
    { 
      limit: 10,
      ...getFilterForMode(mode)
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false,
      // When mode changes, we want fresh data immediately
    }
  );

  // --- 2. INFINITE SCROLL ---
  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  // --- 3. INTERACTION HANDLERS ---

  const handleModeChange = (newMode: FeedMode) => {
    if (mode === newMode) return;
    vibrate();
    setMode(newMode);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      if (mode === 'latest') handleModeChange('balanced');
      else if (mode === 'balanced') handleModeChange('foryou');
    }
    if (isRightSwipe) {
      if (mode === 'foryou') handleModeChange('balanced');
      else if (mode === 'balanced') handleModeChange('latest');
    }
  };

  // --- 4. RENDER HELPERS ---

  const articles = data?.pages.flatMap((page) => page.items) || [];

  return (
    <div 
      className="min-h-screen pb-20 touch-pan-y"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* --- NAVIGATION TABS --- */}
      <div className="sticky top-16 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b w-full mb-6">
        <div className="flex justify-center p-2">
          <div className="flex items-center bg-muted/50 p-1 rounded-full border shadow-sm">
            {[
              { id: 'latest', label: 'Latest' },
              { id: 'balanced', label: 'Balanced' },
              { id: 'foryou', label: 'For You' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleModeChange(tab.id as FeedMode)}
                className={cn(
                  "px-6 py-1.5 rounded-full text-xs font-semibold transition-all duration-300",
                  mode === tab.id
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="container max-w-2xl mx-auto px-4 space-y-6">
        
        {/* Loading State */}
        {(isLoading || isRefetching) && articles.length === 0 && (
          <div className="space-y-6 pt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <WifiOff className="h-12 w-12 text-muted-foreground opacity-20" />
            <div className="space-y-2">
              <h3 className="font-semibold">Connection Issue</h3>
              <p className="text-sm text-muted-foreground">We couldn't load the feed.</p>
            </div>
            <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-2">
              <RefreshCcw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && articles.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <p>No articles found for this section yet.</p>
          </div>
        )}

        {/* Article List */}
        <div className={cn(
            "transition-opacity duration-300",
            isRefetching ? "opacity-50" : "opacity-100"
        )}>
            {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
            ))}
        </div>

        {/* Infinite Scroll Loader */}
        <div ref={ref} className="flex justify-center py-8">
          {isFetchingNextPage ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : hasNextPage ? (
            <span className="text-xs text-muted-foreground">Scroll for more</span>
          ) : articles.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-px w-8 bg-border" />
                <span>End of Stream</span>
                <div className="h-px w-8 bg-border" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
