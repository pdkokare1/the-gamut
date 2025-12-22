import { Play, FileText, Share2, MoreHorizontal, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { useAudio } from '@/context/AudioContext';

// Define the shape of data we expect (matching the TRPC output)
interface FeedItemProps {
  article: {
    id: string;
    headline: string;
    summary: string;
    source: string;
    publishedAt: string | Date; // TRPC might return string, Date-fns needs Date
    imageUrl?: string | null;
    category: string;
    sentiment: 'Positive' | 'Negative' | 'Neutral';
    biasScore?: number;
    trustScore?: number;
    politicalLean?: string;
    audioUrl?: string | null;
    url: string; // Original URL
  };
}

export function FeedItem({ article }: FeedItemProps) {
  const { playTrack } = useAudio();

  // Helper: Determine Bias Color
  const getBiasColor = (lean?: string) => {
    if (!lean) return "bg-gray-500";
    const l = lean.toLowerCase();
    if (l.includes("left")) return "bg-lean-left";
    if (l.includes("right")) return "bg-lean-right";
    return "bg-lean-center"; // Center/Gold
  };

  return (
    <article className="glass-card rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 group border-l-4 border-l-transparent hover:border-l-primary relative">
      
      {/* 1. Header Section */}
      <div className="p-4 pb-2 flex justify-between items-start">
        <div className="flex items-center gap-2">
          {/* Source Badge */}
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-semibold border-primary/20 text-primary">
            {article.source}
          </Badge>
          
          {/* Timestamp */}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
          </span>
        </div>

        {/* Sentiment/Trust Indicator */}
        <div className="flex gap-2">
          {article.trustScore && article.trustScore > 80 && (
            <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-0 text-[10px]">
              High Trust
            </Badge>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 2. Content Section */}
      <div className="px-4 pb-2 space-y-2 cursor-pointer">
        <h3 className="text-lg font-logo font-bold leading-tight group-hover:text-primary transition-colors">
          {article.headline}
        </h3>
        
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
          {article.summary}
        </p>
      </div>

      {/* 3. Visuals & Metadata (Optional Image) */}
      {article.imageUrl && (
        <div className="mx-4 mt-2 mb-2 rounded-lg overflow-hidden h-32 relative">
            <img 
              src={article.imageUrl} 
              alt="Article thumbnail" 
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              loading="lazy"
            />
            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      {/* 4. Footer Actions */}
      <div className="p-4 pt-2 flex items-center justify-between border-t border-border/40 mt-2">
        
        <div className="flex gap-2">
           {/* Listen Button */}
           <Button 
             size="sm" 
             variant="ghost" 
             className="h-8 gap-2 text-xs font-medium hover:text-primary hover:bg-primary/10"
             onClick={() => playTrack({ 
                id: article.id, 
                title: article.headline, 
                author: article.source, 
                url: article.audioUrl || '' // If empty, context handles generation request
             })}
           >
             <Play className="h-3.5 w-3.5" />
             Listen
           </Button>

           {/* Analysis Link */}
           <Button size="sm" variant="ghost" className="h-8 gap-2 text-xs font-medium hover:text-blue-500 hover:bg-blue-500/10">
             <FileText className="h-3.5 w-3.5" />
             Analysis
           </Button>
        </div>

        <div className="flex gap-2">
           <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground">
             <Share2 className="h-3.5 w-3.5" />
           </Button>
           
           <a href={article.url} target="_blank" rel="noreferrer">
             <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary">
               <ExternalLink className="h-3.5 w-3.5" />
             </Button>
           </a>
        </div>
      </div>

      {/* Bias Bar (Bottom Edge) */}
      <div className={cn("h-1 w-full absolute bottom-0 left-0 opacity-50", getBiasColor(article.politicalLean))} />
    </article>
  );
}
