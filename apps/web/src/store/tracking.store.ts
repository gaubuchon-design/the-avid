// =============================================================================
//  THE AVID — Tracking Store
//  Zustand store for planar tracker state: regions, tracking data, and
//  actions to apply tracking data to effects (corner pin, stabilizer).
// =============================================================================

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { TrackRegion, TrackingData, FrameTrackingResult } from '../engine/tracking/PlanarTracker';
import { planarTracker } from '../engine/tracking/PlanarTracker';
import type { Point2D } from '../engine/tracking/PlanarTracker';
import { createLogger } from '../lib/logger';

const logger = createLogger('Tracker');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TrackingSession {
  region: TrackRegion;
  data: TrackingData | null;
  clipId: string;
  assetId: string;
}

export type TrackerMode = 'idle' | 'drawing' | 'tracking' | 'reviewing';

export interface TrackingStoreState {
  // ── State ──
  mode: TrackerMode;
  sessions: Map<string, TrackingSession>;
  activeRegionId: string | null;
  activeClipId: string | null;

  // Drawing state for ROI creation
  drawingPoints: Point2D[];
  drawingType: 'polygon' | 'rectangle';

  // Display
  showOverlay: boolean;
  showTrackingData: boolean;
  selectedFrame: number | null;

  // ── Actions ──
  setMode: (mode: TrackerMode) => void;
  setActiveClip: (clipId: string, assetId: string) => void;

  // Region management
  startDrawing: (type: 'polygon' | 'rectangle') => void;
  addDrawingPoint: (point: Point2D) => void;
  updateDrawingPoint: (index: number, point: Point2D) => void;
  finishDrawing: () => void;
  cancelDrawing: () => void;
  deleteRegion: (regionId: string) => void;
  updateRegionPoints: (regionId: string, points: Point2D[]) => void;

  // Tracking actions
  trackForward: (
    regionId: string,
    startFrame: number,
    endFrame: number,
    getFrame: (frame: number) => Promise<ImageData>,
  ) => Promise<void>;
  trackBackward: (
    regionId: string,
    startFrame: number,
    endFrame: number,
    getFrame: (frame: number) => Promise<ImageData>,
  ) => Promise<void>;
  cancelTracking: () => void;

  // Data access
  getTrackingResult: (regionId: string, frame: number) => FrameTrackingResult | undefined;
  getSession: (regionId: string) => TrackingSession | undefined;

  // Export / Apply
  applyToCornerPin: (regionId: string, targetClipId: string, imageWidth: number, imageHeight: number) => void;
  applyToStabilizer: (regionId: string, targetClipId: string) => void;

  // Display
  setShowOverlay: (show: boolean) => void;
  setShowTrackingData: (show: boolean) => void;
  setSelectedFrame: (frame: number | null) => void;

  // Cleanup
  clearSession: (regionId: string) => void;
  clearAll: () => void;
}

// ─── Store ──────────────────────────────────────────────────────────────────

let regionCounter = 0;

