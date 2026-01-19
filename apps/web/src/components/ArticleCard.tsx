import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Play, Pause, Bookmark, Share2, MoreHorizontal, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { useAudio } from '@/context/AudioContext';
import { trpc } from '@/utils/trpc';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';

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
  };
  className?: string;
}

export function ArticleCard({ article, className }: ArticleProps) {
  const { user } = useAuth();
  const { playTrack, isPlaying, currentTrack, pauseTrack } = useAudio();
  const [isSaved, setIsSaved] = useState(article.isSaved || false);

  const utils = trpc.useContext();
  const toggleSaveMutation = trpc.article.toggleSave.useMutation({
    onSuccess: (data) => {
      setIsSaved(data.saved);
      toast.success(data.saved ? "Article saved" : "Article removed from saved");
      utils.article.getSavedArticles.invalidate();
    },
    onError: () => {
      toast.error("Failed to save article");
      // Revert optimistic update if needed, simple toggle here
      setIsSaved(!isSaved); 
    }
  });

  // Handle Audio Playback
  const isCurrentTrack = currentTrack?.id === article.id;
  const isActive = isCurrentTrack && isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isActive) {
      pauseTrack();
    } else {
      playTrack({
        id: article.id,
        title: article.headline,
        artist: article.source,
        url: "", // In a real app, this would be the TTS URL endpoint
        artwork: article.imageUrl || undefined
      });
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) {
        toast.error("Please sign in to save articles");
        return;
    }
    // Optimistic toggle
    setIsSaved(!isSaved); 
    toggleSaveMutation.mutate({ articleId: article.id });
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (navigator.share) {
      try {
        await navigator.share({
          title: article.headline,
          text: article.summary,
          url: article.url,
        });
      } catch (err) {
        // Share cancelled
      }
    } else {
      await navigator.clipboard.writeText(article.url);
      toast.success("Link copied to clipboard");
    }
  };

  // Determine Trust Color
  const getTrustColor = (score: number) => {
    if (score >= 85) return "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
    if (score >= 60) return "text-yellow-500 border-yellow-500/30 bg-yellow-500/10";
    return "text-red-500 border-red-500/30 bg-red-500/10";
  };

  return (
    <div className={cn(
      "group relative bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden",
      className
    )}>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="flex flex-col sm:flex-row">
          
          {/* Image Section */}
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
                 <span className="text-4xl font-serif">Aa</span>
               </div>
             )}
             
             {/* Audio Trigger Overlay */}
             <div className="absolute top-2 right-2">
                <Button
                   size="icon"
                   variant="secondary"
                   className="h-8 w-8 rounded-full bg-background/80 backdrop-blur shadow-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                   onClick={handlePlay}
                >
                   {isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                </Button>
             </div>
          </div>

          {/* Content Section */}
          <div className="flex-1 p-4 flex flex-col justify-between">
             <div className="space-y-2">
                {/* Meta Row */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                   <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{article.source}</span>
                      <span>•</span>
                      <span>{formatDistanceToNow(new Date(article.publishedAt))} ago</span>
                   </div>
                   
                   {/* Trust Badge */}
                   <div className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1", getTrustColor(article.trustScore))}>
                      <div className="w-1.5 h-1.5 rounded-full bg-current" />
                      {article.trustScore}% Trust
                   </div>
                </div>

                {/* Headline */}
                <h3 className="font-bold leading-tight group-hover:text-primary transition-colors line-clamp-3">
                  {article.headline}
                </h3>
                
                {/* Summary (Hidden on very small screens if needed) */}
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {article.summary}
                </p>
             </div>

             {/* Footer Actions */}
             <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                   <Badge variant="outline" className="text-[10px] h-5 font-normal text-muted-foreground">
                      {article.politicalLean}
                   </Badge>
                   {article.readingTime && (
                     <span className="text-[10px] text-muted-foreground">{article.readingTime} min read</span>
                   )}
                </div>

                <div className="flex items-center gap-1">
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleSave}>
                      <Bookmark className={cn("h-4 w-4", isSaved && "fill-primary text-primary")} />
                   </Button>
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={handleShare}>
                      <Share2 className="h-4 w-4" />
                   </Button>
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                   </Button>
                </div>
             </div>
          </div>

        </div>
      </a>
    </div>
  );
}
