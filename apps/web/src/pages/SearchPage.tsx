import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { trpc } from '../utils/trpc';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FeedItem } from '../components/FeedItem';
import { Search, X, SlidersHorizontal, History } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const query = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  
  // Local History State
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  // TRPC Search Query
  const { data: results, isLoading } = trpc.article.search.useQuery(
    { term: query },
    { enabled: query.length > 2, keepPreviousData: true }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    // Update URL
    setSearchParams({ q: searchTerm });
    
    // Save to History
    const newHistory = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
    setRecentSearches(newHistory);
    localStorage.setItem('recent_searches', JSON.stringify(newHistory));
  };

  const clearSearch = () => {
    setSearchTerm('');
    setSearchParams({});
  };

  return (
    <div className="space-y-6 fade-in pb-20">
      
      {/* 1. SEARCH HEADER */}
      <div className="sticky top-20 z-30 bg-background/80 backdrop-blur-xl p-4 -mx-4 mb-4 border-b border-white/5">
        <form onSubmit={handleSearch} className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search topics, people, or events..." 
            className="pl-10 pr-12 h-12 text-lg bg-secondary/50 border-transparent focus:border-primary/50 rounded-xl transition-all"
            autoFocus
          />
          {searchTerm && (
            <button 
              type="button"
              onClick={clearSearch}
              className="absolute right-12 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          <Button 
            type="button" 
            variant="ghost" 
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className={`h-5 w-5 ${showFilters ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </form>

        {/* Expandable Filters */}
        {showFilters && (
          <div className="max-w-2xl mx-auto mt-4 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">Last 24 Hours</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">Positive Sentiment</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">High Trust Score</Badge>
            <Badge variant="outline" className="cursor-pointer hover:bg-primary/10">Video Content</Badge>
          </div>
        )}
      </div>

      {/* 2. EMPTY STATE / HISTORY */}
      {!query && (
        <div className="max-w-xl mx-auto space-y-8">
          {recentSearches.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <History className="h-4 w-4" /> Recent
              </h3>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map(term => (
                  <Button 
                    key={term} 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => { setSearchTerm(term); setSearchParams({ q: term }); }}
                    className="rounded-full px-4"
                  >
                    {term}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-center py-10 opacity-50">
             <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
             <p>Try searching for "Artificial Intelligence" or "SpaceX"</p>
          </div>
        </div>
      )}

      {/* 3. RESULTS */}
      {query && (
        <div className="max-w-2xl mx-auto space-y-6">
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Searching...' : `Found ${results?.length || 0} results for "${query}"`}
          </p>

          {isLoading ? (
            <div className="space-y-4">
               {[1,2,3].map(i => <div key={i} className="h-40 bg-muted/50 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            results?.map((article: any) => (
              <FeedItem key={article.id} article={article} />
            ))
          )}

          {!isLoading && results?.length === 0 && (
             <div className="text-center py-20 border-2 border-dashed border-border rounded-xl">
               <p className="text-lg font-medium">No results found</p>
               <p className="text-muted-foreground">Try adjusting your search terms.</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
