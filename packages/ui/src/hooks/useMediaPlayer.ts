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
  /** Start or resume playback. */
  play: () => Promise<void>;
  /** Pause playback. */
  pause: () => void;
  /** Toggle between play and pause. */
  togglePlayback: () => Promise<void>;
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
  /** Ref to attach to the <video> or <audio> element. */
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMediaPlayer(options: UseMediaPlayerOptions = {}): UseMediaPlayerReturn {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolumeState] = useState(options.volume ?? 1);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // Keep callback refs stable
  const onPlayRef = useRef(options.onPlay);
  const onPauseRef = useRef(options.onPause);
  const onTimeUpdateRef = useRef(options.onTimeUpdate);
  const onEndedRef = useRef(options.onEnded);
  const onErrorRef = useRef(options.onError);
  const onDurationChangeRef = useRef(options.onDurationChange);

  useEffect(() => { onPlayRef.current = options.onPlay; }, [options.onPlay]);
  useEffect(() => { onPauseRef.current = options.onPause; }, [options.onPause]);
  useEffect(() => { onTimeUpdateRef.current = options.onTimeUpdate; }, [options.onTimeUpdate]);
  useEffect(() => { onEndedRef.current = options.onEnded; }, [options.onEnded]);
  useEffect(() => { onErrorRef.current = options.onError; }, [options.onError]);
  useEffect(() => { onDurationChangeRef.current = options.onDurationChange; }, [options.onDurationChange]);

  // Attach native media event listeners
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handlers: Record<string, EventListener> = {
      timeupdate: () => {
        setCurrentTime(el.currentTime);
        onTimeUpdateRef.current?.(el.currentTime);
      },
      durationchange: () => {
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        setDuration(dur);
        onDurationChangeRef.current?.(dur);
      },
      play: () => {
        setIsPlaying(true);
        onPlayRef.current?.();
      },
      pause: () => {
        setIsPlaying(false);
        onPauseRef.current?.();
      },
      waiting: () => setIsLoading(true),
      canplay: () => {
        setIsLoading(false);
        setIsReady(true);
      },
      loadedmetadata: () => setIsReady(true),
      error: () => {
        const msg = 'Media failed to load';
        setError(msg);
        onErrorRef.current?.(msg);
      },
      ended: () => {
        setIsPlaying(false);
        onEndedRef.current?.();
      },
    };

    const entries = Object.entries(handlers);
    entries.forEach(([event, handler]) => el.addEventListener(event, handler));

    return () => {
      entries.forEach(([event, handler]) => el.removeEventListener(event, handler));
    };
  }, []);

  const play = useCallback(async () => {
    try {
      setError(null);
      await mediaRef.current?.play();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Playback failed';
      setError(msg);
      onErrorRef.current?.(msg);
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

  const seek = useCallback((time: number) => {
    if (mediaRef.current) {
      const clamped = Math.max(0, Math.min(time, mediaRef.current.duration || 0));
      mediaRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  }, []);

  const seekRelative = useCallback((offset: number) => {
    if (mediaRef.current) {
      seek(mediaRef.current.currentTime + offset);
    }
  }, [seek]);

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

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.1, Math.min(16, rate));
    if (mediaRef.current) mediaRef.current.playbackRate = clamped;
    setPlaybackRateState(clamped);
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
    play,
    pause,
    togglePlayback,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    setPlaybackRate,
    playbackRate,
    mediaRef,
  };
}
