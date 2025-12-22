import React, { memo } from 'react';
import { useUI } from '@/context/UIContext';
import { useAudio } from '@/context/AudioContext';
import { trpc } from '@/utils/trpc';
import { formatDistanceToNow } from 'date-fns';
import { 
  Play, Pause, Bookmark, Share2, 
  MoreHorizontal, BrainCircuit, BarChart2, Split 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Type definition inferred from backend
import { type RouterOutputs } from '@/utils/trpc';
type Article = RouterOutputs['article']['getAll'][number];

interface FeedItemProps {
  article: Article;
}

const FeedItem = memo(({ article }: FeedItemProps) => {
  const { openSmartBriefing, openAnalysis, openCompare } = useUI();
  const { isPlaying, currentTrack, togglePlay } = useAudio();
  const utils = trpc.useContext();

  // Optimistic Update for Save
  const toggleSave = trpc.article.toggleSave.useMutation({
    onMutate: async () => {
      await utils.article.getAll.cancel();
      const prevData = utils.article.getAll.getData();
      // We could optimistically update cache here, but for simplicity we'll just invalidate on success
      return { prevData };
    },
    onSuccess: (data) => {
      toast.success(data.isSaved ? "Article saved" : "Article removed from saved");
      utils.article.getAll.invalidate();
    }
  });

  const isCurrentTrack = currentTrack?.id === article.id;
  const isAudioPlaying = isCurrentTrack && isPlaying;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentTrack) {
      togglePlay();
    } else {
      // Logic to play this specific article
      // For now, we assume the AudioContext has a 'playTrack' method or similar
      // If not, we trigger the play via the context (you might need to add play(article) to AudioContext)
      console.log("Play requested for:", article.headline);
    }
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({
        title: article.headline,
        text: article.summary,
        url: window.location.href // or article deep link
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(article.url);
      toast.success("Link copied to clipboard");
    }
  };

  return (
    <Card 
      className="group relative overflow-hidden border-border/50 hover:border-primary/20 transition-all duration-300 hover:shadow-md bg-card"
    >
      <div className="flex flex-col sm:flex-row h-full">
        
        {/* 1. Image Section (Mobile: Top, Desktop: Left) */}
        {article.imageUrl && (
          <div className="sm:w-48 h-48 sm:h-auto shrink-0 relative overflow-hidden">
             <img 
               src={article.imageUrl} 
               alt="" 
               className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
               loading="lazy"
             />
             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent sm:hidden" />
             
             {/* Play Button Overlay */}
             <button 
               onClick={handlePlay}
               className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors"
             >
               <div className={cn(
                 "h-12 w-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all",
                 isAudioPlaying ? "bg-primary text-primary-foreground" : "bg-white/20 text-white hover:bg-white/30 hover:scale-110"
               )}>
                 {isAudioPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-1" />}
               </div>
             </button>
          </div>
        )}

        {/* 2. Content Section */}
        <div className="flex-1 p-5 flex flex-col justify-between">
           
           <div>
              {/* Meta Row */}
              <div className="flex items-center justify-between mb-2">
                 <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <span className="uppercase tracking-wider text-primary">{article.source}</span>
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(article.publishedAt))} ago</span>
                 </div>
                 
                 {/* Bias Badge */}
                 {article.biasScore !== null && (
                   <Badge variant="outline" className={cn(
                      "text-[10px] h-5 px-1.5",
                      article.biasScore < 30 ? "border-green-500/50 text-green-600" : 
                      article.biasScore < 70 ? "border-yellow-500/50 text-yellow-600" : "border-red-500/50 text-red-600"
                   )}>
                      Bias: {article.biasScore}
                   </Badge>
                 )}
              </div>

              {/* Headline */}
              <h3 className="text-lg font-heading font-semibold leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="focus:outline-none">
                  <span className="absolute inset-0 sm:static" />
                  {article.headline}
                </a>
              </h3>

              {/* Summary */}
              <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                {article.summary}
              </p>
           </div>

           {/* Actions Footer */}
           <div className="flex items-center justify-between pt-4 border-t border-border/50 relative z-10">
              
              <div className="flex gap-1">
                 {/* Smart Briefing */}
                 <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openSmartBriefing(article)}>
                    <BrainCircuit className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Briefing</span>
                 </Button>

                 {/* Analysis */}
                 <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openAnalysis(article)}>
                    <BarChart2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Analysis</span>
                 </Button>

                 {/* Compare */}
                 <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openCompare(article.clusterId || 0, article.headline)}>
                    <Split className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Compare</span>
                 </Button>
              </div>

              <div className="flex gap-1">
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleSave.mutate({ id: article.id })}>
                    <Bookmark className={cn("h-4 w-4", article.isSaved && "fill-primary text-primary")} />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                 </Button>
              </div>

           </div>
        </div>
      </div>
    </Card>
  );
});

FeedItem.displayName = 'FeedItem';
export { FeedItem };
