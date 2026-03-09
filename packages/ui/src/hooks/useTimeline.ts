import { useState, useCallback, useRef, useEffect } from 'react';
import type { Timeline, Track, Clip } from '@mcua/core';
import { generateId, clamp } from '@mcua/core';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Options for configuring timeline playback behavior. */
export interface UseTimelineOptions {
  /** Frames per second for playback tick rate. Default: 60. */
  fps?: number;
  /** Whether playback should loop when reaching the end. Default: false. */
  loop?: boolean;
  /** Callback fired on each playhead position change during playback. */
  onPlayheadChange?: (seconds: number) => void;
  /** Callback fired when playback reaches the end (or loops). */
  onPlaybackEnd?: () => void;
}

export interface UseTimelineReturn {
  /** Current timeline state (tracks, duration, playhead, etc.). */
  timeline: Timeline;
  /** Current playhead position in seconds. */
  playhead: number;
  /** Whether the timeline is currently playing. */
  isPlaying: boolean;
  /** Duration of the timeline in seconds. */
  duration: number;
  /** Start playback from current playhead position. */
  play: () => void;
  /** Pause playback, keeping current playhead position. */
  pause: () => void;
  /** Toggle between play and pause. */
  togglePlayback: () => void;
  /** Stop playback and reset playhead to 0. */
  stop: () => void;
  /** Seek to a specific time in seconds. */
  seek: (seconds: number) => void;
  /** Step forward by N frames (default: 1). */
  stepForward: (frames?: number) => void;
  /** Step backward by N frames (default: 1). */
  stepBackward: (frames?: number) => void;
  /** Add a new track to the timeline. */
  addTrack: (type: Track['type'], name: string) => void;
  /** Remove a track by ID. */
  removeTrack: (trackId: string) => void;
  /** Add a clip to a specific track. */
  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => void;
  /** Remove a clip from a track. */
  removeClip: (trackId: string, clipId: string) => void;
  /** Move a clip to a new track and/or start time. */
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  /** Update the entire timeline state (e.g., after external modification). */
  setTimeline: React.Dispatch<React.SetStateAction<Timeline>>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTimeline(
  initial: Timeline,
  options: UseTimelineOptions = {},
): UseTimelineReturn {
  const { fps = 60, loop = false, onPlayheadChange, onPlaybackEnd } = options;

  const [timeline, setTimeline] = useState<Timeline>(initial);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onPlayheadChangeRef = useRef(onPlayheadChange);
  const onPlaybackEndRef = useRef(onPlaybackEnd);

  // Keep callback refs current without re-creating interval
  useEffect(() => {
    onPlayheadChangeRef.current = onPlayheadChange;
  }, [onPlayheadChange]);

  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
  }, [onPlaybackEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const play = useCallback(() => {
    if (intervalRef.current) return; // Already playing
    setIsPlaying(true);
    const frameDuration = 1 / fps;

    intervalRef.current = setInterval(() => {
      setTimeline((prev) => {
        const next = prev.playhead + frameDuration;

        if (next >= prev.duration) {
          if (loop) {
            const looped = next % prev.duration;
            onPlayheadChangeRef.current?.(looped);
            return { ...prev, playhead: looped };
          }

          // End of timeline
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          setIsPlaying(false);
          onPlaybackEndRef.current?.();
          return { ...prev, playhead: prev.duration };
        }

        onPlayheadChangeRef.current?.(next);
        return { ...prev, playhead: next };
      });
    }, 1000 / fps);
  }, [fps, loop]);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const stop = useCallback(() => {
    pause();
    setTimeline((prev) => ({ ...prev, playhead: 0 }));
    onPlayheadChangeRef.current?.(0);
  }, [pause]);

  const seek = useCallback((seconds: number) => {
    setTimeline((prev) => {
      const clamped = clamp(seconds, 0, prev.duration);
      onPlayheadChangeRef.current?.(clamped);
      return { ...prev, playhead: clamped };
    });
  }, []);

  const stepForward = useCallback((frames: number = 1) => {
    const frameDuration = 1 / fps;
    seek(timeline.playhead + frameDuration * frames);
  }, [fps, timeline.playhead, seek]);

  const stepBackward = useCallback((frames: number = 1) => {
    const frameDuration = 1 / fps;
    seek(timeline.playhead - frameDuration * frames);
  }, [fps, timeline.playhead, seek]);

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
    setTimeline((prev) => ({ ...prev, tracks: [...prev.tracks, track] }));
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.id !== trackId),
    }));
  }, []);

  const addClip = useCallback(
    (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => {
      const newClip: Clip = { ...clip, id: generateId(), trackId };
      setTimeline((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) =>
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t,
        ),
      }));
    },
    [],
  );

  const removeClip = useCallback((trackId: string, clipId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t,
      ),
    }));
  }, []);

  const moveClip = useCallback(
    (clipId: string, newTrackId: string, newStartTime: number) => {
      setTimeline((prev) => {
        let movedClip: Clip | undefined;
        const tracks = prev.tracks.map((t) => {
          const clip = t.clips.find((c) => c.id === clipId);
          if (clip) {
            movedClip = { ...clip, trackId: newTrackId, startTime: newStartTime };
            return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
          }
          return t;
        });
        if (!movedClip) return prev;
        return {
          ...prev,
          tracks: tracks.map((t) =>
            t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t,
          ),
        };
      });
    },
    [],
  );

  return {
    timeline,
    playhead: timeline.playhead,
    isPlaying,
    duration: timeline.duration,
    play,
    pause,
    togglePlayback,
    stop,
    seek,
    stepForward,
    stepBackward,
    addTrack,
    removeTrack,
    addClip,
    removeClip,
    moveClip,
    setTimeline,
  };
}
