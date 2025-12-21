import React from "react";
import { trpc } from "../utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function HomePage() {
  // Fetch Feed with Infinite Scroll
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = trpc.article.getFeed.useInfiniteQuery(
    { limit: 10 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  if (isLoading) {
    return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Your Briefing</h1>

      <div className="grid gap-6">
        {data?.pages.map((page, i) => (
          <React.Fragment key={i}>
            {page.items.map((article) => (
              <Card key={article.id} className="overflow-hidden">
                {article.imageUrl && (
                  <img 
                    src={article.imageUrl} 
                    alt={article.headline} 
                    className="h-48 w-full object-cover"
                    loading="lazy"
                  />
                )}
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <Badge variant="outline">{article.category}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(article.publishedAt))} ago
                    </span>
                  </div>
                  <CardTitle className="mt-2 line-clamp-2">
                    <a href={article.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {article.headline}
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {article.summary}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge variant={
                      article.sentiment === 'Positive' ? 'default' : 
                      article.sentiment === 'Negative' ? 'destructive' : 'secondary'
                    }>
                      {article.sentiment}
                    </Badge>
                    <span className="text-xs font-medium text-muted-foreground">
                      Source: {article.source}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </React.Fragment>
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button 
            onClick={() => fetchNextPage()} 
            disabled={isFetchingNextPage}
            variant="ghost"
          >
            {isFetchingNextPage ? "Loading..." : "Load More Stories"}
          </Button>
        </div>
      )}
    </div>
  );
}
