// ─── Sports Store ─────────────────────────────────────────────────────────────
// SP-10: Zustand + Immer store for sports production state, following the
// existing create<State & Actions>()(immer((set) => ({...}))) pattern.

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  EVSConnectionStatus,
  EVSClip,
  EVSServer,
  GrowingFileState,
  HighlightEvent,
  StatsDataPoint,
  StatsConnectionStatus,
  StatsProvider,
  SportsPackage,
  SportsMetadata,
  PartialExport,
  SportsGraphicTemplate,
  HFRClipMetadata,
  CameraAngle,
  SportsCamFeed,
  SportsCamGridConfig,
} from '@mcua/core';

// ─── State ────────────────────────────────────────────────────────────────────

interface SportsState {
  // EVS Connection
  evsConnectionStatus: EVSConnectionStatus;
  evsServers: EVSServer[];
  evsClips: EVSClip[];
  evsFilterAngle: CameraAngle | null;
  evsFilterSearch: string;
  evsSelectedClipId: string | null;

  // Growing Files
  growingFiles: GrowingFileState[];

  // Highlights
  highlights: HighlightEvent[];
  highlightMinConfidence: number;
  selectedHighlightId: string | null;

  // Stats
  statsConnectionStatus: StatsConnectionStatus;
  statsProvider: StatsProvider | null;
  latestStatsData: StatsDataPoint | null;
  statsHistory: StatsDataPoint[];
  liveData: Record<string, string | number>;

  // Packages
  packages: SportsPackage[];
  activePackageId: string | null;

  // Partial Exports
  partialExports: PartialExport[];

  // Graphics
  graphicTemplates: SportsGraphicTemplate[];
  selectedTemplateId: string | null;

  // HFR
  hfrClips: HFRClipMetadata[];
  sequenceFrameRate: number;

  // Sports Metadata
  sportsMetadata: SportsMetadata;

  // Multi-Cam Grid
  camGrid: SportsCamGridConfig;

  // UI State
  showEVSBrowser: boolean;
  showHighlightsPanel: boolean;
  showPackageBuilder: boolean;
  showStatsOverlay: boolean;
  showCamGrid: boolean;
  activeSportsTab: 'evs' | 'highlights' | 'packages' | 'stats' | 'hfr';
}

// ─── Actions ──────────────────────────────────────────────────────────────────

interface SportsActions {
  // EVS
  setEVSConnectionStatus: (status: EVSConnectionStatus) => void;
  setEVSServers: (servers: EVSServer[]) => void;
  setEVSClips: (clips: EVSClip[]) => void;
  addEVSClip: (clip: EVSClip) => void;
  removeEVSClip: (clipId: string) => void;
  setEVSFilterAngle: (angle: CameraAngle | null) => void;
  setEVSFilterSearch: (search: string) => void;
  selectEVSClip: (clipId: string | null) => void;

  // Growing Files
  setGrowingFiles: (files: GrowingFileState[]) => void;
  addGrowingFile: (file: GrowingFileState) => void;
  updateGrowingFile: (fileId: string, patch: Partial<GrowingFileState>) => void;
  removeGrowingFile: (fileId: string) => void;

  // Highlights
  setHighlights: (highlights: HighlightEvent[]) => void;
  addHighlight: (highlight: HighlightEvent) => void;
  updateHighlight: (id: string, patch: Partial<HighlightEvent>) => void;
  removeHighlight: (id: string) => void;
  setHighlightMinConfidence: (confidence: number) => void;
  selectHighlight: (id: string | null) => void;

  // Stats
  setStatsConnectionStatus: (status: StatsConnectionStatus) => void;
  setStatsProvider: (provider: StatsProvider | null) => void;
  pushStatsData: (data: StatsDataPoint) => void;
  setLiveData: (data: Record<string, string | number>) => void;
  updateLiveValue: (key: string, value: string | number) => void;

