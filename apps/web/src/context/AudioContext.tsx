import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { toast } from 'sonner'; // Assuming you have sonner installed, or use standard alert

export type AudioTrack = {
  id: string;
  url: string;
  title: string;
  author?: string;
  imageUrl?: string;
};

interface AudioContextType {
  isPlaying: boolean;
  isLoading: boolean;
  currentTrack: AudioTrack | null;
  progress: number;
  duration: number;
  playTrack: (track: AudioTrack) => Promise<void>;
  togglePlay: () => void;
  seek: (time: number) => void;
  closePlayer: () => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;

    const updateProgress = () => setProgress(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onError = (e: Event) => {
        console.error("Audio Error:", e);
        setIsLoading(false);
        setIsPlaying(false);
        toast.error("Unable to play audio stream.");
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
  }, []);

  const playTrack = async (track: AudioTrack) => {
    if (!audioRef.current) return;

    if (!track.url) {
        toast.error("Audio not available for this article yet.");
        return;
    }

    try {
      // If same track, just toggle
      if (currentTrack?.id === track.id) {
        togglePlay();
        return;
      }

      setIsLoading(true);
      setCurrentTrack(track);
      
      audioRef.current.src = track.url;
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.error("Playback failed:", err);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
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

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentTrack(null);
  };

  return (
    <AudioContext.Provider value={{ 
        isPlaying, 
        isLoading, 
        currentTrack, 
        progress, 
        duration, 
        playTrack, 
        togglePlay, 
        seek, 
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
