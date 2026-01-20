// apps/web/src/components/ArticleCard.tsx
import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Play, Pause, Bookmark, Share2, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAudio } from '@/context/AudioContext';
import { trpc } from '@/utils/trpc';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { InlineSmartBrief } from './smart-brief/InlineSmartBrief';

interface ArticleProps {
  article: {
    id: string;
    headline: string;
    summary: string;
    imageUrl?: string | null;
    source: string;
    publishedAt: string | Date;
    trustScore: number;
    biasScore: number;
    politicalLean: string;
    url: string;
    isSaved?: boolean;
    readingTime?: number;
    category?: string;
  };
  className?: string;
}

export function ArticleCard({ article, className }: ArticleProps) {
  const { user } = useAuth();
  const { playTrack, isPlaying, currentTrack, pauseTrack } = useAudio();
  
  // Local state
  const [isSaved, setIsSaved] = useState(article.isSaved || false);
  const [showBrief, setShowBrief] = useState(false); // Toggle for Smart Brief

  const utils = trpc.useContext();
  const toggleSaveMutation = trpc.article.toggleSave.useMutation({
    onSuccess: (data) => {
      setIsSaved(data.saved);
      toast.success(data.saved ? "Article saved" : "Removed from saved");
      utils.article.getSavedArticles.invalidate();
    },
    onError: () => {
      toast.error("Failed to update save status");
      setIsSaved(!isSaved); // Revert
    }
  });

  // Audio Logic
  const isCurrentTrack = currentTrack?.id === article.id;
  const isActive = isCurrentTrack && isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActive) {
      pauseTrack();
    } else {
      playTrack({
        id: article.id,
        title: article.headline,
        author: article.source,
        url: "", // The service will handle fetching the real URL
        imageUrl: article.imageUrl || undefined
      });
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
        toast.error("Please sign in to save articles");
        return;
    }
    setIsSaved(!isSaved); 
    toggleSaveMutation.mutate({ articleId: article.id });
  };

  // Determine Trust Color (Original Logic)
  const getTrustColor = (score: number) => {
    if (score >= 85) return "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20";
    if (score >= 60) return "text-yellow-600 border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20";
    return "text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20";
  };

  return (
    <div className={cn(
      "group bg-card rounded-xl border border-border shadow-sm transition-all duration-300 hover:shadow-md overflow-hidden",
      className
    )}>
      {/* 1. Main Click Area */}
      <div onClick={() => setShowBrief(!showBrief)} className="cursor-pointer">
        <div className="flex flex-col sm:flex-row">
          
          {/* Image */}
          <div className="sm:w-1/3 aspect-video sm:aspect-auto relative overflow-hidden bg-muted">
             {article.imageUrl ? (
               <img 
                 src={article.imageUrl} 
                 alt={article.headline}
                 className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                 loading="lazy"
               />
             ) : (
               <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
                 <span className="text-4xl font-serif">Ag</span>
               </div>
             )}
             
             {/* Audio Floating Button */}
             <div className="absolute top-2 right-2 z-10">
                <Button
                   size="icon"
                   variant="secondary"
                   className={cn(
                       "h-8 w-8 rounded-full bg-background/80 backdrop-blur hover:bg-primary hover:text-primary-foreground shadow-sm transition-all",
                       isActive && "bg-primary text-primary-foreground scale-110"
                   )}
                   onClick={handlePlay}
                >
                   {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                </Button>
             </div>
          </div>

          {/* Content */}
          <div className="flex-1 p-4 flex flex-col">
             
             {/* Metadata */}
             <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                 <span className="font-semibold text-foreground">{article.source}</span>
                 <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1", getTrustColor(article.trustScore))}>
                    <div className="w-1.5 h-1.5 rounded-full bg-current" />
                    {article.trustScore}% Trust
                 </div>
             </div>

             {/* Headline */}
             <h3 className="font-bold text-lg leading-snug group-hover:text-primary transition-colors mb-2">
                {article.headline}
             </h3>

             {/* Summary */}
             <p className="text-sm text-muted-foreground line-clamp-2">
                {article.summary}
             </p>

             {/* Footer */}
             <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/40">
                <div className="flex gap-2">
                   <Badge variant="outline" className="text-[10px] font-normal h-5">{article.politicalLean}</Badge>
                   {article.readingTime && (
                       <span className="text-[10px] text-muted-foreground py-0.5">{article.readingTime} min</span>
                   )}
                </div>

                <div className="flex items-center gap-1">
                   {/* Smart Brief Button */}
                   <Button 
                     variant="ghost" 
                     size="sm" 
                     className={cn("h-7 px-2 text-xs gap-1.5", showBrief && "text-primary bg-primary/5")}
                     onClick={(e) => { e.stopPropagation(); setShowBrief(!showBrief); }}
                   >
                      <Sparkles className="w-3 h-3" />
                      {showBrief ? "Close" : "Brief"}
                   </Button>
                   
                   <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
                      <Bookmark className={cn("h-4 w-4", isSaved && "fill-primary text-primary")} />
                   </Button>
                   
                   <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); window.open(article.url, '_blank'); }}>
                      <ExternalLink className="h-4 w-4" />
                   </Button>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* 2. Expanded Smart Brief Section */}
      {showBrief && (
        <div className="px-4 pb-4 bg-card border-t border-border/40">
           <InlineSmartBrief articleId={article.id} />
        </div>
      )}
    </div>
  );
}
