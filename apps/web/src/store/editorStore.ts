import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkspaceMode = 'edit' | 'color' | 'effects' | 'audio' | 'publish';
export type ActivePanel = 'bins' | 'ai' | 'effects';

export interface TrackData {
  id: string;
  name: string;
  type: 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
  color: string;
  height: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  volume: number;
  clips: ClipData[];
}

export interface ClipData {
  id: string;
  trackId: string;
  mediaAssetId?: string;
  name: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  trimEnd: number;
  speed: number;
  color?: string;
}

export interface BinData {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  children?: BinData[];
  assets: MediaAssetData[];
  isOpen: boolean;
}

export interface MediaAssetData {
  id: string;
  name: string;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT';
  duration?: number;
  thumbnailUrl?: string;
  status: 'READY' | 'PROCESSING' | 'UPLOADING' | 'ERROR';
}

export interface TimelineState {
  id: string;
  name: string;
  duration: number;
  frameRate: number;
  tracks: TrackData[];
}

export interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;

  // Workspace
  workspace: WorkspaceMode;
  activeRightPanel: ActivePanel;

  // Playback
  playhead: number;
  isPlaying: boolean;
  sourceTimecode: number;
  recordTimecode: number;
  volume: number;
  zoom: number;

  // Selection
  selectedClips: string[];
  selectedBinId: string | null;
  selectedAssetId: string | null;

  // Timeline
  timeline: TimelineState | null;

  // Bins
  bins: BinData[];

  // UI state
  showSafeZones: boolean;
  showWaveforms: boolean;
  snapToGrid: boolean;
  aiPanelOpen: boolean;

  // Actions
  setWorkspace: (w: WorkspaceMode) => void;
  setActiveRightPanel: (p: ActivePanel) => void;
  setPlayhead: (t: number) => void;
  setIsPlaying: (v: boolean) => void;
  setZoom: (z: number) => void;
  selectClip: (id: string, multi?: boolean) => void;
  deselectAll: () => void;
  selectBin: (id: string) => void;
  selectAsset: (id: string) => void;
  toggleBin: (id: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  moveClip: (clipId: string, newStartTime: number, newTrackId: string) => void;
  splitClip: (clipId: string, atTime: number) => void;
  deleteSelectedClips: () => void;
  setTimeline: (tl: TimelineState) => void;
  setBins: (bins: BinData[]) => void;
  toggleSafeZones: () => void;
  toggleWaveforms: () => void;
  toggleSnap: () => void;
  setProjectId: (id: string, name: string) => void;
}

// ─── Mock initial data ────────────────────────────────────────────────────────

const MOCK_BINS: BinData[] = [
  {
    id: 'bin-rushes',
    name: 'Rushes',
    color: '#5b6ef4',
    isOpen: true,
    assets: [],
    children: [
      { id: 'bin-day1', name: 'Day 1', color: '#5b6ef4', isOpen: false, assets: [
        { id: 'asset-1', name: 'INT_OFFICE_001', type: 'VIDEO', duration: 124.5, status: 'READY' },
        { id: 'asset-2', name: 'INT_OFFICE_002', type: 'VIDEO', duration: 89.2, status: 'READY' },
        { id: 'asset-3', name: 'EXT_STREET_001', type: 'VIDEO', duration: 210.0, status: 'READY' },
      ]},
      { id: 'bin-day2', name: 'Day 2', color: '#5b6ef4', isOpen: false, assets: [
        { id: 'asset-4', name: 'INT_CAFE_001', type: 'VIDEO', duration: 156.0, status: 'READY' },
        { id: 'asset-5', name: 'EXT_PARK_001', type: 'VIDEO', duration: 95.3, status: 'PROCESSING' },
      ]},
      { id: 'bin-broll', name: 'B-Roll', color: '#818cf8', isOpen: false, assets: [
        { id: 'asset-6', name: 'BROLL_CITY_001', type: 'VIDEO', duration: 45.0, status: 'READY' },
        { id: 'asset-7', name: 'BROLL_NATURE_001', type: 'VIDEO', duration: 67.8, status: 'READY' },
      ]},
    ],
  },
  {
    id: 'bin-music',
    name: 'Music',
    color: '#22c896',
    isOpen: false,
    assets: [
      { id: 'asset-8', name: 'Theme_Main.wav', type: 'AUDIO', duration: 180.0, status: 'READY' },
      { id: 'asset-9', name: 'Ambient_01.wav', type: 'AUDIO', duration: 240.0, status: 'READY' },
    ],
    children: [],
  },
  {
    id: 'bin-sfx',
    name: 'SFX',
    color: '#f0a500',
    isOpen: false,
    assets: [
      { id: 'asset-10', name: 'door_slam.wav', type: 'AUDIO', duration: 1.2, status: 'READY' },
      { id: 'asset-11', name: 'phone_ring.wav', type: 'AUDIO', duration: 3.5, status: 'READY' },
    ],
    children: [],
  },
];

