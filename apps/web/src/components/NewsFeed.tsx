// apps/web/src/components/NewsFeed.tsx
import React, { useState, useEffect, TouchEvent } from 'react';
import { trpc } from '../utils/trpc';
import { useAuth } from '../context/AuthContext';
import { useInView } from 'react-intersection-observer';
import { ArticleCard } from './ArticleCard';
import { LoginModal } from './modals/LoginModal';
import { NarrativeModal } from './modals/NarrativeModal';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';

type FeedTab = 'latest' | 'infocus' | 'balanced';

export default function NewsFeed() {
  const { user, isGuest } = useAuth();
  const [activeTab, setActiveTab] = useState<FeedTab>('latest');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedNarrativeId, setSelectedNarrativeId] = useState<string | null>(null);

  // --- 1. Swipe Logic (Restored) ---
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 75;

  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) { // Swiping Left -> Go Right
      if (activeTab === 'latest') handleTabChange('infocus');
      else if (activeTab === 'infocus') handleTabChange('balanced');
    }
    if (isRightSwipe) { // Swiping Right -> Go Left
      if (activeTab === 'balanced') handleTabChange('infocus');
      else if (activeTab === 'infocus') handleTabChange('latest');
    }
  };

  // --- 2. Tab Switching with Gatekeeper ---
  const handleTabChange = (tab: FeedTab) => {
    if (tab === 'balanced' && isGuest) {
      toast("Login Required", {
        description: "Balanced Feed is available for members only.",
        action: {
            label: "Login",
            onClick: () => setShowLoginModal(true)
        }
      });
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 3. Data Fetching ---
  const latestQuery = trpc.article.getFeed.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor, enabled: activeTab === 'latest' }
  );

  const balancedQuery = trpc.article.getBalancedFeed.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor, enabled: activeTab === 'balanced' && !isGuest }
  );

  const narrativeQuery = trpc.article.getInFocusFeed.useQuery(
    undefined, 
    { enabled: activeTab === 'infocus' }
  );

  // --- 4. Infinite Scroll ---
  const { ref, inView } = useInView();
  
  useEffect(() => {
    if (inView) {
      if (activeTab === 'latest' && latestQuery.hasNextPage) latestQuery.fetchNextPage();
      else if (activeTab === 'balanced' && balancedQuery.hasNextPage) balancedQuery.fetchNextPage();
    }
  }, [inView, activeTab]);

  // --- Renderer ---
  const renderContent = () => {
    const isLoading = 
      (activeTab === 'latest' && latestQuery.isLoading) ||
      (activeTab === 'infocus' && narrativeQuery.isLoading) ||
      (activeTab === 'balanced' && balancedQuery.isLoading);

    if (isLoading) {
      return <div className="space-y-4 pt-4">{/* Skeletons would go here */}</div>;
    }

    if (activeTab === 'latest') {
      return (
        <div className="space-y-4 pt-4">
          {latestQuery.data?.pages.map((page, i) => (
            <React.Fragment key={i}>
              {page.items.map((item) => (
                <ArticleCard key={item.id} article={item} />
              ))}
            </React.Fragment>
          ))}
          <div ref={ref} className="h-10" />
        </div>
      );
    }

    if (activeTab === 'infocus') {
      return (
        <div className="space-y-4 pt-4">
          {narrativeQuery.data?.map((narrative) => (
             <div key={narrative.id} onClick={() => setSelectedNarrativeId(narrative.id)} className="cursor-pointer">
                <ArticleCard 
                  article={{...narrative, source: 'Narrative', url: ''}} 
                  className="border-primary/50"
                />
             </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'balanced') {
      return (
         <div className="space-y-4 pt-4">
          {balancedQuery.data?.pages.map((page, i) => (
            <React.Fragment key={i}>
              {page.items.map((item) => (
                <ArticleCard key={item.id} article={item} />
              ))}
            </React.Fragment>
          ))}
           <div ref={ref} className="h-10" />
        </div>
      );
    }
  };

  return (
    <div 
      className="min-h-screen pb-20"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Sticky Tabs */}
      <div className="sticky top-16 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex justify-around p-2 max-w-lg mx-auto">
          {[
            { id: 'latest', label: 'Latest' },
            { id: 'infocus', label: 'Narratives' },
            { id: 'balanced', label: 'Balanced' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as FeedTab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-all duration-200",
                activeTab === tab.id 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {tab.label}
              {tab.id === 'balanced' && isGuest && <Lock className="w-3 h-3 opacity-70" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 max-w-2xl mx-auto">
        {renderContent()}
      </div>

      {/* Modals */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      {selectedNarrativeId && (
        <NarrativeModal narrativeId={selectedNarrativeId} onClose={() => setSelectedNarrativeId(null)} />
      )}
    </div>
  );
}
