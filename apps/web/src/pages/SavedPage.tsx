import { useEffect, useState } from 'react';
import { trpc } from '@/utils/trpc';
import offlineStorage from '@/lib/offline-storage';
import { FeedItem } from '@/components/FeedItem';
import { Button } from '@/components/ui/button';
import { Loader2, Bookmark, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

export function SavedPage() {
  const [localArticles, setLocalArticles] = useState<any[]>([]);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // 1. Try to fetch from Server
  const { data: serverArticles, isLoading, isError } = trpc.article.getSaved.useQuery(undefined, {
    retry: 1,
    onSuccess: (data) => {
      // Sync to offline storage on successful fetch
      offlineStorage.save('saved-library', data);
      setIsOfflineMode(false);
    },
    onError: async () => {
      // If server fails, try loading from cache
      const cached = await offlineStorage.get('saved-library');
      if (cached) {
        setLocalArticles(cached);
        setIsOfflineMode(true);
        toast.info("Offline Mode: Showing cached library");
      }
    }
  });

  // 2. Initial Load Check (for when app starts offline)
  useEffect(() => {
    const checkOffline = async () => {
        if (!navigator.onLine) {
            const cached = await offlineStorage.get('saved-library');
            if (cached) {
                setLocalArticles(cached);
                setIsOfflineMode(true);
            }
        }
    };
    checkOffline();
  }, []);

  const articles = isOfflineMode ? localArticles : (serverArticles || []);

  if (isLoading && !isOfflineMode) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 fade-in">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
           <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
             <Bookmark className="h-6 w-6 text-primary" />
             Saved Library
           </h1>
           <p className="text-muted-foreground text-sm">
             {articles.length} articles saved for later reading
           </p>
        </div>
        {isOfflineMode && (
            <div className="flex items-center gap-2 text-xs font-medium text-orange-500 bg-orange-500/10 px-3 py-1 rounded-full">
                <WifiOff className="h-3.5 w-3.5" /> Offline Mode
            </div>
        )}
      </div>

      {/* Empty State */}
      {articles.length === 0 && (
        <div className="text-center py-16 bg-secondary/20 rounded-xl border border-dashed border-border">
           <Bookmark className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
           <h3 className="text-lg font-medium">Your library is empty</h3>
           <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
             Tap the bookmark icon on any article to save it here for offline reading.
           </p>
           <Button asChild>
              <Link to="/">Browse Articles</Link>
           </Button>
        </div>
      )}

      {/* List */}
      <div className="space-y-4">
        {articles.map((article) => (
          <FeedItem key={article.id} article={article} />
        ))}
      </div>

    </div>
  );
}