const MOCK_TIMELINE: TimelineState = {
  id: 'tl-1',
  name: 'Main Timeline',
  duration: 120,
  frameRate: 23.976,
  tracks: [
    {
      id: 'track-v1', name: 'V1', type: 'VIDEO', color: '#5b6ef4', height: 48,
      muted: false, locked: false, solo: false, volume: 1,
      clips: [
        { id: 'c1', trackId: 'track-v1', name: 'INT_OFFICE_001', startTime: 0, endTime: 30, trimStart: 0, trimEnd: 0, speed: 1 },
        { id: 'c2', trackId: 'track-v1', name: 'INT_OFFICE_002', startTime: 32, endTime: 58, trimStart: 0, trimEnd: 0, speed: 1 },
        { id: 'c3', trackId: 'track-v1', name: 'EXT_STREET_001', startTime: 60, endTime: 95, trimStart: 0, trimEnd: 0, speed: 1 },
        { id: 'c4', trackId: 'track-v1', name: 'INT_CAFE_001', startTime: 97, endTime: 120, trimStart: 0, trimEnd: 0, speed: 1 },
      ],
    },
    {
      id: 'track-v2', name: 'V2', type: 'VIDEO', color: '#818cf8', height: 40,
      muted: false, locked: false, solo: false, volume: 1,
      clips: [
        { id: 'c5', trackId: 'track-v2', name: 'BROLL_CITY_001', startTime: 15, endTime: 30, trimStart: 0, trimEnd: 0, speed: 1 },
        { id: 'c6', trackId: 'track-v2', name: 'BROLL_NATURE_001', startTime: 62, endTime: 80, trimStart: 0, trimEnd: 0, speed: 1 },
      ],
    },
    {
      id: 'track-a1', name: 'A1', type: 'AUDIO', color: '#22c896', height: 44,
      muted: false, locked: false, solo: false, volume: 1,
      clips: [
        { id: 'c7', trackId: 'track-a1', name: 'INT_OFFICE_001 (Sync)', startTime: 0, endTime: 30, trimStart: 0, trimEnd: 0, speed: 1 },
        { id: 'c8', trackId: 'track-a1', name: 'INT_CAFE_001 (Sync)', startTime: 97, endTime: 120, trimStart: 0, trimEnd: 0, speed: 1 },
      ],
    },
    {
      id: 'track-a2', name: 'A2', type: 'AUDIO', color: '#4ade80', height: 44,
      muted: false, locked: false, solo: false, volume: 1,
      clips: [
        { id: 'c9', trackId: 'track-a2', name: 'Theme_Main.wav', startTime: 0, endTime: 120, trimStart: 0, trimEnd: 0, speed: 1 },
      ],
    },
    {
      id: 'track-fx', name: 'FX', type: 'EFFECT', color: '#f0a500', height: 32,
      muted: false, locked: false, solo: false, volume: 1,
      clips: [],
    },
  ],
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    projectId: 'demo-project',
    projectName: 'Demo Feature Film',
    workspace: 'edit',
    activeRightPanel: 'ai',
    playhead: 14.5,
    isPlaying: false,
    sourceTimecode: 0,
    recordTimecode: 14.5,
    volume: 1,
    zoom: 8, // pixels per second
    selectedClips: [],
    selectedBinId: 'bin-day1',
    selectedAssetId: null,
    timeline: MOCK_TIMELINE,
    bins: MOCK_BINS,
    showSafeZones: true,
    showWaveforms: true,
    snapToGrid: true,
    aiPanelOpen: false,

    setWorkspace: (w) => set((s) => { s.workspace = w; }),
    setActiveRightPanel: (p) => set((s) => { s.activeRightPanel = p; }),
    setPlayhead: (t) => set((s) => { s.playhead = t; s.recordTimecode = t; }),
    setIsPlaying: (v) => set((s) => { s.isPlaying = v; }),
    setZoom: (z) => set((s) => { s.zoom = Math.max(2, Math.min(50, z)); }),

    selectClip: (id, multi = false) => set((s) => {
      if (multi) {
        const idx = s.selectedClips.indexOf(id);
        if (idx >= 0) s.selectedClips.splice(idx, 1);
        else s.selectedClips.push(id);
      } else {
        s.selectedClips = [id];
      }
    }),

    deselectAll: () => set((s) => { s.selectedClips = []; }),

    selectBin: (id) => set((s) => { s.selectedBinId = id; s.selectedAssetId = null; }),
    selectAsset: (id) => set((s) => { s.selectedAssetId = id; }),

    toggleBin: (id) => set((s) => {
      const toggle = (bins: BinData[]): boolean => {
        for (const b of bins) {
          if (b.id === id) { b.isOpen = !b.isOpen; return true; }
          if (b.children && toggle(b.children)) return true;
        }
        return false;
      };
      toggle(s.bins);
    }),

    toggleTrackMute: (trackId) => set((s) => {
      const t = s.timeline?.tracks.find((tr) => tr.id === trackId);
      if (t) t.muted = !t.muted;
    }),

    toggleTrackLock: (trackId) => set((s) => {
      const t = s.timeline?.tracks.find((tr) => tr.id === trackId);
      if (t) t.locked = !t.locked;
    }),

    toggleTrackSolo: (trackId) => set((s) => {
      const t = s.timeline?.tracks.find((tr) => tr.id === trackId);
      if (t) t.solo = !t.solo;
    }),

    moveClip: (clipId, newStartTime, newTrackId) => set((s) => {
      if (!s.timeline) return;
      for (const track of s.timeline.tracks) {
        const ci = track.clips.findIndex((c) => c.id === clipId);
        if (ci >= 0) {
          const [clip] = track.clips.splice(ci, 1);
          const duration = clip.endTime - clip.startTime;
          clip.startTime = newStartTime;
          clip.endTime = newStartTime + duration;
          clip.trackId = newTrackId;
          const destTrack = s.timeline.tracks.find((t) => t.id === newTrackId);
          if (destTrack) destTrack.clips.push(clip);
          return;
        }
      }
    }),

    splitClip: (clipId, atTime) => set((s) => {
      if (!s.timeline) return;
      for (const track of s.timeline.tracks) {
        const clip = track.clips.find((c) => c.id === clipId);
        if (clip && atTime > clip.startTime && atTime < clip.endTime) {
          const newClip: ClipData = {
            ...clip,
            id: `${clipId}-split-${Date.now()}`,
            startTime: atTime,
          };
          clip.endTime = atTime;
          track.clips.push(newClip);
          return;
        }
      }
    }),

    deleteSelectedClips: () => set((s) => {
      if (!s.timeline || !s.selectedClips.length) return;
      for (const track of s.timeline.tracks) {
        track.clips = track.clips.filter((c) => !s.selectedClips.includes(c.id));
      }
      s.selectedClips = [];
    }),

    setTimeline: (tl) => set((s) => { s.timeline = tl; }),
    setBins: (bins) => set((s) => { s.bins = bins; }),
    toggleSafeZones: () => set((s) => { s.showSafeZones = !s.showSafeZones; }),
    toggleWaveforms: () => set((s) => { s.showWaveforms = !s.showWaveforms; }),
    toggleSnap: () => set((s) => { s.snapToGrid = !s.snapToGrid; }),
    setProjectId: (id, name) => set((s) => { s.projectId = id; s.projectName = name; }),
  }))
);
