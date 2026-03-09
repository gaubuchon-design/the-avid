import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
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
  togglePlayPause: () => void;
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
  resetStore: () => void;
}

// ─── Initial State ─────────────────────────────────────────────────────────────

const INITIAL_STATE: PlayerState = {
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
};

// ─── Store ─────────────────────────────────────────────────────────────────────

export const usePlayerStore = create<PlayerState & PlayerActions>()(
  devtools(
    immer((set) => ({
      // Initial state
      ...INITIAL_STATE,

      // Actions
      play: () => {
        playbackEngine.play();
        set((s) => {
          s.isPlaying = true;
        }, false, 'player/play');
      },

      pause: () => {
        playbackEngine.pause();
        set((s) => {
          s.isPlaying = false;
        }, false, 'player/pause');
      },

      stop: () => {
        playbackEngine.stop();
        set((s) => {
          s.isPlaying = false;
          s.speed = 1;
          s.currentFrame = playbackEngine.currentFrame;
        }, false, 'player/stop');
      },

      togglePlayPause: () => {
        const isCurrentlyPlaying = usePlayerStore.getState().isPlaying;
        if (isCurrentlyPlaying) {
          playbackEngine.pause();
          set((s) => { s.isPlaying = false; }, false, 'player/togglePlayPause');
        } else {
          playbackEngine.play();
          set((s) => { s.isPlaying = true; }, false, 'player/togglePlayPause');
        }
      },

      seekFrame: (frame) => {
        playbackEngine.seekToFrame(frame);
        set((s) => {
          s.currentFrame = frame;
        }, false, 'player/seekFrame');
      },

      setSpeed: (speed) => {
        playbackEngine.setSpeed(speed);
        set((s) => {
          s.speed = speed;
        }, false, 'player/setSpeed');
      },

      setInPoint: (frame) => {
        if (frame !== null) playbackEngine.setInPoint(frame);
        set((s) => {
          s.inPoint = frame;
        }, false, 'player/setInPoint');
      },

      setOutPoint: (frame) => {
        if (frame !== null) playbackEngine.setOutPoint(frame);
        set((s) => {
          s.outPoint = frame;
        }, false, 'player/setOutPoint');
      },

      clearInOut: () => {
        playbackEngine.clearInOut();
        set((s) => {
          s.inPoint = null;
          s.outPoint = null;
        }, false, 'player/clearInOut');
      },

      toggleLoop: () =>
        set((s) => {
          s.loopPlayback = !s.loopPlayback;
        }, false, 'player/toggleLoop'),

      setSourceClip: (clipId) =>
        set((s) => {
          s.sourceClipId = clipId;
        }, false, 'player/setSourceClip'),

      setActiveMonitor: (monitor) =>
        set((s) => {
          s.activeMonitor = monitor;
        }, false, 'player/setActiveMonitor'),

      toggleSafeZones: () =>
        set((s) => {
          s.showSafeZones = !s.showSafeZones;
        }, false, 'player/toggleSafeZones'),

      setActiveScope: (scope) =>
        set((s) => {
          s.activeScope = scope;
        }, false, 'player/setActiveScope'),

      syncFromEngine: (frame) =>
        set((s) => {
          s.currentFrame = frame;
          s.isPlaying = playbackEngine.isPlaying;
          s.speed = playbackEngine.speed;
        }, false, 'player/syncFromEngine'),

      resetStore: () => {
        playbackEngine.stop();
        set(() => ({ ...INITIAL_STATE }), true, 'player/resetStore');
      },
    })),
    { name: 'PlayerStore', enabled: process.env["NODE_ENV"] === 'development' },
  )
);

// Wire up engine -> store sync
playbackEngine.subscribe((frame) => {
  usePlayerStore.getState().syncFromEngine(frame);
});

// ─── Named Selectors ────────────────────────────────────────────────────────

type PlayerStoreState = PlayerState & PlayerActions;

export const selectIsPlaying = (state: PlayerStoreState) => state.isPlaying;
export const selectPlaybackSpeed = (state: PlayerStoreState) => state.speed;
export const selectCurrentFrame = (state: PlayerStoreState) => state.currentFrame;
export const selectPlayerInPoint = (state: PlayerStoreState) => state.inPoint;
export const selectPlayerOutPoint = (state: PlayerStoreState) => state.outPoint;
export const selectLoopPlayback = (state: PlayerStoreState) => state.loopPlayback;
export const selectSourceClipId = (state: PlayerStoreState) => state.sourceClipId;
export const selectActiveMonitor = (state: PlayerStoreState) => state.activeMonitor;
export const selectShowSafeZones = (state: PlayerStoreState) => state.showSafeZones;
export const selectActiveScope = (state: PlayerStoreState) => state.activeScope;
export const selectHasInOutRange = (state: PlayerStoreState) =>
  state.inPoint !== null && state.outPoint !== null;
export const selectInOutDuration = (state: PlayerStoreState) =>
  state.inPoint !== null && state.outPoint !== null
    ? state.outPoint - state.inPoint
    : null;
