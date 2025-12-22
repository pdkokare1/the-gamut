import { useAudio } from "../context/AudioContext";
import { Button } from "./ui/button";
import { Play, Pause, X, SkipBack, SkipForward, Loader2, Volume2, StepBack, StepForward } from "lucide-react";
import { cn } from "@/lib/utils";

export function GlobalAudioPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    isLoading, 
    togglePlay, 
    closePlayer, 
    progress, 
    duration, 
    seek,
    queue,
    playNext,
    playPrevious,
    currentIndex
  } = useAudio();

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const hasNext = queue.length > 0 && currentIndex < queue.length - 1;
  const hasPrev = queue.length > 0 && currentIndex > 0;

  return (
    // Fixed Positioning:
    // - bottom-[4.5rem] on mobile (to clear BottomNav)
    // - bottom-0 on desktop
    <div className="fixed bottom-[4.5rem] md:bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom-10 duration-500">
      
      {/* Glass Container */}
      <div className="glass border-t border-white/10 backdrop-blur-xl bg-background/90 md:bg-background/80 shadow-[0_-8px_30px_rgba(0,0,0,0.3)]">
        
        {/* Progress Bar (Top Edge) */}
        <div 
            className="absolute top-0 left-0 right-0 h-1 bg-secondary cursor-pointer group"
            onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const percent = x / rect.width;
                seek(percent * duration);
            }}
        >
            <div 
                className="h-full bg-gradient-to-r from-[#D4AF37] to-[#AA8C2C] relative"
                style={{ width: `${(progress / (duration || 1)) * 100}%` }}
            >
                {/* Scrub Handle (Visible on Hover) */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
        </div>

        <div className="max-w-7xl mx-auto flex items-center justify-between p-3 md:py-4 gap-4">
          
          {/* 1. Track Info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {currentTrack.imageUrl ? (
              <img 
                src={currentTrack.imageUrl} 
                alt="Cover" 
                className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-secondary object-cover shadow-sm border border-white/10" 
              />
            ) : (
              <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                <Volume2 className="h-5 w-5 text-primary" />
              </div>
            )}
            
            <div className="truncate flex-1">
              <h4 className="text-sm font-bold text-foreground truncate">{currentTrack.title}</h4>
              <p className="text-xs text-muted-foreground truncate font-medium">
                {currentTrack.author || "The Gamut"}
              </p>
            </div>
          </div>

          {/* 2. Controls (Centered) */}
          <div className="flex flex-col items-center justify-center gap-1 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0 md:flex-1">
            <div className="flex items-center gap-4 md:gap-6">
              
              {/* Previous Track (Only if in Queue) */}
              <button 
                 className={cn("text-muted-foreground hover:text-primary transition-colors hidden md:block", !hasPrev && "opacity-30 cursor-not-allowed")}
                 onClick={playPrevious}
                 disabled={!hasPrev}
              >
                  <StepBack size={20} />
              </button>

              {/* Seek Back -15s */}
              <button 
                className="hidden md:block text-muted-foreground hover:text-primary transition-colors" 
                onClick={() => seek(progress - 15)}
              >
                  <SkipBack size={18} />
              </button>
              
              {/* Main Play/Pause */}
              <Button 
                  size="icon" 
                  className={cn(
                    "h-10 w-10 md:h-12 md:w-12 rounded-full shadow-lg transition-all hover:scale-105",
                    "bg-gradient-to-br from-[#D4AF37] to-[#AA8C2C] text-white border-0"
                  )}
                  onClick={togglePlay}
              >
                {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                    <Pause className="h-5 w-5 md:h-6 md:w-6 fill-current" />
                ) : (
                    <Play className="h-5 w-5 md:h-6 md:w-6 fill-current ml-1" />
                )}
              </Button>

              {/* Seek Forward +15s */}
              <button 
                className="hidden md:block text-muted-foreground hover:text-primary transition-colors" 
                onClick={() => seek(progress + 15)}
              >
                  <SkipForward size={18} />
              </button>

              {/* Next Track (Only if in Queue) */}
              <button 
                 className={cn("text-muted-foreground hover:text-primary transition-colors", !hasNext && "opacity-30 cursor-not-allowed")}
                 onClick={playNext}
                 disabled={!hasNext}
              >
                  <StepForward size={20} />
              </button>
            </div>
          </div>

          {/* 3. Duration & Close */}
          <div className="flex items-center justify-end flex-1 gap-3 md:gap-4">
             <div className="hidden md:flex flex-col items-end text-[10px] font-mono text-muted-foreground leading-tight">
               <span>{formatTime(progress)}</span>
               <span>{formatTime(duration)}</span>
             </div>

             <Button 
               variant="ghost" 
               size="icon" 
               className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full h-8 w-8" 
               onClick={closePlayer}
             >
               <X size={18} />
             </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
