import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TrackType = 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
export type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish' | 'timeline';
export type ToolbarTab = 'media' | 'effects';
export type WorkspaceTab = 'video' | 'audio' | 'color' | 'info' | 'effects';
export type TimelineViewMode = 'timeline' | 'list' | 'waveform';
export type EditTool = 'select' | 'trim' | 'razor' | 'slip' | 'slide';
export type SearchFilterType = 'semantic' | 'phonetic' | 'visual';

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

export type SmartBinRuleField = 'type' | 'tag' | 'name' | 'duration' | 'favorite' | 'status';
export type SmartBinOperator = 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'is';

export interface SmartBinRule {
  field: SmartBinRuleField;
  operator: SmartBinOperator;
  value: string;
}

export interface SmartBin {
  id: string;
  name: string;
  color: string;
  rules: SmartBinRule[];
  matchAll: boolean; // true = AND, false = OR
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

  // Smart Bins (Avid-style)
  smartBins: SmartBin[];
  selectedSmartBinId: string | null;

  // Monitors
  sourceAsset: MediaAsset | null;
  inPoint: number | null;
  outPoint: number | null;
  showSafeZones: boolean;
  showWaveforms: boolean;
  snapToGrid: boolean;

  // UI State
  activePanel: PanelType;
  activeInspectorTab: WorkspaceTab;
  toolbarTab: ToolbarTab;
  showInspector: boolean;
  showAIPanel: boolean;
  showTranscriptPanel: boolean;
  showCollabPanel: boolean;
  showExportPanel: boolean;
  isFullscreen: boolean;

  // Collaboration
  collabUsers: CollabUser[];

  // AI
  aiJobs: AIJob[];
  tokenBalance: number;

  // Playback
  volume: number;
  isMuted: boolean;

  // Timeline view
  timelineViewMode: TimelineViewMode;

  // Clip groups (for group/ungroup commands)
  clipGroups: Record<string, string[]>;

  // Active editing tool
  activeTool: EditTool;

  // Timeline index panel
  showIndex: boolean;

  // AI search filter
  searchFilterType: SearchFilterType;
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

  // Tracks (add / remove)
  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  insertTrack: (track: Track, index: number) => void;

