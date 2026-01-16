import { useState, useRef, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { trpc } from '../utils/trpc';
import { useHaptic } from '../hooks/use-haptic';
import { cn } from '../lib/utils';
import { ArticleCard } from './ArticleCard';
import { Loader2, RefreshCcw, WifiOff, Lock } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
// import { LoginModal } from './modals/LoginModal'; // Ensure this exists in your new structure

// Types
type FeedMode = 'latest' | 'infocus' | 'balanced';

export function NewsFeed() {
  const [mode, setMode] = useState<FeedMode>('latest');
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  const vibrate = useHaptic();
  const { user, isGuest } = useAuth(); // Assuming useAuth provides user/isGuest
  
  // Swipe References
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 50;

  // --- 1. DATA FETCHING ---
  const getFilterForMode = (m: FeedMode) => {
    switch (m) {
      case 'balanced': 
        // Balanced feed is handled by a separate endpoint in the Router, 
        // but if we use the unified getFeed, we might need specific params.
        // However, we added getBalancedFeed to the router.
        // We will switch the query based on mode below.
        return {}; 
      case 'infocus': 
        // 'InFocus' usually implies Narratives or specific clusters.
        // We can use a filter or a different router call.
        return { category: 'Narratives' }; 
      default: 
        return {};
    }
  };

  // We use the standard feed for Latest & InFocus
  const mainFeedQuery = trpc.article.getFeed.useInfiniteQuery(
    { 
      limit: 10,
      ...getFilterForMode(mode)
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: mode !== 'balanced', // Disable this query for balanced mode
      refetchOnWindowFocus: false,
    }
  );

  // We use the specific balanced feed endpoint for Balanced mode
  // Note: Infinite scroll might be different for Balanced if it returns a fixed set
  const balancedFeedQuery = trpc.article.getBalancedFeed.useQuery(
    { limit: 5 },
    { enabled: mode === 'balanced' }
  );

  // Normalize data access
  const articles = mode === 'balanced' 
    ? (balancedFeedQuery.data || []) 
    : (mainFeedQuery.data?.pages.flatMap((page) => page.items) || []);

  const isLoading = mode === 'balanced' ? balancedFeedQuery.isLoading : mainFeedQuery.isLoading;
  const isError = mode === 'balanced' ? balancedFeedQuery.isError : mainFeedQuery.isError;
  const isRefetching = mode === 'balanced' ? balancedFeedQuery.isRefetching : mainFeedQuery.isRefetching;
  const refetch = mode === 'balanced' ? balancedFeedQuery.refetch : mainFeedQuery.refetch;

  // --- 2. INFINITE SCROLL (Only for Main Feed) ---
  const { ref, inView } = useInView();
  useEffect(() => {
    if (inView && mode !== 'balanced' && mainFeedQuery.hasNextPage) {
      mainFeedQuery.fetchNextPage();
    }
  }, [inView, mode, mainFeedQuery]);

  // --- 3. INTERACTION HANDLERS ---

  const handleModeChange = (newMode: FeedMode) => {
    if (mode === newMode) return;
    vibrate();

    // Guest Protection for Balanced Mode
    if (newMode === 'balanced' && (!user || isGuest)) {
        setShowLoginModal(true);
        return;
    }

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
      if (mode === 'latest') handleModeChange('infocus');
      else if (mode === 'infocus') handleModeChange('balanced');
    }
    if (isRightSwipe) {
      if (mode === 'balanced') handleModeChange('infocus');
      else if (mode === 'infocus') handleModeChange('latest');
    }
  };

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
              { id: 'infocus', label: 'Narratives' }, // Restored Name
              { id: 'balanced', label: 'Balanced' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleModeChange(tab.id as FeedMode)}
                className={cn(
                  "px-6 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 flex items-center gap-1.5",
                  mode === tab.id
                    ? "bg-primary text-primary-foreground shadow-md scale-105"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                {tab.label}
                {/* Lock Icon for Guests on Balanced Tab */}
                {tab.id === 'balanced' && (!user || isGuest) && (
                    <Lock className="w-3 h-3 opacity-70" />
                )}
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

        {/* Infinite Scroll Loader (Only for Main/InFocus) */}
        {mode !== 'balanced' && (
            <div ref={ref} className="flex justify-center py-8">
            {mainFeedQuery.isFetchingNextPage ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : mainFeedQuery.hasNextPage ? (
                <span className="text-xs text-muted-foreground">Scroll for more</span>
            ) : articles.length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-px w-8 bg-border" />
                    <span>End of Stream</span>
                    <div className="h-px w-8 bg-border" />
                </div>
            ) : null}
            </div>
        )}
      </div>

      {/* Placeholder for Login Modal - You can implement or import your existing one */}
      {/* <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} /> */}
    </div>
  );
}
