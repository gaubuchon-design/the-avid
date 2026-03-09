// ═══════════════════════════════════════════════════════════════════════════
//  THE AVID — Creator Workflow Store
//  Zustand + Immer state for Creator features (CC-01 through CC-09)
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type {
  AutoReframeConfig,
  ReframeResult,
  ChapterMarker,
  ThumbnailDesign,
  ThumbnailCandidate,
  ColorBoostPreset,
  StockMusicResult,
  StockMusicSearchParams,
  StockVideoResult,
  StockVideoSearchParams,
  BRollSuggestion,
  BeatSyncConfig,
  BeatSyncResult,
  BeatMarker,
  SeriesProject,
  SeriesEpisode,
  EpisodeStatus,
  BrandAsset,
  PodcastConfig,
  SilenceRegion,
  FillerWord,
  PodcastExportConfig,
  CreatorWorkspacePreset,
  CreatorWorkspaceConfig,
  BeatSyncMode,
  StockMusicProvider,
  StockVideoProvider,
  MusicMood,
  MusicGenre,
  ThumbnailExportSize,
} from '@mcua/core';

// ─── Types ────────────────────────────────────────────────────────────────

type StockBrowserTab = 'music' | 'video';
type CreatorPanel = 'thumbnail' | 'stock' | 'beatSync' | 'series' | 'podcast' | 'reframe' | 'chapters' | null;

// ─── State ────────────────────────────────────────────────────────────────

interface CreatorState {
  // Active panel
  activeCreatorPanel: CreatorPanel;

  // Workspace
  workspacePreset: CreatorWorkspacePreset;
  simplifiedMode: boolean;

  // Auto-Reframe (CC-01)
  reframeConfig: AutoReframeConfig;
  reframeResults: ReframeResult[];
  reframeProcessing: boolean;

  // YouTube Chapters (CC-02)
  chapters: ChapterMarker[];
  chaptersValidation: { valid: boolean; errors: string[]; warnings: string[] } | null;

  // Thumbnail Designer (CC-03)
  thumbnailDesigns: ThumbnailDesign[];
  activeThumbnailId: string | null;
  thumbnailCandidates: ThumbnailCandidate[];
  colorBoostPresets: ColorBoostPreset[];

  // Stock Music (CC-04)
  stockBrowserTab: StockBrowserTab;
  musicSearchParams: StockMusicSearchParams;
  musicSearchResults: StockMusicResult[];
  musicSearchLoading: boolean;
  selectedMusicTrack: StockMusicResult | null;
  musicPreviewPlaying: string | null;

  // Stock Video (CC-05)
  videoSearchParams: StockVideoSearchParams;
  videoSearchResults: StockVideoResult[];
  videoSearchLoading: boolean;
  selectedVideoClip: StockVideoResult | null;
  brollSuggestions: BRollSuggestion[];

  // Beat Sync (CC-06)
  beatSyncConfig: BeatSyncConfig;
  beatSyncResult: BeatSyncResult | null;
  detectedBeats: BeatMarker[];
  beatSyncProcessing: boolean;

  // Series Manager (CC-07)
  seriesList: SeriesProject[];
  activeSeriesId: string | null;
  activeEpisodeId: string | null;

  // Podcast Mode (CC-08)
  podcastConfig: PodcastConfig;
  silenceRegions: SilenceRegion[];
  fillerWords: FillerWord[];
  podcastChapters: ChapterMarker[];
  podcastAnalyzing: boolean;
  podcastStats: {
    totalSilenceDuration: number;
    fillerWordCount: number;
    estimatedTimeSaved: number;
    chapterCount: number;
  };
}

// ─── Actions ──────────────────────────────────────────────────────────────

interface CreatorActions {
  // Panel
  setActiveCreatorPanel: (panel: CreatorPanel) => void;
  toggleCreatorPanel: (panel: CreatorPanel) => void;

  // Workspace
  setWorkspacePreset: (preset: CreatorWorkspacePreset) => void;
  toggleSimplifiedMode: () => void;

  // Auto-Reframe
  setReframeConfig: (config: Partial<AutoReframeConfig>) => void;
  addReframeResult: (result: ReframeResult) => void;
  clearReframeResults: () => void;
  setReframeProcessing: (processing: boolean) => void;

  // Chapters
  addChapter: (chapter: ChapterMarker) => void;
  removeChapter: (time: number) => void;
  setChapters: (chapters: ChapterMarker[]) => void;
  setChaptersValidation: (validation: CreatorState['chaptersValidation']) => void;

  // Thumbnail
  addThumbnailDesign: (design: ThumbnailDesign) => void;
  updateThumbnailDesign: (id: string, updates: Partial<ThumbnailDesign>) => void;
  removeThumbnailDesign: (id: string) => void;
  setActiveThumbnailId: (id: string | null) => void;
  setThumbnailCandidates: (candidates: ThumbnailCandidate[]) => void;

