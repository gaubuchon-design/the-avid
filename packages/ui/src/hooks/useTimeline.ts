import { useState, useCallback, useRef, useEffect } from 'react';
import type { Timeline, Track, Clip } from '@mcua/core';
import { generateId, clamp } from '@mcua/core';

/** Frames-per-second for the playback tick. */
const TICK_FPS = 60;

export interface UseTimelineOptions {
  /** Callback fired on each playhead tick. */
  onPlayheadChange?: (time: number) => void;
  /** Callback when playback reaches the end. */
  onPlaybackEnd?: () => void;
}

export interface UseTimelineReturn {
  timeline: Timeline;
  playhead: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  seek: (seconds: number) => void;
  addTrack: (type: Track['type'], name: string) => void;
  removeTrack: (trackId: string) => void;
  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  setTimelineDuration: (duration: number) => void;
}

export function useTimeline(
  initial: Timeline,
  options: UseTimelineOptions = {},
): UseTimelineReturn {
  const [timeline, setTimeline] = useState<Timeline>(initial);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep callbacks in a ref so we never stale-close over them
  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  // ── Cleanup interval on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // ── Internal helper to stop the interval ─────────────────────────────────
  const stopInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Transport ────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    // Guard: don't start a second interval if already playing
    if (intervalRef.current !== null) return;

    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setTimeline((prev: Timeline) => {
        const step = 1 / TICK_FPS;
        const next = prev.playhead + step;

        if (next >= prev.duration) {
          // Reached the end -- stop playback
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsPlaying(false);
          callbacksRef.current.onPlaybackEnd?.();
          return { ...prev, playhead: prev.duration };
        }

        callbacksRef.current.onPlayheadChange?.(next);
        return { ...prev, playhead: next };
      });
    }, 1000 / TICK_FPS);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    stopInterval();
  }, [stopInterval]);

  const togglePlayback = useCallback(() => {
    // We read isPlaying via a functional check:
    // if the interval is running, we are playing
    if (intervalRef.current !== null) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const seek = useCallback((seconds: number) => {
    setTimeline((prev: Timeline) => {
      const clamped = clamp(seconds, 0, prev.duration);
      callbacksRef.current.onPlayheadChange?.(clamped);
      return { ...prev, playhead: clamped };
    });
  }, []);

  // ── Track management ─────────────────────────────────────────────────────
  const addTrack = useCallback((type: Track['type'], name: string) => {
    const track: Track = {
      id: generateId(),
      name,
      type,
      clips: [],
      muted: false,
      locked: false,
      volume: 1,
    };
    setTimeline((prev: Timeline) => ({ ...prev, tracks: [...prev.tracks, track] }));
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setTimeline((prev: Timeline) => ({
      ...prev,
      tracks: prev.tracks.filter((t: Track) => t.id !== trackId),
    }));
  }, []);

  // ── Clip management ──────────────────────────────────────────────────────
  const addClip = useCallback(
    (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => {
      const newClip: Clip = { ...clip, id: generateId(), trackId };
      setTimeline((prev: Timeline) => ({
        ...prev,
        tracks: prev.tracks.map((t: Track) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        ),
      }));
    },
    [],
  );

  const removeClip = useCallback((trackId: string, clipId: string) => {
    setTimeline((prev: Timeline) => ({
      ...prev,
      tracks: prev.tracks.map((t: Track) =>
        t.id === trackId
          ? { ...t, clips: t.clips.filter((c: Clip) => c.id !== clipId) }
          : t,
      ),
    }));
  }, []);

  const moveClip = useCallback(
    (clipId: string, newTrackId: string, newStartTime: number) => {
      setTimeline((prev: Timeline) => {
        let movedClip: Clip | undefined;

        // Remove from current track
        const tracks = prev.tracks.map((t: Track) => {
          const clip = t.clips.find((c: Clip) => c.id === clipId);
          if (clip) {
            const clipDuration = clip.endTime - clip.startTime;
            movedClip = {
              ...clip,
              trackId: newTrackId,
              startTime: newStartTime,
              endTime: newStartTime + clipDuration,
            };
            return { ...t, clips: t.clips.filter((c: Clip) => c.id !== clipId) };
          }
          return t;
        });

        if (!movedClip) return prev;

        // Insert into target track
        return {
          ...prev,
          tracks: tracks.map((t: Track) =>
            t.id === newTrackId
              ? { ...t, clips: [...t.clips, movedClip!] }
              : t,
          ),
        };
      });
    },
    [],
  );

  const setTimelineDuration = useCallback((duration: number) => {
    setTimeline((prev: Timeline) => ({
      ...prev,
      duration: Math.max(0, duration),
      playhead: Math.min(prev.playhead, Math.max(0, duration)),
    }));
  }, []);

  return {
    timeline,
    playhead: timeline.playhead,
    isPlaying,
    play,
    pause,
    togglePlayback,
    seek,
    addTrack,
    removeTrack,
    addClip,
    removeClip,
    moveClip,
    setTimelineDuration,
  };
}
