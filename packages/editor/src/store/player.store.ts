import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { getStoreDevtoolsOptions } from '../lib/runtimeEnvironment';

// ─── Types ─────────────────────────────────────────────────────────────────────
//
// Player store manages SOURCE MONITOR state only.
// Timeline playback is managed by editor.store.ts via PlaybackEngine.
// This store is decoupled — it just sets boolean flags. The SourceMonitor
// component reacts to isPlaying by calling video.play()/pause() directly.

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

      // Actions — pure state setters; SourceMonitor reacts via useEffect
      play: () =>
        set(
          (s) => {
            s.isPlaying = true;
          },
          false,
          'player/play'
        ),

      pause: () =>
        set(
          (s) => {
            s.isPlaying = false;
          },
          false,
          'player/pause'
        ),

      stop: () =>
        set(
          (s) => {
            s.isPlaying = false;
            s.speed = 1;
            s.currentFrame = 0;
          },
          false,
          'player/stop'
        ),

      togglePlayPause: () => {
        const isCurrentlyPlaying = usePlayerStore.getState().isPlaying;
        if (isCurrentlyPlaying) {
          set(
            (s) => {
              s.isPlaying = false;
            },
            false,
            'player/togglePlayPause'
          );
        } else {
          set(
            (s) => {
              s.isPlaying = true;
            },
            false,
            'player/togglePlayPause'
          );
        }
      },

      seekFrame: (frame) =>
        set(
          (s) => {
            s.currentFrame = frame;
          },
          false,
          'player/seekFrame'
        ),

      setSpeed: (speed) =>
        set(
          (s) => {
            s.speed = Math.max(-8, Math.min(8, speed));
          },
          false,
          'player/setSpeed'
        ),

      setInPoint: (frame) =>
        set(
          (s) => {
            s.inPoint = frame;
          },
          false,
          'player/setInPoint'
        ),

      setOutPoint: (frame) =>
        set(
          (s) => {
            s.outPoint = frame;
          },
          false,
          'player/setOutPoint'
        ),

      clearInOut: () =>
        set(
          (s) => {
            s.inPoint = null;
            s.outPoint = null;
          },
          false,
          'player/clearInOut'
        ),

      toggleLoop: () =>
        set(
          (s) => {
            s.loopPlayback = !s.loopPlayback;
          },
          false,
          'player/toggleLoop'
        ),

      setSourceClip: (clipId) =>
        set(
          (s) => {
            s.sourceClipId = clipId;
          },
          false,
          'player/setSourceClip'
        ),

      setActiveMonitor: (monitor) =>
        set(
          (s) => {
            s.activeMonitor = monitor;
          },
          false,
          'player/setActiveMonitor'
        ),

      toggleSafeZones: () =>
        set(
          (s) => {
            s.showSafeZones = !s.showSafeZones;
          },
          false,
          'player/toggleSafeZones'
        ),

      setActiveScope: (scope) =>
        set(
          (s) => {
            s.activeScope = scope;
          },
          false,
          'player/setActiveScope'
        ),

      syncFromEngine: (frame) =>
        set(
          (s) => {
            s.currentFrame = frame;
          },
          false,
          'player/syncFromEngine'
        ),

      resetStore: () => set(() => ({ ...INITIAL_STATE }), true, 'player/resetStore'),
    })),
    getStoreDevtoolsOptions('PlayerStore')
  )
);

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
  state.inPoint !== null && state.outPoint !== null ? state.outPoint - state.inPoint : null;