  // Stock Music
  setStockBrowserTab: (tab: StockBrowserTab) => void;
  setMusicSearchParams: (params: Partial<StockMusicSearchParams>) => void;
  setMusicSearchResults: (results: StockMusicResult[]) => void;
  setMusicSearchLoading: (loading: boolean) => void;
  selectMusicTrack: (track: StockMusicResult | null) => void;
  setMusicPreviewPlaying: (trackId: string | null) => void;

  // Stock Video
  setVideoSearchParams: (params: Partial<StockVideoSearchParams>) => void;
  setVideoSearchResults: (results: StockVideoResult[]) => void;
  setVideoSearchLoading: (loading: boolean) => void;
  selectVideoClip: (clip: StockVideoResult | null) => void;
  setBRollSuggestions: (suggestions: BRollSuggestion[]) => void;

  // Beat Sync
  setBeatSyncConfig: (config: Partial<BeatSyncConfig>) => void;
  setBeatSyncResult: (result: BeatSyncResult | null) => void;
  setDetectedBeats: (beats: BeatMarker[]) => void;
  setBeatSyncProcessing: (processing: boolean) => void;

  // Series
  setSeriesList: (series: SeriesProject[]) => void;
  addSeries: (series: SeriesProject) => void;
  updateSeries: (id: string, updates: Partial<SeriesProject>) => void;
  removeSeries: (id: string) => void;
  setActiveSeriesId: (id: string | null) => void;
  setActiveEpisodeId: (id: string | null) => void;

  // Podcast
  setPodcastConfig: (config: Partial<PodcastConfig>) => void;
  setSilenceRegions: (regions: SilenceRegion[]) => void;
  setFillerWords: (words: FillerWord[]) => void;
  toggleFillerRemoval: (fillerId: string) => void;
  setPodcastChapters: (chapters: ChapterMarker[]) => void;
  setPodcastAnalyzing: (analyzing: boolean) => void;
  setPodcastStats: (stats: CreatorState['podcastStats']) => void;
}

// ─── Default Values ───────────────────────────────────────────────────────

const DEFAULT_REFRAME_CONFIG: AutoReframeConfig = {
  sourceAspect: { width: 16, height: 9, label: '16:9' },
  targetAspect: { width: 9, height: 16, label: '9:16' },
  subjectLockStrength: 0.8,
  motionSmoothing: 0.6,
  subjectPriority: ['face', 'salient_object'],
  safeZoneMargin: 0.05,
};

const DEFAULT_BEAT_SYNC_CONFIG: BeatSyncConfig = {
  mode: 'auto_cut',
  beatThreshold: 0.5,
  sourceClipIds: [],
  everyNBeats: 4,
  speedRampIntensity: 0.5,
  quantize: true,
  transitionType: 'cut',
  transitionDuration: 0,
};

const DEFAULT_PODCAST_CONFIG: PodcastConfig = {
  silenceGateMs: 500,
  silenceThresholdDb: -40,
  fillerWordRemoval: true,
  fillerWordTypes: ['um', 'uh', 'like', 'you_know'],
  chapterAutoGenerate: true,
  loudnessTarget: -16,
  crossfadeMs: 50,
  preserveBreathSounds: true,
};

// ─── Store ────────────────────────────────────────────────────────────────

