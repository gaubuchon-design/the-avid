import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseMediaPlayerOptions {
  src?: string;
  autoPlay?: boolean;
  loop?: boolean;
  volume?: number;
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
}

export interface UseMediaPlayerReturn {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  isLoading: boolean;
  error: string | null;
  /** Buffered fraction 0-1 */
  buffered: number;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  clearError: () => void;
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
}

export function useMediaPlayer(options: UseMediaPlayerOptions = {}): UseMediaPlayerReturn {
  const {
    src,
    autoPlay = false,
    loop = false,
    volume: initialVolume = 1,
    onTimeUpdate,
    onEnded,
    onError,
  } = options;

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(initialVolume);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buffered, setBuffered] = useState(0);

  // Keep callback refs stable to avoid re-subscribing events
  const callbacksRef = useRef({ onTimeUpdate, onEnded, onError });
  callbacksRef.current = { onTimeUpdate, onEnded, onError };

  // Track previous volume for mute/unmute restore
  const prevVolumeRef = useRef(initialVolume);

  // ── Media element event listeners ────────────────────────────────────────
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handleTimeUpdate = () => {
      const t = el.currentTime;
      setCurrentTime(t);
      callbacksRef.current.onTimeUpdate?.(t);
    };

    const handleDurationChange = () => {
      if (Number.isFinite(el.duration)) {
        setDuration(el.duration);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    const handleError = () => {
      const mediaError = el.error;
      let message = 'Media failed to load';
      if (mediaError) {
        switch (mediaError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            message = 'Playback aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            message = 'Network error during media load';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            message = 'Media decode error';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            message = 'Media format not supported';
            break;
        }
      }
      setError(message);
      setIsPlaying(false);
      callbacksRef.current.onError?.(message);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      callbacksRef.current.onEnded?.();
    };

    const handleProgress = () => {
      if (el.buffered.length > 0 && el.duration > 0) {
        setBuffered(el.buffered.end(el.buffered.length - 1) / el.duration);
      }
    };

    const handleLoadedMetadata = () => {
      if (Number.isFinite(el.duration)) {
        setDuration(el.duration);
      }
    };

    const events: [string, EventListener][] = [
      ['timeupdate', handleTimeUpdate],
      ['durationchange', handleDurationChange],
      ['play', handlePlay],
      ['pause', handlePause],
      ['waiting', handleWaiting],
      ['canplay', handleCanPlay],
      ['error', handleError],
      ['ended', handleEnded],
      ['progress', handleProgress],
      ['loadedmetadata', handleLoadedMetadata],
    ];

    events.forEach(([event, handler]) => el.addEventListener(event, handler));

    return () => {
      events.forEach(([event, handler]) => el.removeEventListener(event, handler));
    };
  }, [src]); // re-attach when src changes (element may reset)

  // ── Sync src / loop / autoPlay onto the element ──────────────────────────
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    if (src !== undefined && el.src !== src) {
      el.src = src;
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      setBuffered(0);
    }
  }, [src]);

  useEffect(() => {
    const el = mediaRef.current;
    if (el) el.loop = loop;
  }, [loop]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !autoPlay || !src) return;
    el.play().catch(() => {
      // Browser may block autoplay — silently ignore
    });
  }, [autoPlay, src]);

  // ── Transport controls ───────────────────────────────────────────────────
  const play = useCallback(async () => {
    const el = mediaRef.current;
    if (!el) return;
    try {
      setError(null);
      await el.play();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Playback failed';
      setError(message);
      callbacksRef.current.onError?.(message);
    }
  }, []);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
  }, []);

  const stop = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setCurrentTime(0);
  }, []);

  const seek = useCallback((time: number) => {
    const el = mediaRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(time, el.duration || Infinity));
    el.currentTime = clamped;
    setCurrentTime(clamped);
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    const el = mediaRef.current;
    if (el) {
      el.volume = clamped;
      if (clamped > 0 && el.muted) {
        el.muted = false;
        setIsMuted(false);
      }
    }
    setVolumeState(clamped);
    prevVolumeRef.current = clamped;
  }, []);

  const toggleMute = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const willMute = !el.muted;
    el.muted = willMute;
    setIsMuted(willMute);
    if (!willMute) {
      // Restore previous volume when unmuting
      const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1;
      el.volume = restored;
      setVolumeState(restored);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    currentTime,
    duration,
    isPlaying,
    isMuted,
    volume,
    isLoading,
    error,
    buffered,
    play,
    pause,
    stop,
    seek,
    setVolume,
    toggleMute,
    clearError,
    mediaRef,
  };
}
