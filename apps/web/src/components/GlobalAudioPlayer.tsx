import { useAudio } from '../context/AudioContext';
import { Play, Pause, SkipForward, SkipBack, X, Volume2, Maximize2 } from 'lucide-react';
import { Button } from './ui/button';
import { Slider } from './ui/slider'; // Ensure you have this Shadcn component or use a standard input
import { cn } from '../lib/utils';
import { useState } from 'react';

export function GlobalAudioPlayer() {
  const { 
    isPlaying, 
    currentArticle, 
    progress, 
    togglePlay, 
    closePlayer, 
    seek, 
    duration 
  } = useAudio();

  const [isExpanded, setIsExpanded] = useState(false);

  if (!currentArticle) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div 
        className={cn(
            "fixed z-50 transition-all duration-300 ease-in-out bg-background/95 backdrop-blur border-t shadow-2xl",
            isExpanded ? "inset-0 flex flex-col justify-center items-center p-8 bg-background" : "bottom-[60px] left-0 right-0 h-16 px-4"
        )}
    >
      {/* Progress Bar (Only visible in compact mode as a top line) */}
      {!isExpanded && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-100" 
            style={{ width: `${(progress / duration) * 100}%` }} 
          />
        </div>
      )}

      <div className={cn("flex items-center justify-between h-full w-full max-w-md mx-auto", isExpanded && "flex-col gap-8")}>
        
        {/* Article Info */}
        <div className={cn("flex-1 min-w-0", isExpanded && "text-center")}>
           {isExpanded && (
               <div className="w-32 h-32 mx-auto bg-muted rounded-2xl mb-6 shadow-lg overflow-hidden">
                   {/* Placeholder for Album Art / Article Image */}
                   <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                       <Volume2 className="w-12 h-12 text-primary" />
                   </div>
               </div>
           )}
          <h4 className={cn("font-semibold truncate text-sm", isExpanded && "text-xl mb-2")}>
            {currentArticle.headline}
          </h4>
          <p className={cn("text-xs text-muted-foreground truncate", isExpanded && "text-sm")}>
            {currentArticle.source} • Audio Brief
          </p>
        </div>

        {/* Controls */}
        <div className={cn("flex items-center gap-2", isExpanded && "flex-col w-full gap-6")}>
            
            {/* Scrubber (Expanded Mode Only) */}
            {isExpanded && (
                <div className="w-full space-y-2">
                    <Slider 
                        value={[progress]} 
                        max={duration || 100} 
                        step={1}
                        onValueChange={(val) => seek(val[0])}
                        className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground px-1">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => seek(Math.max(0, progress - 15))} className="hover:text-primary">
                    <SkipBack className="w-5 h-5" />
                </Button>

                <Button 
                    onClick={togglePlay} 
                    size={isExpanded ? "lg" : "icon"} 
                    className={cn("rounded-full", isExpanded ? "h-16 w-16" : "h-10 w-10")}
                >
                    {isPlaying ? <Pause className={cn(isExpanded ? "w-8 h-8" : "w-5 h-5")} /> : <Play className={cn(isExpanded ? "w-8 h-8 ml-1" : "w-5 h-5 ml-1")} />}
                </Button>

                <Button variant="ghost" size="icon" onClick={() => seek(Math.min(duration, progress + 15))} className="hover:text-primary">
                    <SkipForward className="w-5 h-5" />
                </Button>
            </div>
        </div>

        {/* Window Controls */}
        <div className={cn("flex items-center gap-1", isExpanded && "absolute top-4 right-4")}>
             <Button variant="ghost" size="icon" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? <X className="w-5 h-5" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {!isExpanded && (
                <Button variant="ghost" size="icon" onClick={closePlayer}>
                    <X className="w-5 h-5" />
                </Button>
            )}
        </div>
      </div>
    </div>
  );
}