export const useCreatorStore = create<CreatorState & CreatorActions>()(
  immer((set) => ({
    // ── Initial State ───────────────────────────────────────────────────
    activeCreatorPanel: null,
    workspacePreset: 'standard',
    simplifiedMode: false,

    // Auto-Reframe
    reframeConfig: DEFAULT_REFRAME_CONFIG,
    reframeResults: [],
    reframeProcessing: false,

    // Chapters
    chapters: [],
    chaptersValidation: null,

    // Thumbnail
    thumbnailDesigns: [],
    activeThumbnailId: null,
    thumbnailCandidates: [],
    colorBoostPresets: [],

    // Stock Music
    stockBrowserTab: 'music',
    musicSearchParams: {},
    musicSearchResults: [],
    musicSearchLoading: false,
    selectedMusicTrack: null,
    musicPreviewPlaying: null,

    // Stock Video
    videoSearchParams: {},
    videoSearchResults: [],
    videoSearchLoading: false,
    selectedVideoClip: null,
    brollSuggestions: [],

    // Beat Sync
    beatSyncConfig: DEFAULT_BEAT_SYNC_CONFIG,
    beatSyncResult: null,
    detectedBeats: [],
    beatSyncProcessing: false,

    // Series
    seriesList: [],
    activeSeriesId: null,
    activeEpisodeId: null,

    // Podcast
    podcastConfig: DEFAULT_PODCAST_CONFIG,
    silenceRegions: [],
    fillerWords: [],
    podcastChapters: [],
    podcastAnalyzing: false,
    podcastStats: {
      totalSilenceDuration: 0,
      fillerWordCount: 0,
      estimatedTimeSaved: 0,
      chapterCount: 0,
    },

    // ── Actions ─────────────────────────────────────────────────────────

    // Panel
    setActiveCreatorPanel: (panel) => set((s) => { s.activeCreatorPanel = panel; }),
    toggleCreatorPanel: (panel) => set((s) => {
      s.activeCreatorPanel = s.activeCreatorPanel === panel ? null : panel;
    }),

    // Workspace
    setWorkspacePreset: (preset) => set((s) => { s.workspacePreset = preset; }),
    toggleSimplifiedMode: () => set((s) => { s.simplifiedMode = !s.simplifiedMode; }),

    // Auto-Reframe
    setReframeConfig: (config) => set((s) => {
      Object.assign(s.reframeConfig, config);
    }),
    addReframeResult: (result) => set((s) => { s.reframeResults.push(result); }),
    clearReframeResults: () => set((s) => { s.reframeResults = []; }),
    setReframeProcessing: (processing) => set((s) => { s.reframeProcessing = processing; }),

    // Chapters
    addChapter: (chapter) => set((s) => {
      s.chapters.push(chapter);
      s.chapters.sort((a, b) => a.time - b.time);
    }),
    removeChapter: (time) => set((s) => {
      s.chapters = s.chapters.filter((c) => c.time !== time);
    }),
    setChapters: (chapters) => set((s) => {
      s.chapters = [...chapters].sort((a, b) => a.time - b.time);
    }),
    setChaptersValidation: (validation) => set((s) => {
      s.chaptersValidation = validation;
    }),

    // Thumbnail
    addThumbnailDesign: (design) => set((s) => { s.thumbnailDesigns.push(design); }),
    updateThumbnailDesign: (id, updates) => set((s) => {
      const design = s.thumbnailDesigns.find((d) => d.id === id);
      if (design) Object.assign(design, updates, { updatedAt: new Date().toISOString() });
    }),
    removeThumbnailDesign: (id) => set((s) => {
      s.thumbnailDesigns = s.thumbnailDesigns.filter((d) => d.id !== id);
      if (s.activeThumbnailId === id) s.activeThumbnailId = null;
    }),
    setActiveThumbnailId: (id) => set((s) => { s.activeThumbnailId = id; }),
    setThumbnailCandidates: (candidates) => set((s) => { s.thumbnailCandidates = candidates; }),

    // Stock Music
    setStockBrowserTab: (tab) => set((s) => { s.stockBrowserTab = tab; }),
    setMusicSearchParams: (params) => set((s) => {
      Object.assign(s.musicSearchParams, params);
    }),
    setMusicSearchResults: (results) => set((s) => { s.musicSearchResults = results; }),
    setMusicSearchLoading: (loading) => set((s) => { s.musicSearchLoading = loading; }),
    selectMusicTrack: (track) => set((s) => { s.selectedMusicTrack = track; }),
    setMusicPreviewPlaying: (trackId) => set((s) => { s.musicPreviewPlaying = trackId; }),

    // Stock Video
    setVideoSearchParams: (params) => set((s) => {
      Object.assign(s.videoSearchParams, params);
    }),
    setVideoSearchResults: (results) => set((s) => { s.videoSearchResults = results; }),
    setVideoSearchLoading: (loading) => set((s) => { s.videoSearchLoading = loading; }),
    selectVideoClip: (clip) => set((s) => { s.selectedVideoClip = clip; }),
    setBRollSuggestions: (suggestions) => set((s) => { s.brollSuggestions = suggestions; }),

    // Beat Sync
    setBeatSyncConfig: (config) => set((s) => {
      Object.assign(s.beatSyncConfig, config);
    }),
    setBeatSyncResult: (result) => set((s) => { s.beatSyncResult = result; }),
    setDetectedBeats: (beats) => set((s) => { s.detectedBeats = beats; }),
    setBeatSyncProcessing: (processing) => set((s) => { s.beatSyncProcessing = processing; }),

    // Series
    setSeriesList: (series) => set((s) => { s.seriesList = series; }),
    addSeries: (series) => set((s) => { s.seriesList.push(series); }),
    updateSeries: (id, updates) => set((s) => {
      const series = s.seriesList.find((item) => item.id === id);
      if (series) Object.assign(series, updates, { updatedAt: new Date().toISOString() });
    }),
    removeSeries: (id) => set((s) => {
      s.seriesList = s.seriesList.filter((item) => item.id !== id);
      if (s.activeSeriesId === id) s.activeSeriesId = null;
    }),
    setActiveSeriesId: (id) => set((s) => { s.activeSeriesId = id; }),
    setActiveEpisodeId: (id) => set((s) => { s.activeEpisodeId = id; }),

    // Podcast
    setPodcastConfig: (config) => set((s) => {
      Object.assign(s.podcastConfig, config);
    }),
    setSilenceRegions: (regions) => set((s) => { s.silenceRegions = regions; }),
    setFillerWords: (words) => set((s) => { s.fillerWords = words; }),
    toggleFillerRemoval: (fillerId) => set((s) => {
      const filler = s.fillerWords.find((f) => f.id === fillerId);
      if (filler) filler.removed = !filler.removed;
    }),
    setPodcastChapters: (chapters) => set((s) => { s.podcastChapters = chapters; }),
    setPodcastAnalyzing: (analyzing) => set((s) => { s.podcastAnalyzing = analyzing; }),
    setPodcastStats: (stats) => set((s) => { s.podcastStats = stats; }),
  })),
);
