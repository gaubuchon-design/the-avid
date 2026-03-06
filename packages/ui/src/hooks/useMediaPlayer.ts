import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseMediaPlayerOptions {
  src?: string;
  autoPlay?: boolean;
  loop?: boolean;
  volume?: number;
}

export interface UseMediaPlayerReturn {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLoading: boolean;
  error: string | null;
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>;
}

export function useMediaPlayer(options: UseMediaPlayerOptions = {}): UseMediaPlayerReturn {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(options.volume ?? 1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handlers = {
      timeupdate: () => setCurrentTime(el.currentTime),
      durationchange: () => setDuration(el.duration),
      play: () => setIsPlaying(true),
      pause: () => setIsPlaying(false),
      waiting: () => setIsLoading(true),
      canplay: () => setIsLoading(false),
      error: () => setError('Media failed to load'),
      ended: () => setIsPlaying(false),
    };

    Object.entries(handlers).forEach(([event, handler]) =>
      el.addEventListener(event, handler)
    );
    return () =>
      Object.entries(handlers).forEach(([event, handler]) =>
        el.removeEventListener(event, handler)
      );
  }, []);

  const play = useCallback(async () => {
    try {
      await mediaRef.current?.play();
    } catch (err) {
      setError('Playback failed');
    }
  }, []);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
  }, []);

  const seek = useCallback((time: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    if (mediaRef.current) mediaRef.current.volume = clamped;
    setVolumeState(clamped);
  }, []);

  const toggleMute = useCallback(() => {
    if (mediaRef.current) {
      mediaRef.current.muted = !mediaRef.current.muted;
      setIsMuted(mediaRef.current.muted);
    }
  }, []);

  return {
    currentTime,
    duration,
    isPlaying,
    isMuted,
    volume,
    isLoading,
    error,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    mediaRef,
  };
}
