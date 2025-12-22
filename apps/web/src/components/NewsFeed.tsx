import { useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import { trpc } from '../utils/trpc';
import { FeedItem } from './FeedItem';
import { Loader2, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

export function NewsFeed() {
  // 1. TRPC Infinite Query
  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = trpc.article.getFeed.useInfiniteQuery(
    { limit: 10 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnWindowFocus: false, // Prevent jarring refreshes
    }
  );

  // 2. Intersection Observer for Infinite Scroll
  const { ref, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, fetchNextPage]);

  // 3. Loading State (Initial)
  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  // 4. Error State
  if (isError) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-muted-foreground">Unable to load the news stream.</p>
        <Button onClick={() => refetch()} variant="outline" className="gap-2">
          <RefreshCcw className="h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  // 5. Flatten Pages
  // data.pages is an array of responses (each with .items). We flatten this into one list.
  const articles = data?.pages.flatMap((page) => page.items) || [];

  if (articles.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No articles found. Check back later!
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-8">
      {/* Article List */}
      {articles.map((article) => (
        <FeedItem key={article.id} article={article} />
      ))}

      {/* Loading More Indicator */}
      <div ref={ref} className="flex justify-center py-8">
        {isFetchingNextPage ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : hasNextPage ? (
          <span className="text-xs text-muted-foreground">Scroll for more</span>
        ) : (
          <span className="text-xs text-muted-foreground">You're all caught up</span>
        )}
      </div>
    </div>
  );
}
