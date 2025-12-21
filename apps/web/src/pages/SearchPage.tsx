import { useState } from "react";
import { trpc } from "../utils/trpc";
import { Input } from "../components/ui/input";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { Search as SearchIcon, Loader2 } from "lucide-react";

export function SearchPage() {
  const [term, setTerm] = useState("");
  
  // Only search when term length > 2 to save API calls
  const { data, isLoading } = trpc.article.search.useQuery(
    { term },
    { enabled: term.length > 2 }
  );

  return (
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search news, topics, or sources..." 
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {isLoading && <div className="flex justify-center"><Loader2 className="animate-spin" /></div>}

      <div className="grid gap-4">
        {data?.map((article) => (
          <Card key={article.id} className="hover:bg-muted/50 transition-colors">
            <CardHeader className="p-4">
              <CardTitle className="text-lg">
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.headline}
                </a>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{article.summary}</p>
            </CardHeader>
          </Card>
        ))}
        
        {term.length > 2 && data?.length === 0 && (
          <p className="text-center text-muted-foreground">No results found.</p>
        )}
      </div>
    </div>
  );
}
