import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/utils/trpc'; // Access to your new backend
import { useToast } from '@/components/ui/use-toast'; // Shadcn Toast

// --- Types ---
export interface Track {
  id: string;
  headline: string;
  summary: string;
  source: string;
  imageUrl?: string | null;
  audioUrl?: string; // Pre-existing audio
  content?: string;  // For TTS generation if needed
}

interface AudioContextType {
  // State
  isPlaying: boolean;
  isBuffering: boolean;
  currentTrack: Track | null;
  queue: Track[];
  progress: number; // 0-100%
  currentTime: number; // seconds
  duration: number; // seconds
  playbackRate: number;
  
  // Actions
  playTrack: (track: Track) => Promise<void>;
  togglePlay: () => void;
  pauseTrack: () => void;
  seek: (time: number) => void;
  skipNext: () => void;
  skipPrev: () => void;
  addToQueue: (track: Track) => void;
  setPlaybackRate: (rate: number) => void;
  clearQueue: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // --- State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1.0);

  // --- Refs & Services ---
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  
  // tRPC Mutation for on-the-fly TTS
  const generateAudioMutation = trpc.narrative.generateAudio.useMutation();

  // --- Initialization ---
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata'; // Optimized loading
    audioRef.current = audio;

    // Event Listeners
    const updateProgress = () => {
      if (!audio.duration) return;
      setCurrentTime(audio.currentTime);
      setDuration(audio.duration);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      handleNext(); // Auto-play next
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleError = (e: any) => {
        setIsBuffering(false);
        console.error("Audio Error:", e);
        toast({
            title: "Playback Error",
            description: "Could not play this track.",
            variant: "destructive"
        });
        handleNext(); // Skip broken track
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('error', handleError);

    // Initial Mobile Setup (Unlock Audio Context)
    const unlockAudio = () => {
        audio.load();
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('error', handleError);
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Sync Playback Rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // --- Core Logic ---

  const playTrack = async (track: Track) => {
    if (!audioRef.current) return;
    
    // If clicking the same track, just toggle
    if (currentTrack?.id === track.id) {
        togglePlay();
        return;
    }

    try {
        setIsBuffering(true);
        setCurrentTrack(track);
        
        let src = track.audioUrl;

        // TTS Fallback: If no URL, generate one
        if (!src) {
            toast({ title: "Generating Audio...", description: "This takes a few seconds." });
            try {
                // Assuming your backend has this procedure mapped
                // If not, we can swap this for a direct fetch to your /api/tts endpoint
                const result = await generateAudioMutation.mutateAsync({ 
                    articleId: track.id,
                    text: track.summary // Use summary for faster generation
                });
                src = result.audioUrl;
            } catch (err) {
                console.error("TTS Failed", err);
                toast({ title: "Audio Unavailable", description: "Text-to-speech failed.", variant: "destructive" });
                setIsBuffering(false);
                return;
            }
        }

        if (src) {
            audioRef.current.src = src;
            audioRef.current.playbackRate = playbackRate;
            await audioRef.current.play();
            setIsPlaying(true);
        }

    } catch (error) {
        console.error("Play Failed:", error);
        setIsPlaying(false);
    } finally {
        setIsBuffering(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(console.error);
      setIsPlaying(true);
    }
  };

  const pauseTrack = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  // --- Queue Management ---
  
  // Internal helper to avoid closure staleness
  const handleNext = useCallback(() => {
    setQueue((prevQueue) => {
        if (prevQueue.length === 0) return prevQueue;
        const [next, ...rest] = prevQueue;
        
        // We need to trigger play for 'next', but we are inside a state updater.
        // We'll use a timeout or effect, but here simply calling the ref is safest 
        // if we update currentTrack state correctly.
        setTimeout(() => playTrack(next), 0);
        
        return rest;
    });
  }, []); // Dependencies would be recursive, so we use functional updates

  const skipNext = () => {
      if (queue.length > 0) {
          handleNext();
      } else {
          // If no queue, maybe just seek to end? 
          // For now, pause.
          pauseTrack();
          setCurrentTime(0);
      }
  };

  const skipPrev = () => {
      if (audioRef.current && audioRef.current.currentTime > 3) {
          // If > 3s in, restart track
          seek(0);
      } else {
          // Logic for previous track not implemented in basic queue 
          // (Requires a history stack, avoiding complexity for now as per instructions)
          seek(0);
      }
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
        // Prevent duplicates
        if (prev.find(t => t.id === track.id)) return prev;
        
        toast({ title: "Added to Queue", description: track.headline });
        return [...prev, track];
    });
  };
  
  const clearQueue = () => setQueue([]);
  
  const setPlaybackRate = (rate: number) => {
      setPlaybackRateState(rate);
  };

  const value = {
    isPlaying,
    isBuffering,
    currentTrack,
    queue,
    progress,
    currentTime,
    duration,
    playbackRate,
    playTrack,
    togglePlay,
    pauseTrack,
    seek,
    skipNext,
    skipPrev,
    addToQueue,
    setPlaybackRate,
    clearQueue
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