  // Clips
  addClip: (clip: Clip) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStart: number) => void;
  trimClip: (clipId: string, side: 'left' | 'right', time: number) => void;
  splitClip: (clipId: string, time: number) => void;
  splitClipWithId: (clipId: string, time: number, newClipId: string) => void;
  slipClip: (clipId: string, delta: number) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  clearSelection: () => void;

  // Clip groups
  setClipGroup: (groupId: string, clipIds: string[]) => void;
  removeClipGroup: (groupId: string) => void;

  // Bins
  selectBin: (id: string) => void;
  toggleBin: (id: string) => void;
  setSourceAsset: (asset: MediaAsset | null) => void;

  // Monitor
  setInPoint: (t: number | null) => void;
  setOutPoint: (t: number | null) => void;
  toggleSafeZones: () => void;
  toggleWaveforms: () => void;
  toggleSnap: () => void;

  // UI
  setActivePanel: (p: PanelType) => void;
  setInspectorTab: (t: WorkspaceTab) => void;
  setToolbarTab: (t: ToolbarTab) => void;
  toggleInspector: () => void;
  toggleAIPanel: () => void;
  toggleTranscriptPanel: () => void;
  toggleCollabPanel: () => void;
  toggleExportPanel: () => void;

  // Timeline view
  setTimelineViewMode: (m: TimelineViewMode) => void;

  // Audio
  setVolume: (v: number) => void;
  toggleMuteAll: () => void;

  // Tools
  setActiveTool: (tool: EditTool) => void;
  toggleIndex: () => void;
  setSearchFilterType: (t: SearchFilterType) => void;

  // Clip operations
  deleteSelectedClips: () => void;
  duplicateClip: (clipId: string) => void;

  // Bin operations
  addBin: (name: string, parentId?: string) => void;

  // Smart Bin operations
  addSmartBin: (name: string, rules: SmartBinRule[], matchAll?: boolean) => void;
  removeSmartBin: (id: string) => void;
  selectSmartBin: (id: string) => void;
  getSmartBinAssets: (smartBinId: string) => MediaAsset[];

  // Enhanced trim operations
  rippleDelete: (clipId: string) => void;
  slideClip: (clipId: string, delta: number) => void;

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
    id: 't-v3', name: 'V3', type: 'VIDEO', sortOrder: 0, muted: false, locked: true, solo: false, volume: 1,
    color: '#5bbfc7',
    clips: [
      { id: 'c-v3-1', trackId: 't-v3', name: 'day 1 take 5', startTime: 2, endTime: 14, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't-v4', name: 'V4', type: 'VIDEO', sortOrder: 1, muted: false, locked: false, solo: false, volume: 1,
    color: '#4ecdc4',
    clips: [
      { id: 'c-v4-1', trackId: 't-v4', name: 'drone up', startTime: 14, endTime: 20, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c-v4-2', trackId: 't-v4', name: 'timescope', startTime: 26, endTime: 32, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c-v4-3', trackId: 't-v4', name: 'day 2 take 1', startTime: 32, endTime: 40, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't-v2', name: 'V2', type: 'VIDEO', sortOrder: 2, muted: false, locked: false, solo: false, volume: 1,
    color: '#818cf8',
    clips: [
      { id: 'c-v2-1', trackId: 't-v2', name: 'Clip name', startTime: 8, endTime: 16, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't-v1', name: 'V1', type: 'VIDEO', sortOrder: 3, muted: false, locked: false, solo: false, volume: 1,
    color: '#5b6af5',
    clips: [
      { id: 'c-v1-1', trackId: 't-v1', name: 'b-roll', startTime: 12, endTime: 22, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c-v1-2', trackId: 't-v1', name: 'b-roll', startTime: 24, endTime: 30, trimStart: 0, trimEnd: 0, type: 'video' },
      { id: 'c-v1-3', trackId: 't-v1', name: 'Clip name', startTime: 30, endTime: 38, trimStart: 0, trimEnd: 0, type: 'video' },
    ],
  },
  {
    id: 't-a1', name: 'A1', type: 'AUDIO', sortOrder: 4, muted: false, locked: false, solo: false, volume: 0.85,
    color: '#e05b8e',
    clips: [
      { id: 'c-a1-1', trackId: 't-a1', name: 'My clip', startTime: 4, endTime: 16, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
      { id: 'c-a1-2', trackId: 't-a1', name: 'My clip', startTime: 20, endTime: 38, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
    ],
  },
  {
    id: 't-a2', name: 'A2', type: 'AUDIO', sortOrder: 5, muted: false, locked: false, solo: false, volume: 0.6,
    color: '#4ade80',
    clips: [
      { id: 'c-a2-1', trackId: 't-a2', name: 'My clip', startTime: 0, endTime: 10, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
      { id: 'c-a2-2', trackId: 't-a2', name: 'My clip', startTime: 16, endTime: 28, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
    ],
  },
  {
    id: 't-a3', name: 'A3', type: 'AUDIO', sortOrder: 6, muted: false, locked: false, solo: false, volume: 0.7,
    color: '#e8943a',
    clips: [
      { id: 'c-a3-1', trackId: 't-a3', name: 'My clip', startTime: 6, endTime: 18, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
      { id: 'c-a3-2', trackId: 't-a3', name: 'My clip', startTime: 22, endTime: 40, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
    ],
  },
  {
    id: 't-a4', name: 'A4', type: 'AUDIO', sortOrder: 7, muted: false, locked: false, solo: false, volume: 0.8,
    color: '#f59e0b',
    clips: [
      { id: 'c-a4-1', trackId: 't-a4', name: 'Music Track', startTime: 0, endTime: 40, trimStart: 0, trimEnd: 0, type: 'audio', waveformData: genWaveform(200) },
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

// ─── Smart Bins demo data ─────────────────────────────────────────────────────
const DEMO_SMART_BINS: SmartBin[] = [
  {
    id: 'sb1', name: 'All Video', color: '#5bbfc7',
    rules: [{ field: 'type', operator: 'equals', value: 'VIDEO' }],
    matchAll: true,
  },
  {
    id: 'sb2', name: 'Favorites', color: '#f59e0b',
    rules: [{ field: 'favorite', operator: 'is', value: 'true' }],
    matchAll: true,
  },
  {
    id: 'sb3', name: 'Long Takes (>30s)', color: '#e05b8e',
    rules: [{ field: 'duration', operator: 'greaterThan', value: '30' }],
    matchAll: true,
  },
  {
    id: 'sb4', name: 'Dialogue Clips', color: '#818cf8',
    rules: [{ field: 'tag', operator: 'contains', value: 'dialogue' }],
    matchAll: true,
  },
  {
    id: 'sb5', name: 'Music & Audio', color: '#2bb672',
    rules: [{ field: 'type', operator: 'equals', value: 'AUDIO' }],
    matchAll: true,
  },
];

// Helper: evaluate smart bin rules against an asset
function matchesSmartBinRules(asset: MediaAsset, rules: SmartBinRule[], matchAll: boolean): boolean {
  const test = (rule: SmartBinRule): boolean => {
    switch (rule.field) {
      case 'type': return rule.operator === 'equals' ? asset.type === rule.value : asset.type.toLowerCase().includes(rule.value.toLowerCase());
      case 'tag': return rule.operator === 'contains' ? asset.tags.some(t => t.includes(rule.value.toLowerCase())) : asset.tags.includes(rule.value);
      case 'name': return rule.operator === 'contains' ? asset.name.toLowerCase().includes(rule.value.toLowerCase()) : asset.name === rule.value;
      case 'duration': {
        const dur = asset.duration ?? 0;
        const val = parseFloat(rule.value);
        return rule.operator === 'greaterThan' ? dur > val : rule.operator === 'lessThan' ? dur < val : dur === val;
      }
      case 'favorite': return rule.operator === 'is' ? asset.isFavorite === (rule.value === 'true') : false;
      case 'status': return rule.operator === 'equals' ? asset.status === rule.value : false;
      default: return false;
    }
  };
  return matchAll ? rules.every(test) : rules.some(test);
}

// Collect all assets from bins recursively
function collectAllAssets(bins: Bin[]): MediaAsset[] {
  const assets: MediaAsset[] = [];
  const walk = (b: Bin) => {
    assets.push(...b.assets);
    b.children.forEach(walk);
  };
  bins.forEach(walk);
  return assets;
}

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
    duration: 40,
    selectedClipIds: [],
    selectedTrackId: null,
    bins: DEMO_BINS,
    selectedBinId: 'b1a',
    activeBinAssets: DEMO_BINS[0].children[0].assets,
    smartBins: DEMO_SMART_BINS,
    selectedSmartBinId: null,
    sourceAsset: null,
    inPoint: null,
    outPoint: null,
    showSafeZones: false,
    showWaveforms: true,
    snapToGrid: true,
    activePanel: 'edit',
    activeInspectorTab: 'video',
    toolbarTab: 'media',
    showInspector: true,
    showAIPanel: false,
    showTranscriptPanel: false,
    showCollabPanel: false,
    showExportPanel: false,
    isFullscreen: false,
    collabUsers: [
      { id: 'u1', displayName: 'Sarah K.', color: '#7c5cfc' },
      { id: 'u2', displayName: 'Marcus T.', color: '#2bb672' },
    ],
    aiJobs: [],
    tokenBalance: 487,
    volume: 0.8,
    isMuted: false,
    timelineViewMode: 'timeline' as TimelineViewMode,
    clipGroups: {},
    activeTool: 'select' as EditTool,
    showIndex: false,
    searchFilterType: 'semantic' as SearchFilterType,

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

    addTrack: (track) => set((s) => {
      s.tracks.push(track);
      s.tracks.sort((a, b) => a.sortOrder - b.sortOrder);
    }),
    removeTrack: (trackId) => set((s) => {
      s.tracks = s.tracks.filter(t => t.id !== trackId);
    }),
    insertTrack: (track, index) => set((s) => {
      s.tracks.splice(index, 0, track);
    }),

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
    splitClipWithId: (clipId, time, newClipId) => set((s) => {
      for (const t of s.tracks) {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const orig = t.clips[idx];
          if (time <= orig.startTime || time >= orig.endTime) return;
          const newClip: Clip = { ...orig, id: newClipId, startTime: time };
          orig.endTime = time;
          t.clips.splice(idx + 1, 0, newClip);
          return;
        }
      }
    }),
    slipClip: (clipId, delta) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) {
          c.trimStart = Math.max(0, c.trimStart + delta);
          c.trimEnd = Math.max(0, c.trimEnd - delta);
          return;
        }
      }
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
    setClipGroup: (groupId, clipIds) => set((s) => { s.clipGroups[groupId] = clipIds; }),
    removeClipGroup: (groupId) => set((s) => { delete s.clipGroups[groupId]; }),

    setSourceAsset: (asset) => set((s) => { s.sourceAsset = asset; }),
    setInPoint: (t) => set((s) => { s.inPoint = t; }),
    setOutPoint: (t) => set((s) => { s.outPoint = t; }),
    toggleSafeZones: () => set((s) => { s.showSafeZones = !s.showSafeZones; }),
    toggleWaveforms: () => set((s) => { s.showWaveforms = !s.showWaveforms; }),
    toggleSnap: () => set((s) => { s.snapToGrid = !s.snapToGrid; }),
    setActivePanel: (p) => set((s) => { s.activePanel = p; }),
    setInspectorTab: (t) => set((s) => { s.activeInspectorTab = t; }),
    setToolbarTab: (t) => set((s) => { s.toolbarTab = t; }),
    toggleInspector: () => set((s) => { s.showInspector = !s.showInspector; }),
    toggleAIPanel: () => set((s) => { s.showAIPanel = !s.showAIPanel; }),
    toggleTranscriptPanel: () => set((s) => { s.showTranscriptPanel = !s.showTranscriptPanel; }),
    toggleCollabPanel: () => set((s) => { s.showCollabPanel = !s.showCollabPanel; }),
    toggleExportPanel: () => set((s) => { s.showExportPanel = !s.showExportPanel; }),
    setTimelineViewMode: (m) => set((s) => { s.timelineViewMode = m; }),
    setVolume: (v) => set((s) => { s.volume = v; }),
    toggleMuteAll: () => set((s) => { s.isMuted = !s.isMuted; }),

    // Tools
    setActiveTool: (tool) => set((s) => { s.activeTool = tool; }),
    toggleIndex: () => set((s) => { s.showIndex = !s.showIndex; }),
    setSearchFilterType: (t) => set((s) => { s.searchFilterType = t; }),

    // Clip operations
    deleteSelectedClips: () => set((s) => {
      if (s.selectedClipIds.length === 0) return;
      s.tracks.forEach(t => {
        t.clips = t.clips.filter(c => !s.selectedClipIds.includes(c.id));
      });
      s.selectedClipIds = [];
    }),
    duplicateClip: (clipId) => set((s) => {
      for (const t of s.tracks) {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) {
          const dur = clip.endTime - clip.startTime;
          const newClip: Clip = {
            ...clip,
            id: `${clipId}_dup_${Date.now()}`,
            startTime: clip.endTime,
            endTime: clip.endTime + dur,
          };
          t.clips.push(newClip);
          s.selectedClipIds = [newClip.id];
          return;
        }
      }
    }),

    // Bin operations
    addBin: (name, parentId) => set((s) => {
      const newBin: Bin = {
        id: `b_${Date.now()}`,
        name,
        color: '#818cf8',
        isOpen: false,
        children: [],
        assets: [],
      };
      if (parentId) {
        const findAndAdd = (bins: Bin[]) => {
          for (const b of bins) {
            if (b.id === parentId) { b.children.push(newBin); return true; }
            if (findAndAdd(b.children)) return true;
          }
          return false;
        };
        findAndAdd(s.bins);
      } else {
        s.bins.push(newBin);
      }
    }),

    // Smart Bin operations
    addSmartBin: (name, rules, matchAll = true) => set((s) => {
      s.smartBins.push({
        id: `sb_${Date.now()}`,
        name,
        color: '#818cf8',
        rules,
        matchAll,
      });
    }),
    removeSmartBin: (id) => set((s) => {
      s.smartBins = s.smartBins.filter(sb => sb.id !== id);
      if (s.selectedSmartBinId === id) s.selectedSmartBinId = null;
    }),
    selectSmartBin: (id) => set((s) => {
      s.selectedSmartBinId = id;
      s.selectedBinId = null;
      const sb = s.smartBins.find(b => b.id === id);
      if (sb) {
        const allAssets = collectAllAssets(s.bins);
        s.activeBinAssets = allAssets.filter(a => matchesSmartBinRules(a, sb.rules, sb.matchAll));
      }
    }),
    getSmartBinAssets: (smartBinId) => {
      const state = get();
      const sb = state.smartBins.find(b => b.id === smartBinId);
      if (!sb) return [];
      const allAssets = collectAllAssets(state.bins);
      return allAssets.filter(a => matchesSmartBinRules(a, sb.rules, sb.matchAll));
    },

    // Enhanced trim operations
    rippleDelete: (clipId) => set((s) => {
      for (const t of s.tracks) {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const clip = t.clips[idx];
          const dur = clip.endTime - clip.startTime;
          // Remove the clip
          t.clips.splice(idx, 1);
          // Shift all subsequent clips left by the deleted duration
          for (let i = idx; i < t.clips.length; i++) {
            if (t.clips[i].startTime >= clip.startTime) {
              t.clips[i].startTime -= dur;
              t.clips[i].endTime -= dur;
            }
          }
          // Remove from selection
          const selIdx = s.selectedClipIds.indexOf(clipId);
          if (selIdx >= 0) s.selectedClipIds.splice(selIdx, 1);
          return;
        }
      }
    }),
    slideClip: (clipId, delta) => set((s) => {
      for (const t of s.tracks) {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const clip = t.clips[idx];
          // Slide adjusts content position within the clip without moving the clip itself
          // The surrounding clips' in/out points shift to accommodate
          const prev = idx > 0 ? t.clips[idx - 1] : null;
          const next = idx < t.clips.length - 1 ? t.clips[idx + 1] : null;

          if (delta < 0) {
            // Sliding left: trim prev clip shorter, next clip starts earlier
            if (prev) prev.endTime = Math.max(prev.startTime + 0.1, prev.endTime + delta);
            if (next) next.startTime = Math.max(clip.endTime + delta, clip.endTime - (next.endTime - next.startTime) + 0.1);
          } else {
            // Sliding right: trim next clip shorter, prev clip ends later
            if (next) next.startTime = Math.min(next.endTime - 0.1, next.startTime + delta);
            if (prev) prev.endTime = Math.min(clip.startTime + delta, clip.startTime + (prev.endTime - prev.startTime) - 0.1);
          }
          // Adjust the source offset (trim points)
          clip.trimStart = Math.max(0, clip.trimStart + delta);
          clip.trimEnd = Math.max(0, clip.trimEnd - delta);
          return;
        }
      }
    }),

    loadProject: (id) => set((s) => { s.projectId = id; }),
  }))
);
