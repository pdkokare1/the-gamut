import React, { useState, useEffect, TouchEvent } from 'react';
import { trpc } from '../utils/trpc';
import { useAuth } from '../context/AuthContext';
import { useInView } from 'react-intersection-observer';
import { FeedItem } from './FeedItem';
import { LoginModal } from './modals/LoginModal'; // Restored
import { NarrativeModal } from './modals/NarrativeModal'; // Restored
import { SkeletonCard } from './ui/card'; // Assuming you have a skeleton or use generic div
import { Button } from './ui/button';
import { cn } from '../lib/utils';

type FeedTab = 'latest' | 'infocus' | 'balanced';

export default function NewsFeed() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<FeedTab>('latest');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [selectedNarrativeId, setSelectedNarrativeId] = useState<string | null>(null);

  // --- 1. Swipe Logic (Restored) ---
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

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

    if (isLeftSwipe) {
      if (activeTab === 'latest') handleTabChange('infocus');
      else if (activeTab === 'infocus') handleTabChange('balanced');
    }
    if (isRightSwipe) {
      if (activeTab === 'balanced') handleTabChange('infocus');
      else if (activeTab === 'infocus') handleTabChange('latest');
    }
  };

  // --- 2. Tab Switching with Gatekeeper ---
  const handleTabChange = (tab: FeedTab) => {
    if (tab === 'balanced' && !user) {
      setShowLoginModal(true);
      return;
    }
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- 3. Data Fetching (tRPC + Infinite) ---
  // A. Latest Feed
  const latestQuery = trpc.article.getFeed.useInfiniteQuery(
    { limit: 10 },
    { 
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: activeTab === 'latest' 
    }
  );

  // B. Balanced Feed (Only fetches if user exists)
  const balancedQuery = trpc.article.getBalancedFeed.useInfiniteQuery(
    { limit: 10 },
    { 
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: activeTab === 'balanced' && !!user 
    }
  );

  // C. In Focus (Narratives)
  const narrativeQuery = trpc.article.getInFocusFeed.useQuery(
    undefined, 
    { enabled: activeTab === 'infocus' }
  );

  // --- 4. Infinite Scroll Trigger ---
  const { ref, inView } = useInView();
  
  useEffect(() => {
    if (inView) {
      if (activeTab === 'latest' && latestQuery.hasNextPage) {
        latestQuery.fetchNextPage();
      } else if (activeTab === 'balanced' && balancedQuery.hasNextPage) {
        balancedQuery.fetchNextPage();
      }
    }
  }, [inView, activeTab, latestQuery.hasNextPage, balancedQuery.hasNextPage]);


  // --- Helper to Render Content ---
  const renderContent = () => {
    // 1. Loading States
    if (
      (activeTab === 'latest' && latestQuery.isLoading) ||
      (activeTab === 'infocus' && narrativeQuery.isLoading) ||
      (activeTab === 'balanced' && balancedQuery.isLoading)
    ) {
      return (
        <div className="space-y-4 pt-4">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="h-64 w-full animate-pulse bg-gray-200 dark:bg-gray-800 rounded-xl" />
           ))}
        </div>
      );
    }

    // 2. Error States
    if (latestQuery.isError || narrativeQuery.isError || balancedQuery.isError) {
      return (
        <div className="text-center py-10 text-red-500">
          <p>Unable to load feed. Please try again.</p>
          <Button onClick={() => window.location.reload()} variant="outline" className="mt-4">
            Retry
          </Button>
        </div>
      );
    }

    // 3. Render Items
    if (activeTab === 'latest') {
      return (
        <div className="space-y-4 pt-4">
          {latestQuery.data?.pages.map((page, i) => (
            <React.Fragment key={i}>
              {page.items.map((item) => (
                <FeedItem key={item.id} article={item} onClick={() => {}} />
              ))}
            </React.Fragment>
          ))}
          <div ref={ref} className="h-10 w-full flex justify-center items-center text-gray-400 text-sm">
             {latestQuery.isFetchingNextPage ? 'Loading more...' : ''}
          </div>
        </div>
      );
    }

    if (activeTab === 'infocus') {
      return (
        <div className="space-y-4 pt-4">
          {narrativeQuery.data?.map((narrative) => (
             // Special styling for Narrative Cards
             <div 
               key={narrative.id} 
               onClick={() => setSelectedNarrativeId(narrative.id)}
               className="cursor-pointer"
             >
                <FeedItem 
                  article={{...narrative, source: 'Narrative', url: ''}} // Adapter for FeedItem
                  isNarrative={true}
                />
             </div>
          ))}
          {(!narrativeQuery.data || narrativeQuery.data.length === 0) && (
             <div className="text-center py-10 text-gray-500">No narratives in focus right now.</div>
          )}
        </div>
      );
    }

    if (activeTab === 'balanced') {
      return (
         <div className="space-y-4 pt-4">
          {balancedQuery.data?.pages.map((page, i) => (
            <React.Fragment key={i}>
              {page.items.map((item) => (
                <FeedItem key={item.id} article={item} isBalanced={true} onClick={() => {}} />
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
      <div className="sticky top-16 z-30 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex justify-around p-2">
          {['latest', 'infocus', 'balanced'].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab as FeedTab)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-full transition-all duration-200",
                activeTab === tab 
                  ? "bg-blue-600 text-white shadow-md" 
                  : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              {tab === 'infocus' ? 'In Focus' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 max-w-2xl mx-auto">
        {renderContent()}
      </div>

      {/* Modals */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
      
      {selectedNarrativeId && (
        <NarrativeModal 
          narrativeId={selectedNarrativeId} 
          onClose={() => setSelectedNarrativeId(null)}
        />
      )}
    </div>
  );
}
