import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '@/utils/trpc';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FeedItem } from '@/components/FeedItem';
import { SearchFilters, type SearchFiltersState } from '@/components/search/SearchFilters';
import { Search, X, SlidersHorizontal, History, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const query = searchParams.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filter State
  const [filters, setFilters] = useState<SearchFiltersState>({
    sort: 'latest',
    category: 'All Categories',
    lean: 'All Leans',
    region: 'Global',
    type: 'All Types'
  });
  
  // Local History State
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  // TRPC Search Query
  // Note: We pass 'filters' to the backend here. Ensure your backend router accepts these inputs.
  const { data: results, isLoading } = trpc.article.search.useQuery(
    { 
        term: query,
        ...filters // <== Spread filters into the query
    },
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

  const activeFilterCount = Object.values(filters).filter(v => 
    v !== 'All Categories' && v !== 'All Leans' && v !== 'Global' && v !== 'All Types' && v !== 'latest'
  ).length;

  return (
    <div className="space-y-6 fade-in pb-20">
      
      {/* 1. SEARCH HEADER */}
      <div className="sticky top-[3.5rem] z-30 bg-background/95 backdrop-blur-xl p-4 -mx-4 mb-4 border-b border-border shadow-sm">
        <div className="max-w-2xl mx-auto space-y-4">
            <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search topics, people, or events..." 
                className="pl-10 pr-12 h-12 text-lg bg-secondary/50 border-transparent focus:border-primary/50 rounded-xl transition-all shadow-inner"
                autoFocus
            />
            
            {/* Clear Button */}
            {searchTerm && (
                <button 
                type="button"
                onClick={clearSearch}
                className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 hover:bg-muted rounded-full transition-colors"
                >
                <X className="h-4 w-4 text-muted-foreground" />
                </button>
            )}

            {/* Filter Toggle */}
            <Button 
                type="button" 
                variant="ghost" 
                size="icon"
                className={cn("absolute right-2 top-1/2 -translate-y-1/2 transition-colors", showFilters || activeFilterCount > 0 ? "text-primary bg-primary/10" : "text-muted-foreground")}
                onClick={() => setShowFilters(!showFilters)}
            >
                <SlidersHorizontal className="h-5 w-5" />
                {activeFilterCount > 0 && (
                    <span className="absolute top-2 right-2 h-2 w-2 bg-primary rounded-full ring-2 ring-background" />
                )}
            </Button>
            </form>

            {/* EXPANDABLE FILTERS */}
            {showFilters && (
                <SearchFilters 
                    filters={filters} 
                    onChange={setFilters} 
                    onClose={() => setShowFilters(false)} 
                />
            )}
        </div>
      </div>

      {/* 2. EMPTY STATE / HISTORY */}
      {!query && (
        <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
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
                    className="rounded-full px-4 h-8 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {term}
                  </Button>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-center py-16 opacity-50 space-y-4">
             <Search className="h-16 w-16 mx-auto text-muted-foreground/50" />
             <div>
                <p className="text-lg font-medium">Ready to explore?</p>
                <p className="text-sm text-muted-foreground">Try searching for "Artificial Intelligence", "SpaceX", or "Climate Policy"</p>
             </div>
          </div>
        </div>
      )}

      {/* 3. RESULTS */}
      {query && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="flex justify-between items-baseline border-b border-border pb-2">
            <p className="text-sm text-muted-foreground">
                {isLoading ? 'Searching...' : `Found ${results?.length || 0} results`}
            </p>
            {activeFilterCount > 0 && (
                <p className="text-xs text-primary font-medium">{activeFilterCount} filters active</p>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-4">
               {[1,2,3,4].map(i => (
                 <div key={i} className="h-40 w-full bg-muted/40 rounded-xl animate-pulse" />
               ))}
            </div>
          ) : (
            <div className="space-y-4">
                {results?.map((article: any) => (
                    <FeedItem key={article.id} article={article} />
                ))}
            </div>
          )}

          {!isLoading && results?.length === 0 && (
             <div className="text-center py-20 border-2 border-dashed border-border rounded-xl bg-muted/5">
               <p className="text-lg font-medium">No results found</p>
               <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                   We couldn't find anything matching "{query}" with the current filters.
               </p>
               <Button variant="link" onClick={() => setFilters({ sort: 'latest', category: 'All Categories', lean: 'All Leans', region: 'Global', type: 'All Types' })}>
                   Clear Filters
               </Button>
             </div>
          )}
        </div>
      )}
    </div>
  );
}
