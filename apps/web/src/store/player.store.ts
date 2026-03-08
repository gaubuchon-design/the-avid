import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { playbackEngine } from '../engine/PlaybackEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ScopeType = 'waveform' | 'vectorscope' | 'histogram' | 'parade';

interface PlayerState {
  isPlaying: boolean;
  speed: number;
  currentFrame: number;
  inPoint: number | null;
  outPoint: number | null;
  loopPlayback: boolean;
  sourceClipId: string | null;
  activeMonitor: 'source' | 'record';
  showSafeZones: boolean;
  activeScope: ScopeType | null;
}

interface PlayerActions {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekFrame: (frame: number) => void;
  setSpeed: (speed: number) => void;
  setInPoint: (frame: number | null) => void;
  setOutPoint: (frame: number | null) => void;
  clearInOut: () => void;
  toggleLoop: () => void;
  setSourceClip: (clipId: string | null) => void;
  setActiveMonitor: (monitor: 'source' | 'record') => void;
  toggleSafeZones: () => void;
  setActiveScope: (scope: ScopeType | null) => void;
  syncFromEngine: (frame: number) => void;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  immer((set) => ({
    // Initial state
    isPlaying: false,
    speed: 1,
    currentFrame: 0,
    inPoint: null,
    outPoint: null,
    loopPlayback: false,
    sourceClipId: null,
    activeMonitor: 'source',
    showSafeZones: false,
    activeScope: null,

    // Actions
    play: () => {
      playbackEngine.play();
      set((s) => {
        s.isPlaying = true;
      });
    },

    pause: () => {
      playbackEngine.pause();
      set((s) => {
        s.isPlaying = false;
      });
    },

    stop: () => {
      playbackEngine.stop();
      set((s) => {
        s.isPlaying = false;
        s.speed = 1;
        s.currentFrame = playbackEngine.currentFrame;
      });
    },

    seekFrame: (frame) => {
      playbackEngine.seekToFrame(frame);
      set((s) => {
        s.currentFrame = frame;
      });
    },

    setSpeed: (speed) => {
      playbackEngine.setSpeed(speed);
      set((s) => {
        s.speed = speed;
      });
    },

    setInPoint: (frame) => {
      if (frame !== null) playbackEngine.setInPoint(frame);
      set((s) => {
        s.inPoint = frame;
      });
    },

    setOutPoint: (frame) => {
      if (frame !== null) playbackEngine.setOutPoint(frame);
      set((s) => {
        s.outPoint = frame;
      });
    },

    clearInOut: () => {
      playbackEngine.clearInOut();
      set((s) => {
        s.inPoint = null;
        s.outPoint = null;
      });
    },

    toggleLoop: () =>
      set((s) => {
        s.loopPlayback = !s.loopPlayback;
      }),

    setSourceClip: (clipId) =>
      set((s) => {
        s.sourceClipId = clipId;
      }),

    setActiveMonitor: (monitor) =>
      set((s) => {
        s.activeMonitor = monitor;
      }),

    toggleSafeZones: () =>
      set((s) => {
        s.showSafeZones = !s.showSafeZones;
      }),

    setActiveScope: (scope) =>
      set((s) => {
        s.activeScope = scope;
      }),

    syncFromEngine: (frame) =>
      set((s) => {
        s.currentFrame = frame;
        s.isPlaying = playbackEngine.isPlaying;
        s.speed = playbackEngine.speed;
      }),
  }))
);

// Wire up engine -> store sync
playbackEngine.subscribe((frame) => {
  usePlayerStore.getState().syncFromEngine(frame);
});
