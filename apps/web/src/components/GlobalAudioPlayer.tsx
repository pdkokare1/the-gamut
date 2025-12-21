import { useAudio } from "../context/AudioContext";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider"; // Ensure you have a slider or use standard input
import { Play, Pause, X, SkipBack, SkipForward } from "lucide-react";

export function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, togglePlay, closePlayer, progress, duration, seek } = useAudio();

  if (!currentTrack) return null;

  const formatTime = (time: number) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 md:bottom-0 md:left-64 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] p-3">
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        
        {/* Track Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {currentTrack.imageUrl && (
            <img src={currentTrack.imageUrl} alt="Cover" className="h-10 w-10 rounded bg-slate-100 object-cover" />
          )}
          <div className="truncate">
            <h4 className="text-sm font-bold text-slate-900 truncate">{currentTrack.title}</h4>
            <p className="text-xs text-slate-500 truncate">{currentTrack.author || "The Gamut Audio"}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center flex-1">
          <div className="flex items-center gap-4">
            <button className="text-slate-400 hover:text-slate-600" onClick={() => seek(progress - 15)}>
                <SkipBack size={20} />
            </button>
            <Button 
                size="icon" 
                className="h-10 w-10 rounded-full shadow-md bg-indigo-600 hover:bg-indigo-700 text-white" 
                onClick={togglePlay}
            >
              {isPlaying ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
            </Button>
            <button className="text-slate-400 hover:text-slate-600" onClick={() => seek(progress + 15)}>
                <SkipForward size={20} />
            </button>
          </div>
        </div>

        {/* Progress & Close */}
        <div className="hidden md:flex items-center gap-3 w-1/3">
             <span className="text-xs text-slate-400 w-10 text-right">{formatTime(progress)}</span>
             <input 
                type="range" 
                min={0} 
                max={duration || 100} 
                value={progress} 
                onChange={(e) => seek(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
             />
             <span className="text-xs text-slate-400 w-10">{formatTime(duration)}</span>
        </div>

        <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-500" onClick={closePlayer}>
          <X size={18} />
        </Button>
      </div>
      
      {/* Mobile Progress Bar (Visible only on small screens) */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-1 bg-slate-100">
         <div 
            className="h-full bg-indigo-600 transition-all duration-300" 
            style={{ width: `${(progress / (duration || 1)) * 100}%` }}
         />
      </div>
    </div>
  );
}