  // Packages
  setPackages: (packages: SportsPackage[]) => void;
  addPackage: (pkg: SportsPackage) => void;
  updatePackage: (id: string, patch: Partial<SportsPackage>) => void;
  removePackage: (id: string) => void;
  setActivePackage: (id: string | null) => void;

  // Partial Exports
  setPartialExports: (exports: PartialExport[]) => void;
  addPartialExport: (exp: PartialExport) => void;
  updatePartialExport: (id: string, patch: Partial<PartialExport>) => void;
  removePartialExport: (id: string) => void;

  // Graphics
  setGraphicTemplates: (templates: SportsGraphicTemplate[]) => void;
  selectTemplate: (id: string | null) => void;

  // HFR
  setHFRClips: (clips: HFRClipMetadata[]) => void;
  addHFRClip: (clip: HFRClipMetadata) => void;
  updateHFRClip: (clipId: string, patch: Partial<HFRClipMetadata>) => void;
  setSequenceFrameRate: (fps: number) => void;

  // Metadata
  setSportsMetadata: (metadata: Partial<SportsMetadata>) => void;

  // Cam Grid
  setCamGridLayout: (layout: SportsCamGridConfig['layout']) => void;
  setCamFeeds: (feeds: SportsCamFeed[]) => void;
  selectCamFeed: (feedId: string | null) => void;
  setProgramFeed: (feedId: string | null) => void;

  // UI
  toggleEVSBrowser: () => void;
  toggleHighlightsPanel: () => void;
  togglePackageBuilder: () => void;
  toggleStatsOverlay: () => void;
  toggleCamGrid: () => void;
  setActiveSportsTab: (tab: SportsState['activeSportsTab']) => void;
}

// ─── Default State ────────────────────────────────────────────────────────────

const DEFAULT_METADATA: SportsMetadata = {
  playerNames: [],
  teams: ['Home', 'Away'],
  eventType: 'OTHER',
  gameClock: '00:00',
  period: 1,
  scoreAtEvent: { home: 0, away: 0 },
  cameraAngle: 'MAIN_WIDE',
  competitionName: '',
  venue: '',
  league: 'EPL',
  gameDate: new Date().toISOString().split('T')[0]!,
};

