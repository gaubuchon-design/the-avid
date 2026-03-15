// ─── Data structures sent to the worker ──────────────────────────────────────

export interface RenderTrack {
  id: string;
  type: string;
  color: string;
  muted: boolean;
  locked: boolean;
  clips: RenderClip[];
}

export interface RenderClip {
  id: string;
  startTime: number;
  endTime: number;
  type: string;
  color: string;
  waveformData?: number[];
  selected: boolean;
}

export interface RenderMarker {
  time: number;
  color: string;
}

export interface RenderState {
  tracks: RenderTrack[];
  playheadTime: number;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
  duration: number;
  markers: RenderMarker[];
  trackHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

// ─── Main thread → Worker ────────────────────────────────────────────────────

export type MainToWorkerMsg =
  | { type: 'init'; canvas: OffscreenCanvas; dpr: number }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'update'; state: RenderState }
  | { type: 'destroy' };

// ─── Worker → Main thread ────────────────────────────────────────────────────

export type WorkerToMainMsg =
  | { type: 'ready' }
  | { type: 'frame'; time: number };
