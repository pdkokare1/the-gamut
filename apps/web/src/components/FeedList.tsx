import React, { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { trpc } from '@/utils/trpc';
import ArticleCard from './ArticleCard';
import NarrativeCard from './NarrativeCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

interface FeedListProps {
  mode: 'latest' | 'infocus' | 'balanced';
  filters: any;
  onOpenNarrative?: (n: any) => void;
}

const FeedList: React.FC<FeedListProps> = ({ mode, filters, onOpenNarrative }) => {
  const { ref, inView } = useInView();

  // 1. Dynamic Query Selection based on Mode
  // We use the same 'getFeed' for Latest, but 'getInFocusFeed' for Narratives
  const isNarrativeMode = mode === 'infocus';
  const isBalancedMode = mode === 'balanced';

  // Define the query based on mode
  const query = isNarrativeMode 
    ? trpc.article.getInFocusFeed.useQuery({ ...filters }) // InFocus doesn't infinite scroll yet in this v1
    : isBalancedMode
    ? trpc.article.getBalancedFeed.useQuery({ limit: 10 })
    : trpc.article.getFeed.useInfiniteQuery(
        { ...filters, limit: 10 },
        { getNextPageParam: (lastPage) => lastPage.nextCursor }
      );

  // 2. Handle Infinite Scroll (Only for Latest)
  useEffect(() => {
    if (inView && !isNarrativeMode && !isBalancedMode) {
       // @ts-ignore - TS struggles with the union of queries type here, but it's safe
       if (query.hasNextPage && !query.isFetchingNextPage) {
           query.fetchNextPage();
       }
    }
  }, [inView, query, isNarrativeMode, isBalancedMode]);


  // 3. Loading States
  if (query.isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex flex-col space-y-3">
            <Skeleton className="h-[200px] w-full rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 4. Data Flattening
  let items: any[] = [];
  if (isNarrativeMode || isBalancedMode) {
      // @ts-ignore
      items = query.data?.articles || []; 
  } else {
      // @ts-ignore
      items = query.data?.pages.flatMap((page) => page.items) || [];
  }

  if (items.length === 0) {
      return (
          <div className="p-8 text-center text-muted-foreground">
              <p>No stories found for these filters.</p>
              <Button variant="link" onClick={() => window.location.reload()}>Refresh</Button>
          </div>
      );
  }

  return (
    <div className="space-y-4 pb-20 p-2 sm:p-4 max-w-3xl mx-auto">
      {items.map((item: any) => (
        <React.Fragment key={item.id}>
            {item.type === 'Narrative' ? (
                <NarrativeCard 
                    data={item} 
                    onClick={() => onOpenNarrative?.(item)} 
                />
            ) : (
                <ArticleCard article={item} />
            )}
        </React.Fragment>
      ))}

      {/* Infinite Scroll Trigger */}
      {!isNarrativeMode && !isBalancedMode && (
          <div ref={ref} className="h-10 flex justify-center items-center">
              {/* @ts-ignore */}
              {query.isFetchingNextPage && <Skeleton className="h-4 w-24" />}
          </div>
      )}
    </div>
  );
};

export default FeedList;