const DEFAULT_CAM_GRID: SportsCamGridConfig = {
  layout: '4x4',
  feeds: [
    { id: 'cam-1', label: 'CAM 1 - Wide', cameraAngle: 'MAIN_WIDE', isLive: true, isRecording: true, tally: 'PROGRAM' },
    { id: 'cam-2', label: 'CAM 2 - Tight', cameraAngle: 'TIGHT', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-3', label: 'CAM 3 - ISO L', cameraAngle: 'ISO_1', isLive: true, isRecording: true, tally: 'PREVIEW' },
    { id: 'cam-4', label: 'CAM 4 - ISO R', cameraAngle: 'ISO_2', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-5', label: 'CAM 5 - Reverse', cameraAngle: 'REVERSE', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-6', label: 'CAM 6 - SSM', cameraAngle: 'SUPER_SLO_MO', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-7', label: 'CAM 7 - SkyCam', cameraAngle: 'SKYCAM', isLive: true, isRecording: false, tally: 'OFF' },
    { id: 'cam-8', label: 'CAM 8 - Beauty', cameraAngle: 'BEAUTY', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-9', label: 'CAM 9 - Goal L', cameraAngle: 'GOAL_CAM', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-10', label: 'CAM 10 - Goal R', cameraAngle: 'GOAL_CAM', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-11', label: 'CAM 11 - Handheld', cameraAngle: 'HANDHELD', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-12', label: 'CAM 12 - Steadicam', cameraAngle: 'STEADICAM', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-13', label: 'CAM 13 - Rail', cameraAngle: 'RAIL_CAM', isLive: true, isRecording: false, tally: 'OFF' },
    { id: 'cam-14', label: 'CAM 14 - Net L', cameraAngle: 'NET_CAM', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-15', label: 'CAM 15 - Net R', cameraAngle: 'NET_CAM', isLive: true, isRecording: true, tally: 'OFF' },
    { id: 'cam-16', label: 'CAM 16 - Endzone', cameraAngle: 'ENDZONE', isLive: true, isRecording: true, tally: 'OFF' },
  ],
  selectedFeedId: 'cam-1',
  programFeedId: 'cam-1',
  showTally: true,
  showLabels: true,
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSportsStore = create<SportsState & SportsActions>()(
  immer((set) => ({
    // ─── Initial State ──────────────────────────────────────────────────────
    evsConnectionStatus: 'DISCONNECTED',
    evsServers: [],
    evsClips: [],
    evsFilterAngle: null,
    evsFilterSearch: '',
    evsSelectedClipId: null,

    growingFiles: [],

    highlights: [],
    highlightMinConfidence: 0.5,
    selectedHighlightId: null,

    statsConnectionStatus: 'DISCONNECTED',
    statsProvider: null,
    latestStatsData: null,
    statsHistory: [],
    liveData: {},

    packages: [],
    activePackageId: null,

    partialExports: [],

    graphicTemplates: [],
    selectedTemplateId: null,

    hfrClips: [],
    sequenceFrameRate: 29.97,

    sportsMetadata: DEFAULT_METADATA,

    camGrid: DEFAULT_CAM_GRID,

    showEVSBrowser: true,
    showHighlightsPanel: true,
    showPackageBuilder: true,
    showStatsOverlay: false,
    showCamGrid: true,
    activeSportsTab: 'evs',

    // ─── EVS Actions ────────────────────────────────────────────────────────
    setEVSConnectionStatus: (status) => set((s) => { s.evsConnectionStatus = status; }),
    setEVSServers: (servers) => set((s) => { s.evsServers = servers; }),
    setEVSClips: (clips) => set((s) => { s.evsClips = clips; }),
    addEVSClip: (clip) => set((s) => { s.evsClips.unshift(clip); }),
    removeEVSClip: (clipId) => set((s) => {
      s.evsClips = s.evsClips.filter((c) => c.clipId !== clipId);
      if (s.evsSelectedClipId === clipId) s.evsSelectedClipId = null;
    }),
    setEVSFilterAngle: (angle) => set((s) => { s.evsFilterAngle = angle; }),
    setEVSFilterSearch: (search) => set((s) => { s.evsFilterSearch = search; }),
    selectEVSClip: (clipId) => set((s) => { s.evsSelectedClipId = clipId; }),

    // ─── Growing File Actions ───────────────────────────────────────────────
    setGrowingFiles: (files) => set((s) => { s.growingFiles = files; }),
    addGrowingFile: (file) => set((s) => { s.growingFiles.push(file); }),
    updateGrowingFile: (fileId, patch) => set((s) => {
      const file = s.growingFiles.find((f) => f.id === fileId);
      if (file) Object.assign(file, patch);
    }),
    removeGrowingFile: (fileId) => set((s) => {
      s.growingFiles = s.growingFiles.filter((f) => f.id !== fileId);
    }),

    // ─── Highlights Actions ─────────────────────────────────────────────────
    setHighlights: (highlights) => set((s) => { s.highlights = highlights; }),
    addHighlight: (highlight) => set((s) => { s.highlights.unshift(highlight); }),
    updateHighlight: (id, patch) => set((s) => {
      const hl = s.highlights.find((h) => h.id === id);
      if (hl) Object.assign(hl, patch);
    }),
    removeHighlight: (id) => set((s) => {
      s.highlights = s.highlights.filter((h) => h.id !== id);
      if (s.selectedHighlightId === id) s.selectedHighlightId = null;
    }),
    setHighlightMinConfidence: (confidence) => set((s) => { s.highlightMinConfidence = confidence; }),
    selectHighlight: (id) => set((s) => { s.selectedHighlightId = id; }),

    // ─── Stats Actions ──────────────────────────────────────────────────────
    setStatsConnectionStatus: (status) => set((s) => { s.statsConnectionStatus = status; }),
    setStatsProvider: (provider) => set((s) => { s.statsProvider = provider; }),
    pushStatsData: (data) => set((s) => {
      s.latestStatsData = data;
      s.statsHistory.push(data);
      if (s.statsHistory.length > 500) {
        s.statsHistory = s.statsHistory.slice(-250);
      }
    }),
    setLiveData: (data) => set((s) => { s.liveData = data; }),
    updateLiveValue: (key, value) => set((s) => { s.liveData[key] = value; }),

    // ─── Package Actions ────────────────────────────────────────────────────
    setPackages: (packages) => set((s) => { s.packages = packages; }),
    addPackage: (pkg) => set((s) => { s.packages.unshift(pkg); }),
    updatePackage: (id, patch) => set((s) => {
      const pkg = s.packages.find((p) => p.id === id);
      if (pkg) Object.assign(pkg, patch);
    }),
    removePackage: (id) => set((s) => {
      s.packages = s.packages.filter((p) => p.id !== id);
      if (s.activePackageId === id) s.activePackageId = null;
    }),
    setActivePackage: (id) => set((s) => { s.activePackageId = id; }),

    // ─── Partial Export Actions ─────────────────────────────────────────────
    setPartialExports: (exports) => set((s) => { s.partialExports = exports; }),
    addPartialExport: (exp) => set((s) => { s.partialExports.unshift(exp); }),
    updatePartialExport: (id, patch) => set((s) => {
      const exp = s.partialExports.find((e) => e.id === id);
      if (exp) Object.assign(exp, patch);
    }),
    removePartialExport: (id) => set((s) => {
      s.partialExports = s.partialExports.filter((e) => e.id !== id);
    }),

    // ─── Graphics Actions ───────────────────────────────────────────────────
    setGraphicTemplates: (templates) => set((s) => { s.graphicTemplates = templates; }),
    selectTemplate: (id) => set((s) => { s.selectedTemplateId = id; }),

    // ─── HFR Actions ────────────────────────────────────────────────────────
    setHFRClips: (clips) => set((s) => { s.hfrClips = clips; }),
    addHFRClip: (clip) => set((s) => { s.hfrClips.push(clip); }),
    updateHFRClip: (clipId, patch) => set((s) => {
      const clip = s.hfrClips.find((c) => c.clipId === clipId);
      if (clip) Object.assign(clip, patch);
    }),
    setSequenceFrameRate: (fps) => set((s) => { s.sequenceFrameRate = fps; }),

    // ─── Metadata Actions ───────────────────────────────────────────────────
    setSportsMetadata: (metadata) => set((s) => {
      Object.assign(s.sportsMetadata, metadata);
    }),

    // ─── Cam Grid Actions ───────────────────────────────────────────────────
    setCamGridLayout: (layout) => set((s) => { s.camGrid.layout = layout; }),
    setCamFeeds: (feeds) => set((s) => { s.camGrid.feeds = feeds; }),
    selectCamFeed: (feedId) => set((s) => { s.camGrid.selectedFeedId = feedId; }),
    setProgramFeed: (feedId) => set((s) => { s.camGrid.programFeedId = feedId; }),

    // ─── UI Actions ─────────────────────────────────────────────────────────
    toggleEVSBrowser: () => set((s) => { s.showEVSBrowser = !s.showEVSBrowser; }),
    toggleHighlightsPanel: () => set((s) => { s.showHighlightsPanel = !s.showHighlightsPanel; }),
    togglePackageBuilder: () => set((s) => { s.showPackageBuilder = !s.showPackageBuilder; }),
    toggleStatsOverlay: () => set((s) => { s.showStatsOverlay = !s.showStatsOverlay; }),
    toggleCamGrid: () => set((s) => { s.showCamGrid = !s.showCamGrid; }),
    setActiveSportsTab: (tab) => set((s) => { s.activeSportsTab = tab; }),
  })),
);