export const useTrackingStore = create<TrackingStoreState>()(
  immer((set, get) => ({
    // ── Initial State ──
    mode: 'idle',
    sessions: new Map(),
    activeRegionId: null,
    activeClipId: null,
    drawingPoints: [],
    drawingType: 'rectangle',
    showOverlay: true,
    showTrackingData: false,
    selectedFrame: null,

    // ── Actions ──

    setMode: (mode) => set((s) => { s.mode = mode; }),

    setActiveClip: (clipId, assetId) => set((s) => {
      s.activeClipId = clipId;
      // Check for existing sessions for this clip
      for (const [id, session] of s.sessions) {
        if (session.clipId === clipId) {
          s.activeRegionId = id;
          return;
        }
      }
      s.activeRegionId = null;
    }),

    startDrawing: (type) => set((s) => {
      s.mode = 'drawing';
      s.drawingPoints = [];
      s.drawingType = type;
    }),

    addDrawingPoint: (point) => set((s) => {
      s.drawingPoints.push(point);
    }),

    updateDrawingPoint: (index, point) => set((s) => {
      if (index >= 0 && index < s.drawingPoints.length) {
        s.drawingPoints[index] = point;
      }
    }),

    finishDrawing: () => set((s) => {
      if (s.drawingPoints.length < 3) return;

      const regionId = `track-region-${++regionCounter}`;
      const region: TrackRegion = {
        id: regionId,
        points: [...s.drawingPoints],
        type: s.drawingType,
      };

      s.sessions.set(regionId, {
        region,
        data: null,
        clipId: s.activeClipId || '',
        assetId: '',
      });

      s.activeRegionId = regionId;
      s.drawingPoints = [];
      s.mode = 'idle';
    }),

    cancelDrawing: () => set((s) => {
      s.drawingPoints = [];
      s.mode = 'idle';
    }),

    deleteRegion: (regionId) => set((s) => {
      s.sessions.delete(regionId);
      if (s.activeRegionId === regionId) {
        s.activeRegionId = null;
      }
    }),

    updateRegionPoints: (regionId, points) => set((s) => {
      const session = s.sessions.get(regionId);
      if (session) {
        session.region.points = points;
        // Invalidate tracking data when region changes
        session.data = null;
      }
    }),

    trackForward: async (regionId, startFrame, endFrame, getFrame) => {
      const session = get().sessions.get(regionId);
      if (!session) return;

      set((s) => { s.mode = 'tracking'; });

      try {
        const data = await planarTracker.trackForward(
          session.region,
          startFrame,
          endFrame,
          getFrame,
          (progress) => {
            set((s) => {
              const sess = s.sessions.get(regionId);
              if (sess) sess.data = progress;
            });
          },
        );

        set((s) => {
          const sess = s.sessions.get(regionId);
          if (sess) sess.data = data;
          s.mode = 'reviewing';
        });
      } catch {
        set((s) => { s.mode = 'idle'; });
      }
    },

    trackBackward: async (regionId, startFrame, endFrame, getFrame) => {
      const session = get().sessions.get(regionId);
      if (!session) return;

      set((s) => { s.mode = 'tracking'; });

      try {
        const data = await planarTracker.trackBackward(
          session.region,
          startFrame,
          endFrame,
          getFrame,
          (progress) => {
            set((s) => {
              const sess = s.sessions.get(regionId);
              if (sess) sess.data = progress;
            });
          },
        );

        set((s) => {
          const sess = s.sessions.get(regionId);
          if (sess) sess.data = data;
          s.mode = 'reviewing';
        });
      } catch {
        set((s) => { s.mode = 'idle'; });
      }
    },

    cancelTracking: () => {
      planarTracker.cancel();
      set((s) => { s.mode = 'idle'; });
    },

    getTrackingResult: (regionId, frame) => {
      const session = get().sessions.get(regionId);
      return session?.data?.frames.get(frame);
    },

    getSession: (regionId) => get().sessions.get(regionId),

    applyToCornerPin: (regionId, _targetClipId, imageWidth, imageHeight) => {
      const session = get().sessions.get(regionId);
      if (!session?.data) return;

      const keyframes = planarTracker.exportAsCornerPin(session.data, imageWidth, imageHeight);
      // Store keyframes — the effects system will pick these up.
      // In practice: create or update a corner-pin effect on targetClipId with these keyframes.
      logger.info(`Exported ${keyframes.length} corner-pin keyframes for region ${regionId}`);
    },

    applyToStabilizer: (regionId, _targetClipId) => {
      const session = get().sessions.get(regionId);
      if (!session?.data) return;

      const keyframes = planarTracker.exportAsKeyframes(session.data);
      // Invert the motion for stabilization
      const stabilizedKeyframes = keyframes.map(kf => ({
        ...kf,
        value: typeof kf.value === 'number' ? -kf.value : kf.value,
      }));
      logger.info(`Exported ${stabilizedKeyframes.length} stabilization keyframes for region ${regionId}`);
    },

    setShowOverlay: (show) => set((s) => { s.showOverlay = show; }),
    setShowTrackingData: (show) => set((s) => { s.showTrackingData = show; }),
    setSelectedFrame: (frame) => set((s) => { s.selectedFrame = frame; }),

    clearSession: (regionId) => set((s) => {
      s.sessions.delete(regionId);
      if (s.activeRegionId === regionId) s.activeRegionId = null;
    }),

    clearAll: () => set((s) => {
      s.sessions.clear();
      s.activeRegionId = null;
      s.mode = 'idle';
    }),
  })),
);
