import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Play, 
  Pause, 
  Bookmark, 
  BookmarkCheck, 
  Share2, 
  MoreHorizontal, 
  ShieldCheck, 
  AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAudio } from '@/context/AudioContext'; // We will build this next
import { useAuth } from '@/context/AuthContext';
import { trpc } from '@/utils/trpc';

// --- Types (Matched to your new Schema) ---
interface ArticleProps {
  article: {
    id: string;
    headline: string;
    summary: string;
    imageUrl?: string | null;
    source: string;
    publishedAt: Date | string;
    politicalLean?: string;
    biasScore?: number;
    trustScore?: number;
    category: string;
    audioUrl?: string;
  };
  layout?: 'grid' | 'list' | 'compact';
}

// --- Helper: Political Color Logic ---
const getLeanColor = (lean?: string) => {
  if (!lean) return 'bg-gray-400';
  if (lean.includes('Left')) return 'bg-blue-500';
  if (lean.includes('Right')) return 'bg-red-500';
  return 'bg-purple-500'; // Center
};

const getTrustColor = (score?: number) => {
  if (!score) return 'text-gray-500 border-gray-200';
  if (score >= 80) return 'text-green-600 border-green-200 bg-green-50';
  if (score >= 50) return 'text-yellow-600 border-yellow-200 bg-yellow-50';
  return 'text-red-600 border-red-200 bg-red-50';
};

export const ArticleCard: React.FC<ArticleProps> = ({ article, layout = 'grid' }) => {
  const { isPlaying, currentTrack, playTrack, pauseTrack } = useAudio();
  const { user, openLoginModal } = useAuth();
  const [isSaved, setIsSaved] = useState(false); // Optimistic UI state

  // tRPC Mutations
  const toggleSaveMutation = trpc.article.toggleSave.useMutation({
    onSuccess: () => setIsSaved((prev) => !prev),
  });

  // Derived State
  const isCurrentTrack = currentTrack?.id === article.id;
  const isPlayingThis = isCurrentTrack && isPlaying;
  const formattedDate = formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true });

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlayingThis) {
      pauseTrack();
    } else {
      playTrack(article);
    }
  };

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      openLoginModal();
      return;
    }
    toggleSaveMutation.mutate({ articleId: article.id });
    setIsSaved(!isSaved); // Optimistic update
  };

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all hover:shadow-md border-border/50 bg-card",
        layout === 'list' ? "flex flex-row gap-4" : "flex flex-col"
      )}
    >
      {/* --- 1. BIAS STRIP INDICATOR --- */}
      <div 
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1", 
          getLeanColor(article.politicalLean)
        )} 
        title={`Political Lean: ${article.politicalLean || 'Neutral'}`}
      />

      {/* --- 2. IMAGE SECTION --- */}
      {layout !== 'compact' && article.imageUrl && (
        <div className={cn(
          "relative overflow-hidden bg-muted",
          layout === 'list' ? "w-1/3 min-w-[120px] max-w-[200px]" : "aspect-video w-full"
        )}>
          <img 
            src={article.imageUrl} 
            alt={article.headline}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          
          {/* Audio Overlay Button */}
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background/90 shadow-lg backdrop-blur-sm">
              {isPlayingThis ? (
                <Pause className="h-6 w-6 text-foreground" />
              ) : (
                <Play className="h-6 w-6 text-foreground ml-1" />
              )}
            </div>
          </button>
          
          {/* Category Badge (Over Image) */}
          <Badge 
            variant="secondary" 
            className="absolute left-3 top-3 bg-background/80 backdrop-blur-md text-xs font-medium"
          >
            {article.category}
          </Badge>
        </div>
      )}

      {/* --- 3. CONTENT SECTION --- */}
      <div className="flex flex-1 flex-col justify-between p-4 pl-5">
        <CardHeader className="p-0 space-y-2">
          {/* Meta Row */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{article.source}</span>
              <span>•</span>
              <span>{formattedDate}</span>
            </div>
            
            {/* Trust Score Badge */}
            {article.trustScore && (
              <div className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium",
                getTrustColor(article.trustScore)
              )}>
                {article.trustScore > 70 ? <ShieldCheck className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {article.trustScore}% Trust
              </div>
            )}
          </div>

          {/* Headline */}
          <h3 className={cn(
            "font-serif font-bold leading-tight text-foreground group-hover:text-primary transition-colors",
            layout === 'compact' ? "text-sm" : "text-lg"
          )}>
            {article.headline}
          </h3>
          
          {/* Summary (Truncated) */}
          {layout !== 'compact' && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {article.summary}
            </p>
          )}
        </CardHeader>

        {/* --- 4. ACTION FOOTER --- */}
        <CardFooter className="p-0 pt-4 mt-auto flex items-center justify-between">
          <div className="flex gap-2">
            {/* Smart Briefing Trigger */}
            <Button variant="ghost" size="sm" className="h-8 text-xs px-2 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50">
               ✨ AI Brief
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSave}>
              {isSaved ? (
                <BookmarkCheck className="h-4 w-4 text-primary fill-current" />
              ) : (
                <Bookmark className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </Button>
            
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </CardFooter>
      </div>
    </Card>
  );
};

export default ArticleCard;
