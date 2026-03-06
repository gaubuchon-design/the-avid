import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TrackType = 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
export type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish';
export type WorkspaceTab = 'video' | 'audio' | 'color' | 'ai';

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  trimEnd: number;
  type: 'video' | 'audio' | 'effect' | 'subtitle';
  color?: string;
  waveformData?: number[];
  assetId?: string;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  sortOrder: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  volume: number;
  clips: Clip[];
  color: string;
}

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'DOCUMENT';
  duration?: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';
  thumbnailUrl?: string;
  playbackUrl?: string;
  waveformData?: number[];
  tags: string[];
  isFavorite: boolean;
}

export interface Bin {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  children: Bin[];
  assets: MediaAsset[];
  isOpen: boolean;
}

export interface CollabUser {
  id: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  playheadTime?: number;
}

export interface AIJob {
  id: string;
  type: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  resultSummary?: string;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;

  // Timeline
  timelineId: string | null;
  tracks: Track[];
  markers: Marker[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;           // pixels per second
  scrollLeft: number;
  duration: number;

  // Selection
  selectedClipIds: string[];
  selectedTrackId: string | null;

  // Bins
  bins: Bin[];
  selectedBinId: string | null;
  activeBinAssets: MediaAsset[];

  // Monitors
  sourceAsset: MediaAsset | null;
  inPoint: number | null;
  outPoint: number | null;
  showSafeZones: boolean;

  // UI State
  activePanel: PanelType;
  activeInspectorTab: WorkspaceTab;
  showAIPanel: boolean;
  showCollabPanel: boolean;
  isFullscreen: boolean;

  // Collaboration
  collabUsers: CollabUser[];

  // AI
  aiJobs: AIJob[];
  tokenBalance: number;

  // Playback
  volume: number;
  isMuted: boolean;
}

interface EditorActions {
  // Timeline
  setPlayhead: (t: number) => void;
  togglePlay: () => void;
  setZoom: (z: number) => void;
  setScrollLeft: (x: number) => void;

  // Tracks
  toggleMute: (trackId: string) => void;
  toggleSolo: (trackId: string) => void;
  toggleLock: (trackId: string) => void;
  setTrackVolume: (trackId: string, v: number) => void;
  selectTrack: (id: string | null) => void;

