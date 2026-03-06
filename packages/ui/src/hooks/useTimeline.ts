import { useState, useCallback, useRef } from 'react';
import type { Timeline, Track, Clip } from '@mcua/core';
import { generateId, clamp } from '@mcua/core';

export interface UseTimelineReturn {
  timeline: Timeline;
  playhead: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  addTrack: (type: Track['type'], name: string) => void;
  removeTrack: (trackId: string) => void;
  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => void;
  removeClip: (trackId: string, clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
}

export function useTimeline(initial: Timeline): UseTimelineReturn {
  const [timeline, setTimeline] = useState<Timeline>(initial);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback(() => {
    setIsPlaying(true);
    intervalRef.current = setInterval(() => {
      setTimeline((prev) => {
        const next = prev.playhead + 1 / 60; // 60fps tick
        if (next >= prev.duration) {
          clearInterval(intervalRef.current!);
          setIsPlaying(false);
          return { ...prev, playhead: 0 };
        }
        return { ...prev, playhead: next };
      });
    }, 1000 / 60);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const seek = useCallback((seconds: number) => {
    setTimeline((prev) => ({
      ...prev,
      playhead: clamp(seconds, 0, prev.duration),
    }));
  }, []);

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
          t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
        ),
      }));
    },
    []
  );

  const removeClip = useCallback((trackId: string, clipId: string) => {
    setTimeline((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t
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
            t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t
          ),
        };
      });
    },
    []
  );

  return {
    timeline,
    playhead: timeline.playhead,
    isPlaying,
    play,
    pause,
    seek,
    addTrack,
    removeTrack,
    addClip,
    removeClip,
    moveClip,
  };
}
