import { useState, useRef, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseMediaPlayerOptions {
  /** Media source URL. */
  src?: string;
  /** Auto-play on mount. Default: false. */
  autoPlay?: boolean;
  /** Loop playback. Default: false. */
  loop?: boolean;
  /** Initial volume (0-1). Default: 1. */
  volume?: number;
  /** Callback fired when the media starts playing. */
  onPlay?: () => void;
  /** Callback fired when the media is paused. */
  onPause?: () => void;
  /** Callback fired on each time update (throttled to animation frames). */
  onTimeUpdate?: (currentTime: number) => void;
  /** Callback fired when playback reaches the end. */
  onEnded?: () => void;
  /** Callback fired when a media error occurs. */
  onError?: (message: string) => void;
  /** Callback fired when the media duration is known. */
  onDurationChange?: (duration: number) => void;
}

export interface UseMediaPlayerReturn {
  /** Current playback position in seconds. */
  currentTime: number;
  /** Total duration of the media in seconds. */
  duration: number;
  /** Playback progress as a fraction (0-1). */
  progress: number;
  /** Whether the media is currently playing. */
  isPlaying: boolean;
  /** Whether the media is muted. */
  isMuted: boolean;
  /** Current volume level (0-1). */
  volume: number;
  /** Whether the media is buffering/loading. */
  isLoading: boolean;
  /** Whether the media has finished loading metadata. */
  isReady: boolean;
  /** Error message if playback failed, null otherwise. */
  error: string | null;
  /** Buffered fraction 0-1 */
  buffered: number;
  /** Start or resume playback. */
  play: () => Promise<void>;
  /** Pause playback. */
  pause: () => void;
  /** Toggle between play and pause. */
  togglePlayback: () => Promise<void>;
  /** Stop playback and reset to beginning. */
  stop: () => void;
  /** Seek to a specific time in seconds. */
  seek: (time: number) => void;
  /** Seek by a relative offset in seconds (positive = forward). */
  seekRelative: (offset: number) => void;
  /** Set the volume (0-1). */
  setVolume: (v: number) => void;
  /** Toggle mute on/off. */
  toggleMute: () => void;
  /** Set playback rate (e.g. 0.5, 1, 2). */
  setPlaybackRate: (rate: number) => void;
  /** Current playback rate. */
  playbackRate: number;
  /** Clear the current error state. */
  clearError: () => void;
  /** Ref to attach to the <video> or <audio> element. */
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMediaPlayer(options: UseMediaPlayerOptions = {}): UseMediaPlayerReturn {
  const {
    src,
    autoPlay = false,
    loop = false,
    volume: initialVolume = 1,
    onPlay,
    onPause,
    onTimeUpdate,
    onEnded,
    onError,
    onDurationChange,
  } = options;

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(initialVolume);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buffered, setBuffered] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Keep callback refs stable to avoid re-subscribing events
  const callbacksRef = useRef({ onPlay, onPause, onTimeUpdate, onEnded, onError, onDurationChange });
  callbacksRef.current = { onPlay, onPause, onTimeUpdate, onEnded, onError, onDurationChange };

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
        callbacksRef.current.onDurationChange?.(el.duration);
      }
    };

    const handlePlay = () => {
      setIsPlaying(true);
      callbacksRef.current.onPlay?.();
    };

    const handlePause = () => {
      setIsPlaying(false);
      callbacksRef.current.onPause?.();
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => {
      setIsLoading(false);
      setIsReady(true);
    };

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
      setIsReady(true);
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
      // Browser may block autoplay -- silently ignore
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

  const togglePlayback = useCallback(async () => {
    if (isPlaying) {
      pause();
    } else {
      await play();
    }
  }, [isPlaying, play, pause]);

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

  const seekRelative = useCallback((offset: number) => {
    if (mediaRef.current) {
      seek(mediaRef.current.currentTime + offset);
    }
  }, [seek]);

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

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(16, rate));
    if (mediaRef.current) mediaRef.current.playbackRate = clamped;
    setPlaybackRateState(clamped);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;

  return {
    currentTime,
    duration,
    progress,
    isPlaying,
    isMuted,
    volume,
    isLoading,
    isReady,
    error,
    buffered,
    play,
    pause,
    togglePlayback,
    stop,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    playbackRate,
    clearError,
    mediaRef,
  };
}