  // Clips
  addClip: (clip: Clip) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStart: number) => void;
  trimClip: (clipId: string, side: 'left' | 'right', time: number) => void;
  splitClip: (clipId: string, time: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  clearSelection: () => void;

  // Bins
  selectBin: (id: string) => void;
  toggleBin: (id: string) => void;
  setSourceAsset: (asset: MediaAsset | null) => void;

  // Monitor
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  toggleSafeZones: () => void;

  // UI
  setActivePanel: (p: PanelType) => void;
  setInspectorTab: (t: WorkspaceTab) => void;
  toggleAIPanel: () => void;
  toggleCollabPanel: () => void;

  // Audio
  setVolume: (v: number) => void;
  toggleMuteAll: () => void;

  // Init
  loadProject: (projectId: string) => void;
}

// Waveform generator (random for demo)
function genWaveform(len = 100) {
  return Array.from({ length: len }, (_, i) =>
    Math.sin(i * 0.15) * 0.4 + Math.random() * 0.5 + 0.1
  );
}

// ─── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_TRACKS: Track[] = [
  {
    id: 't1', name: 'V1', type: 'VIDEO', sortOrder: 0, muted: false, locked: false, solo: false, volume: 1,
    color: '#5b6af5',
    clips: [
      { id: 'c1', trackId: 't1', name: 'INT. OFFICE - DAY', startTime: 0, endTime: 8.5, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c2', trackId: 't1', name: 'EXT. ROOFTOP - SUNSET', startTime: 10, endTime: 21, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c3', trackId: 't1', name: 'INT. HALLWAY - NIGHT', startTime: 23, endTime: 34, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't2', name: 'V2', type: 'VIDEO', sortOrder: 1, muted: false, locked: false, solo: false, volume: 1,
    color: '#818cf8',
    clips: [
      { id: 'c4', trackId: 't2', name: 'B-Roll: City', startTime: 4, endTime: 9, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c5', trackId: 't2', name: 'B-Roll: Sky', startTime: 14, endTime: 19, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't3', name: 'A1', type: 'AUDIO', sortOrder: 2, muted: false, locked: false, solo: false, volume: 0.85,
    color: '#2bb672',
    clips: [
      { id: 'c6', trackId: 't3', name: 'Dialogue Track', startTime: 0, endTime: 34, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
    ],
  },
  {
    id: 't4', name: 'A2', type: 'AUDIO', sortOrder: 3, muted: false, locked: false, solo: false, volume: 0.6,
    color: '#4ade80',
    clips: [
      { id: 'c7', trackId: 't4', name: 'Ambient Music', startTime: 0, endTime: 34, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
    ],
  },
  {
    id: 't5', name: 'FX', type: 'EFFECT', sortOrder: 4, muted: false, locked: false, solo: false, volume: 1,
    color: '#e8943a',
    clips: [],
  },
  {
    id: 't6', name: 'SUB', type: 'SUBTITLE', sortOrder: 5, muted: false, locked: false, solo: false, volume: 1,
    color: '#6bc5e3',
    clips: [
      { id: 'c8', trackId: 't6', name: 'Subtitles', startTime: 0, endTime: 34, trimStart: 0, trimEnd: 0, type: 'subtitle' },
    ],
  },
];

const DEMO_BINS: Bin[] = [
  {
    id: 'b1', name: 'Rushes', color: '#5b6af5', isOpen: true, children: [
      { id: 'b1a', name: 'Day 1', color: '#818cf8', isOpen: false, children: [], assets: [
        { id: 'a1', name: 'Scene 01 - Take 01', type: 'VIDEO', duration: 45.2, status: 'READY', tags: ['dialogue'], isFavorite: true },
        { id: 'a2', name: 'Scene 01 - Take 02', type: 'VIDEO', duration: 48.7, status: 'READY', tags: ['dialogue'], isFavorite: false },
        { id: 'a3', name: 'Scene 02 - Take 01', type: 'VIDEO', duration: 22.1, status: 'READY', tags: ['action'], isFavorite: false },
      ]},
      { id: 'b1b', name: 'Day 2', color: '#818cf8', isOpen: false, children: [], assets: [
        { id: 'a4', name: 'Scene 03 - Wide', type: 'VIDEO', duration: 67.5, status: 'READY', tags: ['wide-shot'], isFavorite: false },
        { id: 'a5', name: 'Scene 03 - Close', type: 'VIDEO', duration: 31.2, status: 'READY', tags: ['close-up'], isFavorite: false },
      ]},
      { id: 'b1c', name: 'B-Roll', color: '#818cf8', isOpen: false, children: [], assets: [
        { id: 'a6', name: 'City Timelapse', type: 'VIDEO', duration: 12.0, status: 'READY', tags: ['broll', 'city'], isFavorite: true },
        { id: 'a7', name: 'Sky Clouds', type: 'VIDEO', duration: 8.5, status: 'READY', tags: ['broll'], isFavorite: false },
      ]},
    ],
    assets: [],
  },
  {
    id: 'b2', name: 'Music', color: '#2bb672', isOpen: false, children: [], assets: [
      { id: 'a8', name: 'Main Theme', type: 'AUDIO', duration: 180.0, status: 'READY', tags: ['music'], isFavorite: true },
      { id: 'a9', name: 'Tension Underscore', type: 'AUDIO', duration: 90.0, status: 'READY', tags: ['music', 'tension'], isFavorite: false },
    ],
  },
  {
    id: 'b3', name: 'Graphics', color: '#e8943a', isOpen: false, children: [], assets: [
      { id: 'a10', name: 'Title Card', type: 'IMAGE', status: 'READY', tags: ['graphics'], isFavorite: false },
      { id: 'a11', name: 'Lower Third', type: 'IMAGE', status: 'READY', tags: ['graphics'], isFavorite: false },
    ],
  },
  { id: 'b4', name: 'Selects', color: '#e05b8e', isOpen: false, children: [], assets: [] },
];

// ─── Store creation ────────────────────────────────────────────────────────────
export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    // Initial state
    projectId: null,
    projectName: 'Demo Feature Film',
    timelineId: null,
    tracks: DEMO_TRACKS,
    markers: [
      { id: 'm1', time: 8.5, label: 'Scene 1 End', color: '#f59e0b' },
      { id: 'm2', time: 22, label: 'Act Break', color: '#ef4444' },
    ],
    playheadTime: 0,
    isPlaying: false,
    zoom: 60,
    scrollLeft: 0,
    duration: 34,
    selectedClipIds: [],
    selectedTrackId: null,
    bins: DEMO_BINS,
    selectedBinId: 'b1a',
    activeBinAssets: DEMO_BINS[0].children[0].assets,
    sourceAsset: null,
    inPoint: null,
    outPoint: null,
    showSafeZones: false,
    activePanel: 'edit',
    activeInspectorTab: 'video',
    showAIPanel: false,
    showCollabPanel: false,
    isFullscreen: false,
    collabUsers: [
      { id: 'u1', displayName: 'Sarah K.', color: '#7c5cfc' },
      { id: 'u2', displayName: 'Marcus T.', color: '#2bb672' },
    ],
    aiJobs: [],
    tokenBalance: 487,
    volume: 0.8,
    isMuted: false,

    // Actions
    setPlayhead: (t) => set((s) => { s.playheadTime = Math.max(0, Math.min(t, s.duration)); }),
    togglePlay: () => set((s) => { s.isPlaying = !s.isPlaying; }),
    setZoom: (z) => set((s) => { s.zoom = Math.max(10, Math.min(300, z)); }),
    setScrollLeft: (x) => set((s) => { s.scrollLeft = Math.max(0, x); }),

    toggleMute: (id) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.muted = !t.muted;
    }),
    toggleSolo: (id) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.solo = !t.solo;
    }),
    toggleLock: (id) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.locked = !t.locked;
    }),
    setTrackVolume: (id, v) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.volume = v;
    }),
    selectTrack: (id) => set((s) => { s.selectedTrackId = id; }),

    addClip: (clip) => set((s) => {
      const track = s.tracks.find(t => t.id === clip.trackId);
      if (track) track.clips.push(clip);
    }),
    removeClip: (clipId) => set((s) => {
      s.tracks.forEach(t => { t.clips = t.clips.filter(c => c.id !== clipId); });
    }),
    moveClip: (clipId, newTrackId, newStart) => set((s) => {
      let movedClip: Clip | undefined;
      s.tracks.forEach(t => {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) { movedClip = { ...t.clips[idx] }; t.clips.splice(idx, 1); }
      });
      if (movedClip) {
        const dur = movedClip.endTime - movedClip.startTime;
        movedClip.startTime = newStart;
        movedClip.endTime = newStart + dur;
        movedClip.trackId = newTrackId;
        const target = s.tracks.find(t => t.id === newTrackId);
        if (target) target.clips.push(movedClip);
      }
    }),
    trimClip: (clipId, side, time) => set((s) => {
      s.tracks.forEach(t => {
        const c = t.clips.find(c => c.id === clipId);
        if (c) {
          if (side === 'left') c.startTime = Math.min(time, c.endTime - 0.1);
          else c.endTime = Math.max(time, c.startTime + 0.1);
        }
      });
    }),
    splitClip: (clipId, time) => set((s) => {
      s.tracks.forEach(t => {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const orig = t.clips[idx];
          if (time <= orig.startTime || time >= orig.endTime) return;
          const newClip: Clip = { ...orig, id: `${orig.id}_split_${Date.now()}`, startTime: time };
          orig.endTime = time;
          t.clips.splice(idx + 1, 0, newClip);
        }
      });
    }),
    selectClip: (clipId, multi = false) => set((s) => {
      if (multi) {
        const idx = s.selectedClipIds.indexOf(clipId);
        if (idx >= 0) s.selectedClipIds.splice(idx, 1);
        else s.selectedClipIds.push(clipId);
      } else {
        s.selectedClipIds = [clipId];
      }
    }),
    clearSelection: () => set((s) => { s.selectedClipIds = []; }),

    selectBin: (id) => set((s) => {
      s.selectedBinId = id;
      const findAssets = (bins: Bin[]): MediaAsset[] => {
        for (const b of bins) {
          if (b.id === id) return b.assets;
          const found = findAssets(b.children);
          if (found.length) return found;
        }
        return [];
      };
      s.activeBinAssets = findAssets(s.bins);
    }),
    toggleBin: (id) => set((s) => {
      const toggle = (bins: Bin[]) => {
        for (const b of bins) {
          if (b.id === id) { b.isOpen = !b.isOpen; return; }
          toggle(b.children);
        }
      };
      toggle(s.bins);
    }),
    setSourceAsset: (asset) => set((s) => { s.sourceAsset = asset; }),
    setInPoint: (t) => set((s) => { s.inPoint = t; }),
    setOutPoint: (t) => set((s) => { s.outPoint = t; }),
    toggleSafeZones: () => set((s) => { s.showSafeZones = !s.showSafeZones; }),
    setActivePanel: (p) => set((s) => { s.activePanel = p; }),
    setInspectorTab: (t) => set((s) => { s.activeInspectorTab = t; }),
    toggleAIPanel: () => set((s) => { s.showAIPanel = !s.showAIPanel; }),
    toggleCollabPanel: () => set((s) => { s.showCollabPanel = !s.showCollabPanel; }),
    setVolume: (v) => set((s) => { s.volume = v; }),
    toggleMuteAll: () => set((s) => { s.isMuted = !s.isMuted; }),
    loadProject: (id) => set((s) => { s.projectId = id; }),
  }))
);
