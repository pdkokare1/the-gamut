import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

export type AudioTrack = {
  id: string;
  url: string;
  title: string;
  author?: string;
  imageUrl?: string;
};

interface AudioContextType {
  // State
  isPlaying: boolean;
  isLoading: boolean;
  currentTrack: AudioTrack | null;
  queue: AudioTrack[];
  currentIndex: number;
  progress: number;
  duration: number;

  // Actions
  playTrack: (track: AudioTrack) => Promise<void>;
  playQueue: (tracks: AudioTrack[], startIndex?: number) => Promise<void>;
  togglePlay: () => void;
  seek: (time: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  closePlayer: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // --- State ---
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [queue, setQueue] = useState<AudioTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Helpers ---
  
  // Internal play function to handle the HTMLAudioElement
  const loadAndPlay = async (track: AudioTrack) => {
    if (!audioRef.current) return;
    
    try {
      setIsLoading(true);
      // Reset if switching tracks
      if (audioRef.current.src !== track.url) {
          audioRef.current.src = track.url;
          audioRef.current.load();
      }
      
      await audioRef.current.play();
      setIsPlaying(true);
      setCurrentTrack(track);
    } catch (err) {
      console.error("Playback failed:", err);
      toast.error("Could not play audio. It might be missing or corrupted.");
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Public Actions ---

  const playTrack = async (track: AudioTrack) => {
    // Legacy support: Playing a single track clears queue and sets this as the only item
    setQueue([track]);
    setCurrentIndex(0);
    await loadAndPlay(track);
  };

  const playQueue = async (tracks: AudioTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    
    setQueue(tracks);
    setCurrentIndex(startIndex);
    
    const trackToPlay = tracks[startIndex];
    if (trackToPlay) {
        await loadAndPlay(trackToPlay);
    }
  };

  const togglePlay = () => {
    if (audioRef.current && currentTrack) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Resume failed:", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
        setCurrentIndex(nextIndex);
        loadAndPlay(queue[nextIndex]);
    } else {
        // End of Queue
        setIsPlaying(false);
        setCurrentIndex(-1);
        setCurrentTrack(null);
        setQueue([]); // Optional: Clear queue on finish?
    }
  }, [queue, currentIndex]);

  const playPrevious = useCallback(() => {
    if (queue.length === 0) return;

    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
        setCurrentIndex(prevIndex);
        loadAndPlay(queue[prevIndex]);
    } else {
        // If at start, just restart current
        seek(0);
    }
  }, [queue, currentIndex]);

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setQueue([]);
    setCurrentIndex(-1);
  };

  // --- Effects ---

  useEffect(() => {
    // Initialize Audio Object
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const updateProgress = () => setProgress(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    
    // Auto-Play Next Logic
    const onEnded = () => {
        setIsPlaying(false);
        playNext(); 
    };

    const onError = (e: Event) => {
        console.error("Audio Error:", e);
        setIsLoading(false);
        setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError);
      audio.pause();
    };
  }, [playNext]); // Re-bind if playNext changes (which depends on queue)

  return (
    <AudioContext.Provider value={{ 
        isPlaying, 
        isLoading, 
        currentTrack, 
        queue,
        currentIndex,
        progress, 
        duration, 
        playTrack, 
        playQueue,
        togglePlay, 
        seek, 
        playNext,
        playPrevious,
        closePlayer 
    }}>
      {children}
    </AudioContext.Provider>
  );
}

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within an AudioProvider');
  return context;
};
