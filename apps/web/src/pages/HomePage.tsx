import { useState } from "react";
import { trpc } from "../utils/trpc";
import { ArticleCard } from "../components/ArticleCard"; // Assumes you have this from previous uploads or I can provide if missing
import { Button } from "../components/ui/button";
import { NarrativeList } from "../components/NarrativeList"; // New Component

export function HomePage() {
  const [filter, setFilter] = useState<'All' | 'Positive' | 'Negative'>('All');

  // Fetch Feed
  const { 
    data, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage, 
    isLoading 
  } = trpc.article.getFeed.useInfiniteQuery(
    {
      limit: 10,
      sentiment: filter === 'All' ? undefined : filter,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );

  return (
    <div className="pb-20">
      {/* Filters Header */}
      <div className="sticky top-0 bg-white z-10 p-2 border-b flex gap-2 overflow-x-auto">
        <Button 
          variant={filter === 'All' ? "default" : "outline"} 
          size="sm" 
          onClick={() => setFilter('All')}
          className="rounded-full"
        >
          All News
        </Button>
        <Button 
          variant={filter === 'Positive' ? "default" : "outline"} 
          size="sm" 
          onClick={() => setFilter('Positive')}
          className="rounded-full text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
        >
          Positive
        </Button>
        <Button 
          variant={filter === 'Negative' ? "default" : "outline"} 
          size="sm" 
          onClick={() => setFilter('Negative')}
          className="rounded-full text-red-700 border-red-200 bg-red-50 hover:bg-red-100"
        >
          Critical
        </Button>
      </div>

      {/* 1. New Narrative Section (Clusters) */}
      <div className="pt-4">
        <NarrativeList />
      </div>

      {/* 2. Main Feed */}
      <div className="px-4 space-y-4">
        <h2 className="text-lg font-bold text-slate-900 mb-2">Latest Updates</h2>
        
        {isLoading && <div className="text-center py-10">Loading feed...</div>}

        {data?.pages.map((page, i) => (
          <div key={i} className="space-y-4">
            {page.items.map((article) => (
              // Ensure ArticleCard accepts these props
              <div key={article.id} className="border rounded-xl p-4 shadow-sm bg-white">
                {article.imageUrl && (
                    <img 
                      src={article.imageUrl} 
                      alt="" 
                      className="w-full h-48 object-cover rounded-lg mb-3"
                    />
                )}
                <div className="text-xs text-slate-500 mb-1 flex justify-between">
                    <span>{article.source}</span>
                    <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                </div>
                <h3 className="font-bold text-lg mb-2 leading-snug">{article.headline}</h3>
                <p className="text-sm text-slate-600 line-clamp-3">{article.summary}</p>
              </div>
            ))}
          </div>
        ))}

        {/* Load More Trigger */}
        <div className="py-6 text-center">
          {hasNextPage && (
            <Button 
              onClick={() => fetchNextPage()} 
              disabled={isFetchingNextPage}
              variant="secondary"
              className="w-full"
            >
              {isFetchingNextPage ? "Loading more..." : "Load More Articles"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
