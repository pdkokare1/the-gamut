import React, { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { trpc } from '@/utils/trpc';
import { FeedItem } from '@/components/FeedItem'; // Uses the new FeedItem
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NewsFeedProps {
  filters?: any; // You can strictly type this with your Filter state interface
}

export const NewsFeed: React.FC<NewsFeedProps> = ({ filters }) => {
  const { ref, inView } = useInView();

  // Infinite Query for Articles
  const { 
    data, 
    isLoading, 
    isError, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = trpc.article.getAll.useInfiniteQuery(
    { limit: 10, ...filters }, // Pass filters directly to backend
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  // Auto-load more when scrolling to bottom
  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  if (isLoading) {
    return (
       <div className="space-y-4 pt-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-48 w-full bg-muted/20 animate-pulse rounded-xl" />
          ))}
       </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20">
         <p className="text-red-500">Failed to load feed.</p>
         <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
            Retry
         </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      {data?.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.items.map((article: any) => (
            <FeedItem key={article.id} article={article} />
          ))}
        </React.Fragment>
      ))}

      {/* Loading Indicator for Next Page */}
      <div ref={ref} className="h-20 flex items-center justify-center">
         {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
         {!hasNextPage && data && (
            <p className="text-sm text-muted-foreground">You've reached the end.</p>
         )}
      </div>
    </div>
  );
};
