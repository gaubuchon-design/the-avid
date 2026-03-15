import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { mediaProbeEngine } from '../engine/MediaProbeEngine';
import { mediaDatabaseEngine } from '../engine/MediaDatabaseEngine';
import { videoSourceManager } from '../engine/VideoSourceManager';
import { playbackEngine } from '../engine/PlaybackEngine';
import { trackPatchingEngine } from '../engine/TrackPatchingEngine';
import { usePlayerStore } from './player.store';
import { saveProjectToRepository, getProjectFromRepository } from '../lib/projectRepository';
import type { EditorProject } from '@mcua/core';
import type { ProjectMediaSettings } from '../engine/MediaDatabaseEngine';
export type { ProjectMediaSettings } from '../engine/MediaDatabaseEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TrackType = 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
export type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish' | 'timeline' | 'script' | 'review' | 'news';
export type ToolbarTab = 'media' | 'effects';
export type WorkspaceTab = 'video' | 'audio' | 'color' | 'info' | 'effects';
export type TimelineViewMode = 'timeline' | 'list' | 'waveform';
export type EditTool = 'select' | 'trim' | 'razor' | 'slip' | 'slide';
export type SearchFilterType = 'semantic' | 'phonetic' | 'visual';
export type AlphaMode = 'straight' | 'premultiplied' | 'ignore' | 'auto';
export type CompositeMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay'
  | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
  | 'hue' | 'saturation' | 'color' | 'luminosity';

/** Intrinsic video properties (always present on every video clip). */
export interface IntrinsicVideoProps {
  opacity: number;       // 0-100 %
  scaleX: number;        // % (100 = normal)
  scaleY: number;        // %
  positionX: number;     // px offset from center
  positionY: number;     // px offset from center
  rotation: number;      // degrees
  anchorX: number;       // px
  anchorY: number;       // px
}

/** Intrinsic audio properties (always present on every audio/video clip). */
export interface IntrinsicAudioProps {
  volume: number;        // dB (-60 to +12)
  pan: number;           // -100 (L) to 100 (R)
}

/** Time remap keyframe: maps a timeline position to a source time. */
export interface TimeRemapKeyframe {
  timelineTime: number;  // seconds on timeline
  sourceTime: number;    // seconds in source media
  interpolation: 'linear' | 'bezier' | 'hold';
  bezierIn?: { x: number; y: number };
  bezierOut?: { x: number; y: number };
}

/** Time remapping state for a clip. */
export interface TimeRemapState {
  enabled: boolean;
  keyframes: TimeRemapKeyframe[];
  frameBlending: 'none' | 'frame-mix' | 'optical-flow';
  pitchCorrection: boolean; // maintain audio pitch when speed changes
}

export const DEFAULT_INTRINSIC_VIDEO: IntrinsicVideoProps = {
  opacity: 100, scaleX: 100, scaleY: 100,
  positionX: 0, positionY: 0, rotation: 0,
  anchorX: 0, anchorY: 0,
};

export const DEFAULT_INTRINSIC_AUDIO: IntrinsicAudioProps = {
  volume: 0, pan: 0,
};

export const DEFAULT_TIME_REMAP: TimeRemapState = {
  enabled: false,
  keyframes: [],
  frameBlending: 'frame-mix',
  pitchCorrection: true,
};

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
  // Intrinsic properties (always present)
  intrinsicVideo: IntrinsicVideoProps;
  intrinsicAudio: IntrinsicAudioProps;
  timeRemap: TimeRemapState;
  blendMode?: CompositeMode;
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
  blendMode?: CompositeMode;
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
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'GRAPHIC' | 'DOCUMENT';
  duration?: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR' | 'INGESTING' | 'OFFLINE';
  thumbnailUrl?: string;
  playbackUrl?: string;
  waveformData?: number[];
  tags: string[];
  isFavorite: boolean;
  // Technical metadata (from MediaProbeEngine)
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  colorSpace?: string;
  hasAlpha?: boolean;
  alphaMode?: AlphaMode;
  audioChannels?: number;
  sampleRate?: number;
  fileSize?: number;
  startTimecode?: string;
  bitDepth?: number;
  mimeType?: string;
  colorLabel?: string;
  rating?: number;
  /** Whether this asset is HDR content (PQ/HLG transfer function detected). */
  isHDR?: boolean;
  /** HDR mode detected from source media ('sdr' | 'hlg' | 'pq'). */
  hdrMode?: 'sdr' | 'hlg' | 'pq';
  // File reference for re-probe or relink
  fileHandle?: File;
  mediaDbId?: string;
}

export interface Bin {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  children: Bin[];
  assets: MediaAsset[];
  sequences: Sequence[];
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

export interface TranscriptCue {
  id: string;
  assetId?: string;
  speaker: string;
  speakerId?: string;
  text: string;
  startTime: number;
  endTime: number;
  source: 'SCRIPT' | 'TRANSCRIPT';
  confidence?: number;
  language?: string;
  translation?: string;
  provider?: string;
  linkedScriptLineIds?: string[];
  words?: Array<{ text: string; startTime: number; endTime: number; confidence?: number }>;
}

export interface TranscriptSpeaker {
  id: string;
  name?: string;
  label?: string;
  color?: string;
  confidence?: number;
  identified?: boolean;
}

export interface ScriptDocumentLine {
  id: string;
  text: string;
  lineNumber?: number;
  speaker?: string;
  linkedCueIds?: string[];
}

export interface ScriptDocument {
  id?: string;
  title: string;
  source: 'IMPORTED' | 'GENERATED' | 'MANUAL';
  language?: string;
  text?: string;
  lines: ScriptDocumentLine[];
  createdAt?: string;
  updatedAt: string;
}

export type DesktopMonitorConsumer = 'record-monitor' | 'program-monitor';

export interface DesktopMonitorAudioPreviewStatus {
  bufferedPreviewActive: boolean;
  previewRenderArtifacts: string[];
  offlinePrintRenderRequired: boolean;
}

export interface TrimEditPointSelection {
  trackId: string;
  editPointTime: number;
  side: 'A_SIDE' | 'B_SIDE' | 'BOTH';
}

export type TrimViewMode = 'big' | 'small';
export type TrimLoopDurationPreset = 'short' | 'medium' | 'long' | 'custom';

export interface ReviewComment {
  id: string;
  author: string;
  role: string;
  body: string;
  color: string;
  time: number;
  status: 'OPEN' | 'RESOLVED';
}

export interface Approval {
  id: string;
  reviewer: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  notes: string;
}

export interface DesktopJob {
  id: string;
  kind: 'INGEST' | 'EXPORT';
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
}

export interface PublishJob {
  id: string;
  label: string;
  preset: string;
  destination: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  outputSummary?: string;
}

export interface ProjectSettings {
  width: number;
  height: number;
  frameRate: number;
  exportFormat: string;
  /** Working color space for the project timeline. */
  workingColorSpace: 'rec709' | 'rec2020' | 'dci-p3' | 'aces-cct';
  /** HDR mode for the project. */
  hdrMode: 'sdr' | 'hlg' | 'pq';
}

export interface SequenceSettings {
  name: string;
  fps: number;
  dropFrame: boolean;
  startTC: number; // starting timecode offset in frames
  width: number;
  height: number;
  sampleRate: number;
  // Color management
  colorSpace: 'rec709' | 'rec2020' | 'dci-p3' | 'aces-cct';
  displayTransform: 'sdr-rec709' | 'hdr-pq' | 'hdr-hlg';
}

export interface SubtitleCue {
  id: string;
  start: number; // seconds
  end: number;
  text: string;
  speaker?: string;
  style?: {
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    position?: 'top' | 'bottom' | 'center' | 'custom';
    y?: number;
    bgOpacity?: number;
  };
}

export interface SubtitleTrack {
  id: string;
  name: string;
  language: string;
  cues: SubtitleCue[];
}

export interface TitleClipData {
  id: string;
  templateId?: string;
  text: string;
  style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    color: string;
    outlineColor?: string;
    outlineWidth?: number;
    shadowColor?: string;
    shadowBlur?: number;
    opacity: number;
    textAlign: 'left' | 'center' | 'right';
  };
  position: {
    x: number; // 0-1 normalized
    y: number; // 0-1 normalized
    width: number;
    height: number;
  };
  background?: {
    type: 'none' | 'solid' | 'gradient';
    color?: string;
    gradientColors?: string[];
    opacity?: number;
  };
  animation?: {
    type: 'none' | 'fade-in' | 'slide-up' | 'typewriter' | 'scale-in';
    duration: number; // frames
  };
}

export interface WatchFolder {
  id: string;
  name: string;
  path: string;
  status: 'WATCHING' | 'PAUSED' | 'ERROR';
  importedAssetCount: number;
  lastScannedAt?: string;
}

type SaveStatus = 'idle' | 'saved' | 'saving' | 'error' | 'unsaved';

export type RenderJobStatus = 'queued' | 'rendering' | 'complete' | 'error';

export interface RenderJob {
  id: string;
  name: string;
  status: RenderJobStatus;
  progress: number;
  format: string;
  resolution: string;
  frameRate: string;
  audioCodec: string;
  outputPath: string;
  createdAt: string;
  error?: string;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;
  projectSettings: ProjectSettings;
  projectMediaSettings: ProjectMediaSettings;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;
  ingestProgress: Record<string, number>; // assetId → 0-1 progress
  renderQueue: RenderJob[];

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
  inspectedClipId: string | null; // Decoupled from selection — set by match frame, auto-playhead, etc.

  // Bins
  bins: Bin[];
  selectedBinId: string | null;
  activeBinAssets: MediaAsset[];

  // Smart Bins (Avid-style)
  smartBins: SmartBin[];
  selectedSmartBinId: string | null;

  // Sequence
  sequenceSettings: SequenceSettings;
  subtitleTracks: SubtitleTrack[];
  titleClips: TitleClipData[];

  // Monitors
  sourceAsset: MediaAsset | null;
  inPoint: number | null;
  outPoint: number | null;
  showSafeZones: boolean;
  showWaveforms: boolean;
  snapToGrid: boolean;

  // Dialog visibility
  showNewProjectDialog: boolean;
  showSequenceDialog: boolean;
  sequenceDialogTargetBinId: string | null;
  showTitleTool: boolean;
  showSubtitleEditor: boolean;
  showAlphaImportDialog: boolean;
  alphaDialogAssetId: string | null;

  // UI State
  activePanel: PanelType;
  activeInspectorTab: WorkspaceTab;
  toolbarTab: ToolbarTab;
  showInspector: boolean;
  showAIPanel: boolean;
  showTranscriptPanel: boolean;
  showCollabPanel: boolean;
  showExportPanel: boolean;
  showSharePanel: boolean;
  showSettingsPanel: boolean;
  isFullscreen: boolean;

  // Collaboration
  collabUsers: CollabUser[];

  // AI
  aiJobs: AIJob[];
  transcript: TranscriptCue[];
  reviewComments: ReviewComment[];
  approvals: Approval[];
  publishJobs: PublishJob[];
  desktopJobs: DesktopJob[];
  watchFolders: WatchFolder[];
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
  isCommandPaletteOpen: boolean;

  // Source/Record Monitor (Avid-style dual monitor)
  sourceInPoint: number | null;
  sourceOutPoint: number | null;
  sourcePlayhead: number;
  recordInPoint: number | null;
  recordOutPoint: number | null;

  // Track Patching State
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];

  // Trim Mode State
  trimMode: 'off' | 'roll' | 'ripple' | 'slip' | 'slide' | 'asymmetric';
  trimActive: boolean;
  /** Tracks the U-key cycle position: Roll -> Ripple A-side -> Ripple B-side -> Roll */
  trimCycleState: 'roll' | 'ripple-a' | 'ripple-b';
  /** Per-track trim mode map for asymmetric trim (e.g., Roll on V1 + Ripple on A1) */
  asymmetricTrimState: Record<string, 'roll' | 'ripple-a' | 'ripple-b'>;

  // Smart Tool State
  smartToolLiftOverwrite: boolean;
  smartToolExtractSplice: boolean;
  smartToolOverwriteTrim: boolean;
  smartToolRippleTrim: boolean;
  /** The active Smart Tool quadrant determined by cursor position */
  smartToolQuadrant: 'lift-overwrite' | 'extract-splice' | 'overwrite-trim' | 'ripple-trim' | 'none';

  // Multicam State
  multicamActive: boolean;
  multicamGroupId: string | null;
  multicamDisplayMode: 'quad' | 'nine' | 'sixteen';

  // Clip Colors (Avid-style)
  projectClipColor: string;

  // Track Patching (source → record mapping)
  trackPatchMap: Record<string, string>;
  dupeDetectionEnabled: boolean;

  // Timeline Display
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  trackHeights: Record<string, number>;

  // Composer Display
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];

  // Audio (extended)
  audioScrubEnabled: boolean;
  soloSafeMode: boolean;

  // Workspace
  activeWorkspaceId: string;

  // Multi-monitor (Task 1)
  fullscreenMonitor: 'source' | 'record' | null;
  poppedOutMonitor: 'source' | 'record' | null;

  // Sequences (Task 3)
  sequences: Sequence[];
  activeSequenceId: string | null;

  // Bin management (Task 2)
  selectedAssetIds: string[];
  binSortField: BinSortField;
  binSortDirection: 'asc' | 'desc';
  binContextMenu: { x: number; y: number; binId: string } | null;
  assetContextMenu: { x: number; y: number; assetId: string } | null;
  binDragOverId: string | null;
  recentSearches: string[];
  searchScope: 'current' | 'all';
  searchFilterChips: SearchFilterChip[];

  // Trim extended state (for trim overlay / loop playback)
  trimSelectionLabel: 'OFF' | 'A' | 'B' | 'AB' | 'ASYM';
  trimCounterFrames: number;
  trimASideFrames: number;
  trimBSideFrames: number;
  trimViewMode: TrimViewMode;
  trimLoopPlaybackActive: boolean;
  trimLoopPlaybackDirection: number;
  trimLoopPlaybackRate: number;
  trimLoopDurationPreset: TrimLoopDurationPreset;
  trimLoopPreRollFrames: number;
  trimLoopPostRollFrames: number;
  trimLoopOffsetFrames: number;
  selectedTrimEditPoints: TrimEditPointSelection[];

  // Video monitor track
  videoMonitorTrackId: string | null;
  trackPatchLabels: string[];

  // Desktop monitor audio preview
  desktopMonitorAudioPreview: Record<DesktopMonitorConsumer, DesktopMonitorAudioPreviewStatus | null>;

  // Project persistence extended fields
  projectTemplate: string;
  projectDescription: string;
  projectTags: string[];
  projectSchemaVersion: number;
  projectCreatedAt: string | null;

  // Transcript extended
  transcriptSpeakers: TranscriptSpeaker[];
  scriptDocument: ScriptDocument | null;
  transcriptionSettings: {
    language: string;
    provider: string;
    autoTranscribe: boolean;
  };

  // Version history
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';

  // Sequence source
  sourceSequenceId: string | null;
  showSequenceBin: boolean;
}

export type BinSortField = 'name' | 'date-modified' | 'date-created' | 'size' | 'type' | 'duration';

export interface SearchFilterChip {
  type: 'type' | 'favorite' | 'status';
  value: string;
  active: boolean;
}

export interface Sequence {
  id: string;
  name: string;
  settings: SequenceSettings;
  tracks: Track[];
  duration: number;
  createdAt: string;
  modifiedAt: string;
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
  setInspectedClip: (clipId: string | null) => void;

  // Clip groups
  setClipGroup: (groupId: string, clipIds: string[]) => void;
  removeClipGroup: (groupId: string) => void;

  // Bins
  selectBin: (id: string | null) => void;
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
  toggleSharePanel: () => void;
  toggleSettingsPanel: () => void;
  toggleCommandPalette: (open?: boolean) => void;

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
  appendAssetToTimeline: (assetId: string) => void;
  overwriteEdit: () => void;
  insertEdit: () => void;
  razorAtPlayhead: () => void;
  matchFrame: () => void;
  addMarkerAtPlayhead: (label?: string) => void;
  setInToPlayhead: () => void;
  setOutToPlayhead: () => void;
  clearInOut: () => void;
  liftSelection: () => void;
  extractSelection: () => void;

  // Bin operations
  addBin: (name: string, parentId?: string) => void;

  // Smart Bin operations
  addSmartBin: (name: string, rules: SmartBinRule[], matchAll?: boolean) => void;
  removeSmartBin: (id: string) => void;
  selectSmartBin: (id: string) => void;
  getSmartBinAssets: (smartBinId: string) => MediaAsset[];

  // Review and publish
  addReviewComment: (comment: { body: string; author?: string; role?: string; color?: string }) => void;
  setApprovalStatus: (approvalId: string, status: Approval['status'], notes?: string) => void;
  queuePublishJob: (job: Pick<PublishJob, 'label' | 'preset' | 'destination'>) => string;
  updatePublishJob: (jobId: string, patch: Partial<PublishJob>) => void;

  // Enhanced trim operations
  rippleDelete: (clipId: string) => void;
  slideClip: (clipId: string, delta: number) => void;

  // Sequence
  updateSequenceSettings: (settings: Partial<SequenceSettings>) => void;

  // Media import
  importMediaFiles: (files: FileList, binId?: string) => void;

  // Dialogs
  toggleNewProjectDialog: () => void;
  toggleSequenceDialog: () => void;
  openSequenceDialogForBin: (binId: string) => void;
  toggleTitleTool: () => void;
  toggleSubtitleEditor: () => void;
  openAlphaImportDialog: (assetId: string) => Promise<AlphaMode>;
  resolveAlphaImportDialog: (mode: AlphaMode) => void;
  cancelAlphaImportDialog: () => void;

  // Subtitles
  addSubtitleTrack: (track: SubtitleTrack) => void;
  addSubtitleCue: (trackId: string, cue: SubtitleCue) => void;
  removeSubtitleCue: (trackId: string, cueId: string) => void;

  // Titles
  addTitleClip: (title: TitleClipData) => void;
  removeTitleClip: (titleId: string) => void;
  updateTitleClip: (titleId: string, data: Partial<TitleClipData>) => void;

  // Intrinsic property updates
  updateIntrinsicVideo: (clipId: string, patch: Partial<IntrinsicVideoProps>) => void;
  updateIntrinsicAudio: (clipId: string, patch: Partial<IntrinsicAudioProps>) => void;
  updateTimeRemap: (clipId: string, patch: Partial<TimeRemapState>) => void;
  addTimeRemapKeyframe: (clipId: string, keyframe: TimeRemapKeyframe) => void;
  removeTimeRemapKeyframe: (clipId: string, timelineTime: number) => void;
  resetIntrinsicVideo: (clipId: string) => void;
  resetIntrinsicAudio: (clipId: string) => void;

  // Source Monitor
  setSourceInPoint: (t: number | null) => void;
  setSourceOutPoint: (t: number | null) => void;
  setSourcePlayhead: (t: number) => void;
  setSourceInToPlayhead: () => void;
  setSourceOutToPlayhead: () => void;
  clearSourceInOut: () => void;

  // Track Enable/Disable
  enableTrack: (trackId: string) => void;
  disableTrack: (trackId: string) => void;
  toggleTrackEnabled: (trackId: string) => void;
  isTrackEnabled: (trackId: string) => boolean;

  // Sync Lock
  toggleSyncLock: (trackId: string) => void;
  isSyncLocked: (trackId: string) => boolean;

  // Trim Mode
  setTrimMode: (mode: EditorState['trimMode']) => void;
  setTrimActive: (active: boolean) => void;
  /** Cycle through trim modes via U key: Roll -> Ripple A -> Ripple B -> Roll */
  cycleTrimMode: () => void;
  /** Exit trim mode (Escape key) */
  exitTrimMode: () => void;
  /** Set the trim cycle state directly */
  setTrimCycleState: (state: EditorState['trimCycleState']) => void;
  /** Set a per-track asymmetric trim roller (Option/Alt+click) */
  setAsymmetricTrimRoller: (trackId: string, mode: 'roll' | 'ripple-a' | 'ripple-b') => void;
  /** Clear all asymmetric trim state */
  clearAsymmetricTrimState: () => void;

  // Smart Tool
  toggleSmartToolLiftOverwrite: () => void;
  toggleSmartToolExtractSplice: () => void;
  toggleSmartToolOverwriteTrim: () => void;
  toggleSmartToolRippleTrim: () => void;
  /** Set the active smart tool quadrant (from cursor position hit-testing) */
  setSmartToolQuadrant: (quadrant: EditorState['smartToolQuadrant']) => void;

  // Multicam
  setMulticamActive: (active: boolean) => void;
  setMulticamGroupId: (groupId: string | null) => void;
  setMulticamDisplayMode: (mode: 'quad' | 'nine' | 'sixteen') => void;

  // Clip Display
  setProjectClipColor: (color: string) => void;

  // Track Patching (store integration)
  patchSourceToRecord: (sourceId: string, recordId: string) => void;
  unpatchSource: (sourceId: string) => void;
  unpatchRecord: (recordId: string) => void;
  autoMatchPatch: () => void;
  toggleDupeDetection: () => void;
  setClipTextDisplay: (mode: EditorState['clipTextDisplay']) => void;

  // Track Heights
  setTrackHeight: (trackId: string, height: number) => void;
  enlargeTrack: (trackId: string) => void;
  reduceTrack: (trackId: string) => void;

  // Composer
  setComposerLayout: (layout: EditorState['composerLayout']) => void;
  toggleTrackingInfo: () => void;

  // Audio (extended)
  toggleAudioScrub: () => void;
  toggleSoloSafe: () => void;

  // Workspace
  setActiveWorkspace: (id: string) => void;

  // Navigation (Avid parity)
  goToNextEditPoint: () => void;
  goToPrevEditPoint: () => void;
  goToStart: () => void;
  goToEnd: () => void;

  // Init
  loadProject: (projectId: string) => void;

  // Render Queue
  addToRenderQueue: (job: Omit<RenderJob, 'id' | 'createdAt' | 'status' | 'progress'>) => string;
  removeFromRenderQueue: (jobId: string) => void;
  updateRenderJobProgress: (jobId: string, progress: number) => void;
  updateRenderJobStatus: (jobId: string, status: RenderJobStatus, error?: string) => void;
  clearCompletedRenderJobs: () => void;
  startRenderJob: (jobId: string) => void;

  // Save/Load
  saveProject: () => Promise<void>;
  markUnsaved: () => void;

  // Multi-monitor (Task 1)
  setFullscreenMonitor: (monitor: 'source' | 'record' | null) => void;
  setPoppedOutMonitor: (monitor: 'source' | 'record' | null) => void;
  toggleFullscreenMonitor: (monitor: 'source' | 'record') => void;

  // Sequences (Task 3)
  createSequence: (settings: SequenceSettings, targetBinId?: string) => string;
  duplicateSequence: (id: string) => void;
  deleteSequence: (id: string) => void;
  switchSequence: (id: string) => void;
  renameSequence: (id: string, name: string) => void;
  moveSequenceToBin: (sequenceId: string, targetBinId: string) => void;

  // Bin management (Task 2)
  renameBin: (binId: string, name: string) => void;
  deleteBin: (binId: string) => void;
  setBinColor: (binId: string, color: string) => void;
  moveBinTo: (binId: string, targetParentId: string | null) => void;
  setBinSortField: (field: BinSortField) => void;
  toggleBinSortDirection: () => void;
  selectAsset: (assetId: string, multi?: boolean, range?: boolean) => void;
  clearAssetSelection: () => void;
  setBinContextMenu: (menu: { x: number; y: number; binId: string } | null) => void;
  setAssetContextMenu: (menu: { x: number; y: number; assetId: string } | null) => void;
  setBinDragOverId: (binId: string | null) => void;
  addRecentSearch: (search: string) => void;
  setSearchScope: (scope: 'current' | 'all') => void;
  toggleSearchFilterChip: (type: SearchFilterChip['type'], value: string) => void;

  // Trim extended actions
  toggleTrimViewMode: () => void;
  setTrimViewMode: (mode: TrimViewMode) => void;
  toggleTrimLoopPlayback: () => void;
  setTrimLoopDurationPreset: (preset: TrimLoopDurationPreset) => void;
  setTrimLoopRollFrames: (pre: number, post: number) => void;
  setTrimLoopOffsetFrames: (frames: number) => void;
  setTrimLoopPlaybackActive: (active: boolean) => void;
  selectTrimEditPoint: (selection: TrimEditPointSelection, multi?: boolean) => void;
  clearTrimEditPoints: () => void;

  // Video monitor track
  setVideoMonitorTrack: (trackId: string | null) => void;

  // Track color
  updateTrackColor: (trackId: string, color: string) => void;
  updateBinColor: (binId: string, color: string) => void;

  // Desktop monitor audio preview
  setDesktopMonitorAudioPreview: (consumer: DesktopMonitorConsumer, status: DesktopMonitorAudioPreviewStatus) => void;
  clearDesktopMonitorAudioPreview: (consumer: DesktopMonitorConsumer) => void;

  // Transcript extended actions
  updateTranscriptCue: (cueId: string, patch: Partial<TranscriptCue>) => void;
  replaceTranscript: (cues: TranscriptCue[], speakers?: TranscriptSpeaker[]) => void;
  setScriptDocument: (doc: ScriptDocument | null) => void;
  updateScriptDocumentText: (lineIdOrText: string, text?: string) => void;
  syncScriptDocumentToTranscript: () => void;
  updateTranscriptionSettings: (patch: Record<string, unknown>) => void;
  buildTranscriptTitleEffects: (options?: Record<string, unknown>) => number;

  // Lift / Extract edits (Avid-style)
  liftEdit: () => void;
  extractEdit: () => void;

  // Sequence source
  loadSequenceInSource: (seqId: string) => void;
  setActiveSequence: (seqId: string) => void;
  editSourceToRecord: (mode?: 'insert' | 'overwrite') => void;
  toggleSequenceBin: () => void;

  // Version history / persistence
  restoreProjectSnapshot: (snapshot: unknown) => void;
}

// Waveform generator (random for demo)
function genWaveform(len = 100) {
  return Array.from({ length: len }, (_, i) =>
    Math.sin(i * 0.15) * 0.4 + Math.random() * 0.5 + 0.1
  );
}

// ─── Demo data ─────────────────────────────────────────────────────────────────
/** Helper to create a clip with default intrinsic properties. */
export function makeClip(base: Omit<Clip, 'intrinsicVideo' | 'intrinsicAudio' | 'timeRemap'>): Clip {
  return {
    ...base,
    intrinsicVideo: { ...DEFAULT_INTRINSIC_VIDEO },
    intrinsicAudio: { ...DEFAULT_INTRINSIC_AUDIO },
    timeRemap: { ...DEFAULT_TIME_REMAP },
  };
}

const INITIAL_TRACKS: Track[] = [];

const INITIAL_BINS: Bin[] = [];

const INITIAL_SMART_BINS: SmartBin[] = [];

const INITIAL_TRANSCRIPT: TranscriptCue[] = [];
const INITIAL_APPROVALS: Approval[] = [];
const INITIAL_REVIEW_COMMENTS: ReviewComment[] = [];

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 3840,
  height: 2160,
  frameRate: 24,
  exportFormat: 'mov',
  workingColorSpace: 'rec709',
  hdrMode: 'sdr',
};

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

function createId(prefix: string): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function findAssetById(bins: Bin[], assetId: string): MediaAsset | null {
  return collectAllAssets(bins).find((asset) => asset.id === assetId) ?? null;
}

function getClipTypeForAsset(asset: MediaAsset): Clip['type'] {
  if (asset.type === 'AUDIO') {
    return 'audio';
  }
  if (asset.type === 'DOCUMENT') {
    return 'subtitle';
  }
  return 'video';
}

function getPreferredTrack(state: Pick<EditorState, 'tracks' | 'selectedTrackId'>, asset: MediaAsset): Track | null {
  const selectedTrack = state.tracks.find((track) => track.id === state.selectedTrackId);
  const prefersAudio = asset.type === 'AUDIO';
  if (selectedTrack && !selectedTrack.locked) {
    if (prefersAudio ? selectedTrack.type === 'AUDIO' : selectedTrack.type === 'VIDEO') {
      return selectedTrack;
    }
  }

  const matchingTrack = state.tracks.find((track) => !track.locked && (prefersAudio ? track.type === 'AUDIO' : track.type === 'VIDEO'));
  return matchingTrack ?? state.tracks.find((track) => !track.locked) ?? null;
}

/**
 * Ensure at least one sequence and default tracks exist.
 * When no sequence exists, creates one whose settings match the given
 * asset's frame rate, resolution, and sample rate — matching Avid MC
 * behavior where the first clip determines sequence parameters.
 * Returns the preferred track for the asset (never null after this call).
 */
function ensureSequenceAndTracks(s: EditorState & EditorActions, asset: MediaAsset): Track {
  // Auto-create a sequence if none exists
  if (s.sequences.length === 0 || s.tracks.length === 0) {
    const fps = asset.fps || s.projectSettings.frameRate || 24;
    const width = asset.width || s.projectSettings.width || 1920;
    const height = asset.height || s.projectSettings.height || 1080;
    const sampleRate = asset.sampleRate || 48000;

    // Infer drop-frame from NTSC frame rates
    const dropFrame = [29.97, 59.94, 23.976].some(
      (df) => Math.abs(fps - df) < 0.01
    );

    const seqSettings: SequenceSettings = {
      name: 'Sequence 1',
      fps,
      dropFrame,
      startTC: 0,
      width,
      height,
      sampleRate,
      colorSpace: s.sequenceSettings.colorSpace,
      displayTransform: s.sequenceSettings.displayTransform,
    };
    s.sequenceSettings = seqSettings;

    // Also update project settings to match
    s.projectSettings.frameRate = fps;
    s.projectSettings.width = width;
    s.projectSettings.height = height;

    const seqId = createId('seq');
    const now = new Date().toISOString();

    // Create default tracks (V1, A1, A2)
    const v1: Track = {
      id: createId('track'), name: 'V1', type: 'VIDEO', sortOrder: 0,
      muted: false, locked: false, solo: false, volume: 1, clips: [],
      color: TRACK_COLOR_PRESETS['VIDEO']?.[0] ?? '#5b6af5',
    };
    const a1: Track = {
      id: createId('track'), name: 'A1', type: 'AUDIO', sortOrder: 1,
      muted: false, locked: false, solo: false, volume: 1, clips: [],
      color: TRACK_COLOR_PRESETS['AUDIO']?.[0] ?? '#e04eb5',
    };
    const a2: Track = {
      id: createId('track'), name: 'A2', type: 'AUDIO', sortOrder: 2,
      muted: false, locked: false, solo: false, volume: 1, clips: [],
      color: TRACK_COLOR_PRESETS['AUDIO']?.[1] ?? '#4eb5e0',
    };
    s.tracks = [v1, a1, a2];
    s.enabledTrackIds = [v1.id, a1.id, a2.id];

    const seq: Sequence = {
      id: seqId, name: seqSettings.name, settings: { ...seqSettings },
      tracks: s.tracks, duration: 0, createdAt: now, modifiedAt: now,
    };
    s.sequences.push(seq);
    s.activeSequenceId = seqId;

    // Place sequence in the first bin
    if (s.bins.length > 0 && s.bins[0]) {
      if (!s.bins[0].sequences) s.bins[0].sequences = [];
      s.bins[0].sequences.push(seq);
    }
  }

  // Now find the preferred track (guaranteed to exist after above)
  return getPreferredTrack(s, asset) ?? s.tracks[0]!;
}

// Module-level holder for the alpha dialog resolve callback.
// Functions are not compatible with Immer proxies, so we store
// the resolve callback outside of the store state.
let _alphaDialogResolve: ((mode: AlphaMode) => void) | null = null;

export const BIN_COLOR_PRESETS: string[] = [
  '#5b6af5', '#e04e4e', '#e0a44e', '#4eb5e0', '#4ee07a',
  '#a44ee0', '#e04eb5', '#999999', '#ffffff', '#333333',
];

export const TRACK_COLOR_PRESETS: Record<string, string[]> = {
  VIDEO: ['#5b6af5', '#4eb5e0', '#4ee07a', '#e0a44e', '#e04e4e', '#a44ee0'],
  AUDIO: ['#e04eb5', '#4eb5e0', '#4ee07a', '#e0a44e', '#e04e4e', '#5b6af5'],
  GRAPHIC: ['#a44ee0', '#5b6af5', '#4ee07a', '#e0a44e', '#e04e4e', '#4eb5e0'],
  EFFECT: ['#e0a44e', '#5b6af5', '#4ee07a', '#4eb5e0', '#e04e4e', '#a44ee0'],
  SUBTITLE: ['#999999', '#5b6af5', '#4eb5e0', '#4ee07a', '#e0a44e', '#e04e4e'],
};

const DEMO_BINS: Bin[] = [];

const DEMO_SMART_BINS: SmartBin[] = [];

// ─── Playback ────────────────────────────────────────────────────────────────
// Timeline playback is driven by PlaybackEngine (RAF-based).
// The store subscribes to frame updates and converts frames → seconds.

// ─── Store creation ────────────────────────────────────────────────────────────
export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    // Initial state
    projectId: null,
    projectName: 'Untitled Project',
    projectSettings: DEFAULT_PROJECT_SETTINGS,
    projectMediaSettings: { organizationMode: 'keep-in-place', generateProxies: false, proxyResolution: '1/2' as const },
    lastSavedAt: null,
    saveStatus: 'idle' as SaveStatus,
    ingestProgress: {},
    renderQueue: [] as RenderJob[],
    timelineId: null,
    tracks: INITIAL_TRACKS,
    markers: [],
    playheadTime: 0,
    isPlaying: false,
    zoom: 60,
    scrollLeft: 0,
    duration: 0,
    selectedClipIds: [],
    selectedTrackId: null,
    inspectedClipId: null,
    bins: [],
    selectedBinId: null,
    activeBinAssets: [],
    smartBins: DEMO_SMART_BINS,
    selectedSmartBinId: null,
    sequenceSettings: {
      name: 'Sequence 1',
      fps: 24,
      dropFrame: false,
      startTC: 0,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      colorSpace: 'rec709',
      displayTransform: 'sdr-rec709',
    },
    subtitleTracks: [],
    titleClips: [],
    sourceAsset: null,
    inPoint: null,
    outPoint: null,
    showSafeZones: false,
    showWaveforms: true,
    snapToGrid: true,
    showNewProjectDialog: false,
    showSequenceDialog: false,
    sequenceDialogTargetBinId: null,
    showTitleTool: false,
    showSubtitleEditor: false,
    showAlphaImportDialog: false,
    alphaDialogAssetId: null,
    activePanel: 'edit',
    activeInspectorTab: 'video',
    toolbarTab: 'media',
    showInspector: true,
    showAIPanel: false,
    showTranscriptPanel: false,
    showCollabPanel: false,
    showExportPanel: false,
    showSharePanel: false,
    showSettingsPanel: false,
    isFullscreen: false,
    collabUsers: [],
    aiJobs: [],
    transcript: INITIAL_TRANSCRIPT,
    reviewComments: INITIAL_REVIEW_COMMENTS,
    approvals: INITIAL_APPROVALS,
    publishJobs: [],
    desktopJobs: [],
    watchFolders: [],
    tokenBalance: 487,
    volume: 0.8,
    isMuted: false,
    timelineViewMode: 'timeline' as TimelineViewMode,
    clipGroups: {},
    activeTool: 'select' as EditTool,
    showIndex: false,
    searchFilterType: 'semantic' as SearchFilterType,
    isCommandPaletteOpen: false,

    // Source/Record Monitor (Avid-style dual monitor)
    sourceInPoint: null,
    sourceOutPoint: null,
    sourcePlayhead: 0,
    recordInPoint: null,
    recordOutPoint: null,

    // Track Patching State
    enabledTrackIds: INITIAL_TRACKS.map(t => t.id),
    syncLockedTrackIds: [],

    // Trim Mode State
    trimMode: 'off' as EditorState['trimMode'],
    trimActive: false,
    trimCycleState: 'roll' as EditorState['trimCycleState'],
    asymmetricTrimState: {} as Record<string, 'roll' | 'ripple-a' | 'ripple-b'>,

    // Smart Tool State
    smartToolLiftOverwrite: true,
    smartToolExtractSplice: true,
    smartToolOverwriteTrim: true,
    smartToolRippleTrim: true,
    smartToolQuadrant: 'none' as EditorState['smartToolQuadrant'],

    // Multicam State
    multicamActive: false,
    multicamGroupId: null,
    multicamDisplayMode: 'quad' as EditorState['multicamDisplayMode'],

    // Clip Colors (Avid-style)
    projectClipColor: '#5b6af5',

    // Track Patching (source → record mapping)
    trackPatchMap: {} as Record<string, string>,
    dupeDetectionEnabled: false,

    // Timeline Display
    clipTextDisplay: 'name' as EditorState['clipTextDisplay'],
    trackHeights: {} as Record<string, number>,

    // Composer Display
    composerLayout: 'source-record' as EditorState['composerLayout'],
    showTrackingInfo: true,
    trackingInfoFields: ['master-tc', 'duration'],

    // Audio (extended)
    audioScrubEnabled: false,
    soloSafeMode: false,

    // Workspace
    activeWorkspaceId: 'source-record',

    // Multi-monitor (Task 1)
    fullscreenMonitor: null,
    poppedOutMonitor: null,

    // Sequences (Task 3)
    sequences: [] as Sequence[],
    activeSequenceId: null,

    // Bin management (Task 2)
    selectedAssetIds: [] as string[],
    binSortField: 'name' as BinSortField,
    binSortDirection: 'asc' as 'asc' | 'desc',
    binContextMenu: null,
    assetContextMenu: null,
    binDragOverId: null,
    recentSearches: [] as string[],
    searchScope: 'current' as 'current' | 'all',
    searchFilterChips: [
      { type: 'type', value: 'VIDEO', active: false },
      { type: 'type', value: 'AUDIO', active: false },
      { type: 'type', value: 'IMAGE', active: false },
      { type: 'favorite', value: 'true', active: false },
    ] as SearchFilterChip[],

    // Trim extended state
    trimSelectionLabel: 'OFF' as EditorState['trimSelectionLabel'],
    trimCounterFrames: 0,
    trimASideFrames: 0,
    trimBSideFrames: 0,
    trimViewMode: 'small' as TrimViewMode,
    trimLoopPlaybackActive: false,
    trimLoopPlaybackDirection: 1,
    trimLoopPlaybackRate: 1,
    trimLoopDurationPreset: 'medium' as TrimLoopDurationPreset,
    trimLoopPreRollFrames: 12,
    trimLoopPostRollFrames: 12,
    trimLoopOffsetFrames: 0,
    selectedTrimEditPoints: [] as TrimEditPointSelection[],

    // Video monitor track
    videoMonitorTrackId: null as string | null,
    trackPatchLabels: [] as string[],

    // Desktop monitor audio preview
    desktopMonitorAudioPreview: {
      'record-monitor': null,
      'program-monitor': null,
    } as Record<DesktopMonitorConsumer, DesktopMonitorAudioPreviewStatus | null>,

    // Project persistence extended fields
    projectTemplate: 'default' as string,
    projectDescription: '' as string,
    projectTags: [] as string[],
    projectSchemaVersion: 1,
    projectCreatedAt: null as string | null,

    // Transcript extended
    transcriptSpeakers: [] as TranscriptSpeaker[],
    scriptDocument: null as ScriptDocument | null,
    transcriptionSettings: {
      language: 'en',
      provider: 'browser',
      autoTranscribe: false,
    },

    // Version history
    versionHistoryRetentionPreference: 'session' as 'manual' | 'session',
    versionHistoryCompareMode: 'summary' as 'summary' | 'details',

    // Sequence source
    sourceSequenceId: null as string | null,
    showSequenceBin: false,

    // Actions
    setPlayhead: (t) => set((s) => { s.playheadTime = Math.max(0, Math.min(t, s.duration)); }),
    togglePlay: () => {
      const wasPlaying = get().isPlaying;
      set((s) => { s.isPlaying = !wasPlaying; });

      if (!wasPlaying) {
        // Start: sync PlaybackEngine from store and start RAF loop
        const fps = get().sequenceSettings.fps;
        playbackEngine.fps = fps;
        playbackEngine.currentFrame = get().playheadTime * fps;
        playbackEngine.play();
      } else {
        // Stop
        playbackEngine.pause();
      }
    },
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
      if (track) {
        // Ensure intrinsic props exist
        if (!clip.intrinsicVideo) clip.intrinsicVideo = { ...DEFAULT_INTRINSIC_VIDEO };
        if (!clip.intrinsicAudio) clip.intrinsicAudio = { ...DEFAULT_INTRINSIC_AUDIO };
        if (!clip.timeRemap) clip.timeRemap = { ...DEFAULT_TIME_REMAP };
        track.clips.push(clip);
      }
    }),
    removeClip: (clipId) => set((s) => {
      s.tracks.forEach(t => { t.clips = t.clips.filter(c => c.id !== clipId); });
    }),
    moveClip: (clipId, newTrackId, newStart) => set((s) => {
      let movedClip: Clip | undefined;
      s.tracks.forEach(t => {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) { movedClip = { ...t.clips[idx]! }; t.clips.splice(idx, 1); }
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
          if (time <= orig!.startTime || time >= orig!.endTime) return;
          const newClip: Clip = {
            ...orig!,
            id: `${orig!.id}_split_${Date.now()}`,
            startTime: time,
            intrinsicVideo: { ...orig!.intrinsicVideo },
            intrinsicAudio: { ...orig!.intrinsicAudio },
            timeRemap: { ...orig!.timeRemap, keyframes: orig!.timeRemap.keyframes.map(kf => ({ ...kf })) },
          };
          orig!.endTime = time;
          t.clips.splice(idx + 1, 0, newClip);
        }
      });
    }),
    splitClipWithId: (clipId, time, newClipId) => set((s) => {
      for (const t of s.tracks) {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const orig = t.clips[idx];
          if (time <= orig!.startTime || time >= orig!.endTime) return;
          const newClip: Clip = {
            ...orig!,
            id: newClipId,
            startTime: time,
            intrinsicVideo: { ...orig!.intrinsicVideo },
            intrinsicAudio: { ...orig!.intrinsicAudio },
            timeRemap: { ...orig!.timeRemap, keyframes: orig!.timeRemap.keyframes.map(kf => ({ ...kf })) },
          };
          orig!.endTime = time;
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
      // Clear inspected clip when user explicitly selects — selection takes precedence
      s.inspectedClipId = null;
    }),
    clearSelection: () => set((s) => { s.selectedClipIds = []; s.inspectedClipId = null; }),
    setInspectedClip: (clipId) => set((s) => { s.inspectedClipId = clipId; }),

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

    setSourceAsset: (asset) => {
      set((s) => {
        s.sourceAsset = asset;
        s.sourceInPoint = null;
        s.sourceOutPoint = null;
        s.sourcePlayhead = 0;
      });
      // Load the video into VideoSourceManager for real playback
      if (asset && (asset.fileHandle || asset.playbackUrl)) {
        const urlOrFile = asset.fileHandle ?? asset.playbackUrl!;
        videoSourceManager.loadSource(asset.id, urlOrFile).then((source) => {
          videoSourceManager.setActiveSource(asset.id);
          // Update duration from real video metadata if not already set
          const dur = isFinite(source.duration) ? source.duration : 0;
          if (dur > 0 && (!asset.duration || !isFinite(asset.duration) || asset.duration === 0)) {
            set((s) => {
              if (s.sourceAsset?.id === asset.id) {
                s.sourceAsset.duration = dur;
              }
            });
          }
        }).catch((err) => {
          console.warn('[setSourceAsset] Failed to load video:', err.message);
        });
        // Also set the player store source clip for SourceMonitor rendering
        usePlayerStore.getState().setSourceClip(asset.id);
      } else {
        videoSourceManager.setActiveSource(null);
        usePlayerStore.getState().setSourceClip(null);
      }
    },
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
    toggleSharePanel: () => set((s) => { s.showSharePanel = !s.showSharePanel; }),
    toggleSettingsPanel: () => set((s) => { s.showSettingsPanel = !s.showSettingsPanel; }),
    toggleCommandPalette: (open) => set((s) => {
      s.isCommandPaletteOpen = typeof open === 'boolean' ? open : !s.isCommandPaletteOpen;
    }),
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
            intrinsicVideo: { ...clip.intrinsicVideo },
            intrinsicAudio: { ...clip.intrinsicAudio },
            timeRemap: { ...clip.timeRemap, keyframes: clip.timeRemap.keyframes.map(kf => ({ ...kf })) },
            waveformData: clip.waveformData ? [...clip.waveformData] : undefined,
          };
          t.clips.push(newClip);
          s.selectedClipIds = [newClip.id];
          return;
        }
      }
    }),
    appendAssetToTimeline: (assetId) => set((s) => {
      const asset = findAssetById(s.bins, assetId);
      if (!asset) {
        return;
      }

      // Auto-create sequence + tracks if needed (matches first clip's fps/res)
      const targetTrack = ensureSequenceAndTracks(s, asset);

      const startTime = Math.max(
        s.playheadTime,
        ...targetTrack.clips.map((clip) => clip.endTime),
      );
      const duration = asset.duration ?? (asset.type === 'AUDIO' ? 12 : 6);
      const clip: Clip = makeClip({
        id: createId('clip'),
        trackId: targetTrack.id,
        name: asset.name,
        startTime,
        endTime: startTime + duration,
        trimStart: 0,
        trimEnd: 0,
        type: getClipTypeForAsset(asset),
        assetId: asset.id,
        color: targetTrack.color,
        waveformData: asset.waveformData,
      });
      targetTrack.clips.push(clip);
      s.selectedClipIds = [clip.id];
      s.sourceAsset = asset;
      // Update timeline duration
      if (clip.endTime > s.duration) s.duration = clip.endTime + 5;
      s.playheadTime = clip.endTime;
    }),

    // Overwrite edit — places source clip at playhead, overwriting existing material
    overwriteEdit: () => set((s) => {
      const asset = s.sourceAsset;
      if (!asset) return;

      // Auto-create sequence + tracks if needed (matches first clip's fps/res)
      ensureSequenceAndTracks(s, asset);

      // Use source in/out points if set, otherwise use full clip duration
      const srcIn = s.sourceInPoint ?? 0;
      const srcOut = s.sourceOutPoint ?? (asset.duration ?? 6);
      const editDuration = srcOut - srcIn;
      if (editDuration <= 0) return;

      const startTime = s.playheadTime;
      const endTime = startTime + editDuration;

      // Determine target tracks via track patching engine.
      // If patches exist and are enabled, use only patched+enabled tracks.
      // Otherwise fall back to the preferred track.
      const patches = trackPatchingEngine.getPatches();
      const enabledPatches = patches.filter((p) => p.enabled && trackPatchingEngine.isRecordTrackEnabled(p.recordTrackId));

      const targetTracks: Track[] = [];
      if (enabledPatches.length > 0) {
        // Use patching — only edit onto patched+enabled record tracks
        for (const patch of enabledPatches) {
          const track = s.tracks.find((t) => t.id === patch.recordTrackId);
          if (track && !track.locked) targetTracks.push(track);
        }
      } else {
        // Fallback: use the preferred track (backward compat)
        const fallback = getPreferredTrack(s, asset);
        if (fallback) targetTracks.push(fallback);
      }

      if (targetTracks.length === 0) return;

      const newClipIds: string[] = [];

      for (const targetTrack of targetTracks) {
        // Remove or trim overlapping clips in the target range
        targetTrack.clips = targetTrack.clips.filter((c) => {
          if (c.endTime <= startTime || c.startTime >= endTime) return true;
          if (c.startTime >= startTime && c.endTime <= endTime) return false;
          if (c.startTime < startTime && c.endTime > startTime && c.endTime <= endTime) {
            c.endTime = startTime;
            return true;
          }
          if (c.startTime >= startTime && c.startTime < endTime && c.endTime > endTime) {
            c.trimStart += (endTime - c.startTime);
            c.startTime = endTime;
            return true;
          }
          if (c.startTime < startTime && c.endTime > endTime) {
            const tailClip: Clip = makeClip({
              id: createId('clip'),
              trackId: targetTrack.id,
              name: c.name,
              startTime: endTime,
              endTime: c.endTime,
              trimStart: c.trimStart + (endTime - c.startTime),
              trimEnd: c.trimEnd,
              type: c.type,
              assetId: c.assetId,
              color: c.color,
              waveformData: c.waveformData,
            });
            c.endTime = startTime;
            targetTrack.clips.push(tailClip);
            return true;
          }
          return true;
        });

        // Insert the new clip
        const newClip: Clip = makeClip({
          id: createId('clip'),
          trackId: targetTrack.id,
          name: asset.name,
          startTime,
          endTime,
          trimStart: srcIn,
          trimEnd: (asset.duration ?? srcOut) - srcOut,
          type: getClipTypeForAsset(asset),
          assetId: asset.id,
          color: targetTrack.color,
          waveformData: asset.waveformData,
        });
        targetTrack.clips.push(newClip);
        targetTrack.clips.sort((a, b) => a.startTime - b.startTime);
        newClipIds.push(newClip.id);
      }

      s.selectedClipIds = newClipIds;
      if (endTime > s.duration) s.duration = endTime + 5;
      s.playheadTime = endTime;
    }),

    // Insert edit — places source clip at playhead, pushing downstream clips forward.
    // Patching-aware: uses trackPatchingEngine for target track selection.
    // Sync-locked tracks receive compensating filler insertions.
    insertEdit: () => set((s) => {
      const asset = s.sourceAsset;
      if (!asset) return;

      // Auto-create sequence + tracks if needed (matches first clip's fps/res)
      ensureSequenceAndTracks(s, asset);

      const srcIn = s.sourceInPoint ?? 0;
      const srcOut = s.sourceOutPoint ?? (asset.duration ?? 6);
      const editDuration = srcOut - srcIn;
      if (editDuration <= 0) return;

      const startTime = s.playheadTime;
      const endTime = startTime + editDuration;

      // Determine target tracks via track patching
      const patches = trackPatchingEngine.getPatches();
      const enabledPatches = patches.filter((p) => p.enabled && trackPatchingEngine.isRecordTrackEnabled(p.recordTrackId));

      const targetTracks: Track[] = [];
      if (enabledPatches.length > 0) {
        for (const patch of enabledPatches) {
          const track = s.tracks.find((t) => t.id === patch.recordTrackId);
          if (track && !track.locked) targetTracks.push(track);
        }
      } else {
        const fallback = getPreferredTrack(s, asset);
        if (fallback) targetTracks.push(fallback);
      }

      if (targetTracks.length === 0) return;

      const editedTrackIds = targetTracks.map((t) => t.id);
      const newClipIds: string[] = [];

      for (const targetTrack of targetTracks) {
        // Push all clips that start at or after the insert point forward
        for (const c of targetTrack.clips) {
          if (c.startTime >= startTime) {
            c.startTime += editDuration;
            c.endTime += editDuration;
          } else if (c.startTime < startTime && c.endTime > startTime) {
            const tailClip: Clip = makeClip({
              id: createId('clip'),
              trackId: targetTrack.id,
              name: c.name,
              startTime: endTime,
              endTime: c.endTime + editDuration,
              trimStart: c.trimStart + (startTime - c.startTime),
              trimEnd: c.trimEnd,
              type: c.type,
              assetId: c.assetId,
              color: c.color,
              waveformData: c.waveformData,
            });
            c.endTime = startTime;
            targetTrack.clips.push(tailClip);
          }
        }

        // Insert the new clip
        const newClip: Clip = makeClip({
          id: createId('clip'),
          trackId: targetTrack.id,
          name: asset.name,
          startTime,
          endTime,
          trimStart: srcIn,
          trimEnd: (asset.duration ?? srcOut) - srcOut,
          type: getClipTypeForAsset(asset),
          assetId: asset.id,
          color: targetTrack.color,
          waveformData: asset.waveformData,
        });
        targetTrack.clips.push(newClip);
        targetTrack.clips.sort((a, b) => a.startTime - b.startTime);
        newClipIds.push(newClip.id);
      }

      // Sync lock compensation: push clips on sync-locked non-edited tracks
      const syncTracks = trackPatchingEngine.getTracksNeedingSyncCompensation(editedTrackIds);
      for (const syncTrackId of syncTracks) {
        const syncTrack = s.tracks.find((t) => t.id === syncTrackId);
        if (!syncTrack) continue;
        for (const c of syncTrack.clips) {
          if (c.startTime >= startTime) {
            c.startTime += editDuration;
            c.endTime += editDuration;
          }
        }
      }

      s.selectedClipIds = newClipIds;
      const allEnds = targetTracks.flatMap((t) => t.clips.map((c) => c.endTime));
      const maxEnd = Math.max(endTime, ...allEnds);
      if (maxEnd > s.duration) s.duration = maxEnd + 5;
      s.playheadTime = endTime;
    }),

    razorAtPlayhead: () => set((s) => {
      const splitTime = s.playheadTime;
      for (const track of s.tracks) {
        if (track.locked) {
          continue;
        }

        for (let index = 0; index < track.clips.length; index += 1) {
          const clip = track.clips[index];
          if (clip!.startTime! < splitTime && clip!.endTime! > splitTime) {
            const nextClip: Clip = {
              ...clip!,
              id: createId('clip'),
              startTime: splitTime,
              intrinsicVideo: { ...clip!.intrinsicVideo },
              intrinsicAudio: { ...clip!.intrinsicAudio },
              timeRemap: { ...clip!.timeRemap, keyframes: clip!.timeRemap.keyframes.map(kf => ({ ...kf })) },
            };
            clip!.endTime! = splitTime;
            track.clips.splice(index + 1, 0, nextClip);
            index += 1;
          }
        }
      }
    }),
    matchFrame: () => set((s) => {
      for (const track of s.tracks) {
        const clip = track.clips.find((item) => item.startTime <= s.playheadTime && item.endTime >= s.playheadTime);
        if (!clip?.assetId) {
          continue;
        }

        const asset = findAssetById(s.bins, clip.assetId);
        if (asset) {
          s.sourceAsset = asset;
        }
        return;
      }
    }),
    addMarkerAtPlayhead: (label) => set((s) => {
      s.markers.push({
        id: createId('marker'),
        time: s.playheadTime,
        label: label ?? 'Marker',
        color: '#f59e0b',
      });
    }),
    setInToPlayhead: () => set((s) => { s.inPoint = s.playheadTime; }),
    setOutToPlayhead: () => set((s) => { s.outPoint = s.playheadTime; }),
    clearInOut: () => set((s) => {
      s.inPoint = null;
      s.outPoint = null;
    }),
    liftSelection: () => set((s) => {
      if (s.selectedClipIds.length === 0) {
        return;
      }
      s.tracks.forEach((track) => {
        track.clips = track.clips.filter((clip) => !s.selectedClipIds.includes(clip.id));
      });
      s.selectedClipIds = [];
    }),
    extractSelection: () => set((s) => {
      if (s.selectedClipIds.length === 0) {
        return;
      }

      s.tracks.forEach((track) => {
        const removed = track.clips.filter((clip) => s.selectedClipIds.includes(clip.id));
        if (removed.length === 0) {
          return;
        }

        const removedDuration = removed.reduce((total, clip) => total + (clip.endTime - clip.startTime), 0);
        const firstRemovedStart = Math.min(...removed.map((clip) => clip.startTime));
        track.clips = track.clips
          .filter((clip) => !s.selectedClipIds.includes(clip.id))
          .map((clip) => {
            if (clip.startTime <= firstRemovedStart) {
              return clip;
            }
            return {
              ...clip,
              startTime: Math.max(firstRemovedStart, clip.startTime - removedDuration),
              endTime: Math.max(firstRemovedStart, clip.endTime - removedDuration),
            };
          });
      });
      s.selectedClipIds = [];
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
        sequences: [],
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
    addReviewComment: ({ body, author = 'You', role = 'Reviewer', color = '#7c5cfc' }) => set((s) => {
      s.reviewComments.unshift({
        id: createId('comment'),
        author,
        role,
        body,
        color,
        time: s.playheadTime,
        status: 'OPEN',
      });
    }),
    setApprovalStatus: (approvalId, status, notes) => set((s) => {
      const approval = s.approvals.find((item) => item.id === approvalId);
      if (approval) {
        approval.status = status;
        if (typeof notes === 'string') {
          approval.notes = notes;
        }
      }
    }),
    queuePublishJob: ({ label, preset, destination }) => {
      const jobId = createId('publish');
      set((s) => {
        s.publishJobs.unshift({
          id: jobId,
          label,
          preset,
          destination,
          status: 'QUEUED',
          progress: 0,
        });
      });
      return jobId;
    },
    updatePublishJob: (jobId, patch) => set((s) => {
      const job = s.publishJobs.find((item) => item.id === jobId);
      if (job) {
        Object.assign(job, patch);
      }
    }),

    // Enhanced trim operations
    rippleDelete: (clipId) => set((s) => {
      for (const t of s.tracks) {
        const idx = t.clips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const clip = t.clips[idx];
          const dur = clip!.endTime! - clip!.startTime!;
          // Remove the clip
          t.clips.splice(idx, 1);
          // Shift all subsequent clips left by the deleted duration
          for (let i = idx; i < t.clips.length; i++) {
            if (t.clips[i]!.startTime >= clip!.startTime!) {
              t.clips[i]!.startTime -= dur;
              t.clips[i]!.endTime -= dur;
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
            if (next) next.startTime = Math.max(clip!.endTime! + delta, clip!.endTime! - (next.endTime - next.startTime) + 0.1);
          } else {
            // Sliding right: trim next clip shorter, prev clip ends later
            if (next) next.startTime = Math.min(next.endTime - 0.1, next.startTime + delta);
            if (prev) prev.endTime = Math.min(clip!.startTime! + delta, clip!.startTime! + (prev.endTime - prev.startTime) - 0.1);
          }
          // Adjust the source offset (trim points)
          clip!.trimStart! = Math.max(0, clip!.trimStart! + delta);
          clip!.trimEnd! = Math.max(0, clip!.trimEnd! - delta);
          return;
        }
      }
    }),

    // Intrinsic property updates
    updateIntrinsicVideo: (clipId, patch) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) { Object.assign(c.intrinsicVideo, patch); return; }
      }
    }),
    updateIntrinsicAudio: (clipId, patch) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) { Object.assign(c.intrinsicAudio, patch); return; }
      }
    }),
    updateTimeRemap: (clipId, patch) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) { Object.assign(c.timeRemap, patch); return; }
      }
    }),
    addTimeRemapKeyframe: (clipId, keyframe) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) {
          c.timeRemap.keyframes = c.timeRemap.keyframes
            .filter(kf => Math.abs(kf.timelineTime - keyframe.timelineTime) > 0.001);
          c.timeRemap.keyframes.push(keyframe);
          c.timeRemap.keyframes.sort((a, b) => a.timelineTime - b.timelineTime);
          return;
        }
      }
    }),
    removeTimeRemapKeyframe: (clipId, timelineTime) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) {
          c.timeRemap.keyframes = c.timeRemap.keyframes
            .filter(kf => Math.abs(kf.timelineTime - timelineTime) > 0.001);
          return;
        }
      }
    }),
    resetIntrinsicVideo: (clipId) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) { c.intrinsicVideo = { ...DEFAULT_INTRINSIC_VIDEO }; return; }
      }
    }),
    resetIntrinsicAudio: (clipId) => set((s) => {
      for (const t of s.tracks) {
        const c = t.clips.find(c => c.id === clipId);
        if (c) { c.intrinsicAudio = { ...DEFAULT_INTRINSIC_AUDIO }; return; }
      }
    }),

    // ─── Source Monitor ──────────────────────────────────────────────────────────
    setSourceInPoint: (t) => set((s) => { s.sourceInPoint = t; }),
    setSourceOutPoint: (t) => set((s) => { s.sourceOutPoint = t; }),
    setSourcePlayhead: (t) => set((s) => { s.sourcePlayhead = isFinite(t) ? Math.max(0, t) : 0; }),
    setSourceInToPlayhead: () => set((s) => { s.sourceInPoint = s.sourcePlayhead; }),
    setSourceOutToPlayhead: () => set((s) => { s.sourceOutPoint = s.sourcePlayhead; }),
    clearSourceInOut: () => set((s) => { s.sourceInPoint = null; s.sourceOutPoint = null; }),

    // ─── Track Enable/Disable ─────────────────────────────────────────────────
    enableTrack: (trackId) => set((s) => {
      if (!s.enabledTrackIds.includes(trackId)) {
        s.enabledTrackIds.push(trackId);
      }
    }),
    disableTrack: (trackId) => set((s) => {
      s.enabledTrackIds = s.enabledTrackIds.filter(id => id !== trackId);
    }),
    toggleTrackEnabled: (trackId) => set((s) => {
      const idx = s.enabledTrackIds.indexOf(trackId);
      if (idx >= 0) {
        s.enabledTrackIds.splice(idx, 1);
      } else {
        s.enabledTrackIds.push(trackId);
      }
    }),
    isTrackEnabled: (trackId) => {
      return get().enabledTrackIds.includes(trackId);
    },

    // ─── Sync Lock ────────────────────────────────────────────────────────────
    toggleSyncLock: (trackId) => set((s) => {
      const idx = s.syncLockedTrackIds.indexOf(trackId);
      if (idx >= 0) {
        s.syncLockedTrackIds.splice(idx, 1);
      } else {
        s.syncLockedTrackIds.push(trackId);
      }
    }),
    isSyncLocked: (trackId) => {
      return get().syncLockedTrackIds.includes(trackId);
    },

    // ─── Trim Mode ────────────────────────────────────────────────────────────
    setTrimMode: (mode) => set((s) => { s.trimMode = mode; }),
    setTrimActive: (active) => set((s) => { s.trimActive = active; }),
    cycleTrimMode: () => set((s) => {
      if (!s.trimActive) {
        // First press of U: enter trim mode as Roll
        s.trimActive = true;
        s.trimMode = 'roll';
        s.trimCycleState = 'roll';
      } else {
        // Subsequent presses: cycle Roll -> Ripple A-side -> Ripple B-side -> Roll
        switch (s.trimCycleState) {
          case 'roll':
            s.trimCycleState = 'ripple-a';
            s.trimMode = 'ripple';
            break;
          case 'ripple-a':
            s.trimCycleState = 'ripple-b';
            s.trimMode = 'ripple';
            break;
          case 'ripple-b':
            s.trimCycleState = 'roll';
            s.trimMode = 'roll';
            break;
        }
      }
      // Clear asymmetric state on mode cycle
      s.asymmetricTrimState = {};
    }),
    exitTrimMode: () => set((s) => {
      s.trimActive = false;
      s.trimMode = 'off';
      s.trimCycleState = 'roll';
      s.asymmetricTrimState = {};
    }),
    setTrimCycleState: (state) => set((s) => { s.trimCycleState = state; }),
    setAsymmetricTrimRoller: (trackId, mode) => set((s) => {
      s.asymmetricTrimState[trackId] = mode;
      // If any track differs from the others, we are in asymmetric mode
      const modes = new Set(Object.values(s.asymmetricTrimState));
      if (modes.size > 1) {
        s.trimMode = 'asymmetric';
      }
    }),
    clearAsymmetricTrimState: () => set((s) => { s.asymmetricTrimState = {}; }),

    // ─── Smart Tool ───────────────────────────────────────────────────────────
    toggleSmartToolLiftOverwrite: () => set((s) => { s.smartToolLiftOverwrite = !s.smartToolLiftOverwrite; }),
    toggleSmartToolExtractSplice: () => set((s) => { s.smartToolExtractSplice = !s.smartToolExtractSplice; }),
    toggleSmartToolOverwriteTrim: () => set((s) => { s.smartToolOverwriteTrim = !s.smartToolOverwriteTrim; }),
    toggleSmartToolRippleTrim: () => set((s) => { s.smartToolRippleTrim = !s.smartToolRippleTrim; }),
    setSmartToolQuadrant: (quadrant) => set((s) => { s.smartToolQuadrant = quadrant; }),

    // ─── Multicam ─────────────────────────────────────────────────────────────
    setMulticamActive: (active) => set((s) => { s.multicamActive = active; }),
    setMulticamGroupId: (groupId) => set((s) => { s.multicamGroupId = groupId; }),
    setMulticamDisplayMode: (mode) => set((s) => { s.multicamDisplayMode = mode; }),

    // ─── Clip Display ─────────────────────────────────────────────────────────
    setProjectClipColor: (color) => set((s) => { s.projectClipColor = color; }),

    // ─── Track Patching (store integration) ──────────────────────────────────
    patchSourceToRecord: (sourceId, recordId) => {
      trackPatchingEngine.patchSourceToRecord(sourceId, recordId);
      const patches = trackPatchingEngine.getPatches();
      const map: Record<string, string> = {};
      for (const p of patches) { map[p.sourceTrackId] = p.recordTrackId; }
      set((s) => { s.trackPatchMap = map; });
    },
    unpatchSource: (sourceId) => {
      trackPatchingEngine.unpatchSource(sourceId);
      const patches = trackPatchingEngine.getPatches();
      const map: Record<string, string> = {};
      for (const p of patches) { map[p.sourceTrackId] = p.recordTrackId; }
      set((s) => { s.trackPatchMap = map; });
    },
    unpatchRecord: (recordId) => {
      trackPatchingEngine.unpatchRecord(recordId);
      const patches = trackPatchingEngine.getPatches();
      const map: Record<string, string> = {};
      for (const p of patches) { map[p.sourceTrackId] = p.recordTrackId; }
      set((s) => { s.trackPatchMap = map; });
    },
    autoMatchPatch: () => {
      const tracks = get().tracks;
      trackPatchingEngine.autoMatchPatch(tracks);
      const patches = trackPatchingEngine.getPatches();
      const map: Record<string, string> = {};
      for (const p of patches) { map[p.sourceTrackId] = p.recordTrackId; }
      set((s) => { s.trackPatchMap = map; });
    },
    toggleDupeDetection: () => set((s) => { s.dupeDetectionEnabled = !s.dupeDetectionEnabled; }),
    setClipTextDisplay: (mode) => set((s) => { s.clipTextDisplay = mode; }),

    // ─── Track Heights ────────────────────────────────────────────────────────
    setTrackHeight: (trackId, height) => set((s) => {
      s.trackHeights[trackId] = Math.max(30, Math.min(300, height));
    }),
    enlargeTrack: (trackId) => set((s) => {
      const current = s.trackHeights[trackId] ?? 60;
      s.trackHeights[trackId] = Math.min(300, current + 20);
    }),
    reduceTrack: (trackId) => set((s) => {
      const current = s.trackHeights[trackId] ?? 60;
      s.trackHeights[trackId] = Math.max(30, current - 20);
    }),

    // ─── Composer ─────────────────────────────────────────────────────────────
    setComposerLayout: (layout) => set((s) => { s.composerLayout = layout; }),
    toggleTrackingInfo: () => set((s) => { s.showTrackingInfo = !s.showTrackingInfo; }),

    // ─── Audio (extended) ─────────────────────────────────────────────────────
    toggleAudioScrub: () => set((s) => { s.audioScrubEnabled = !s.audioScrubEnabled; }),
    toggleSoloSafe: () => set((s) => { s.soloSafeMode = !s.soloSafeMode; }),

    // ─── Workspace ────────────────────────────────────────────────────────────
    setActiveWorkspace: (id) => set((s) => { s.activeWorkspaceId = id; }),

    // ─── Navigation (Avid parity) ─────────────────────────────────────────────
    goToNextEditPoint: () => set((s) => {
      const current = s.playheadTime;
      let nearest = Infinity;
      for (const track of s.tracks) {
        if (!s.enabledTrackIds.includes(track.id)) continue;
        for (const clip of track.clips) {
          if (clip.startTime > current + 0.001 && clip.startTime < nearest) {
            nearest = clip.startTime;
          }
          if (clip.endTime > current + 0.001 && clip.endTime < nearest) {
            nearest = clip.endTime;
          }
        }
      }
      if (nearest < Infinity) {
        s.playheadTime = nearest;
      }
    }),
    goToPrevEditPoint: () => set((s) => {
      const current = s.playheadTime;
      let nearest = -Infinity;
      for (const track of s.tracks) {
        if (!s.enabledTrackIds.includes(track.id)) continue;
        for (const clip of track.clips) {
          if (clip.startTime < current - 0.001 && clip.startTime > nearest) {
            nearest = clip.startTime;
          }
          if (clip.endTime < current - 0.001 && clip.endTime > nearest) {
            nearest = clip.endTime;
          }
        }
      }
      if (nearest > -Infinity) {
        s.playheadTime = nearest;
      }
    }),
    goToStart: () => set((s) => { s.playheadTime = 0; }),
    goToEnd: () => set((s) => { s.playheadTime = s.duration; }),

    loadProject: (id) => {
      set((s) => { s.projectId = id; });
      getProjectFromRepository(id).then((project) => {
        if (!project) return;
        set((s) => {
          const pAny = project as any;
          s.projectName = pAny.name ?? 'Untitled Project';
          s.lastSavedAt = pAny.updatedAt ?? null;
          s.projectCreatedAt = pAny.createdAt ?? null;
          s.saveStatus = 'saved';

          // Hydrate bins recursively (including children and sequences)
          const hydrateBins = (rawBins: any[]): Bin[] => rawBins.map((b: any) => ({
            id: b.id, name: b.name, color: b.color ?? '#818cf8',
            parentId: b.parentId, isOpen: b.isOpen ?? false,
            children: hydrateBins(b.children ?? []),
            assets: (b.assets ?? []).map((a: any) => ({
              id: a.id, name: a.name ?? 'Untitled', type: a.type ?? 'VIDEO',
              duration: a.duration ?? 0, status: a.status ?? 'READY' as const,
              tags: a.tags ?? [], isFavorite: false,
              width: a.width, height: a.height, fps: a.fps,
              codec: a.codec, fileSize: a.fileSize,
              colorSpace: a.colorSpace, startTimecode: a.startTimecode,
              sampleRate: a.sampleRate, audioChannels: a.audioChannels,
            })),
            sequences: (b.sequences ?? []).map((sq: any) => ({
              id: sq.id, name: sq.name, settings: sq.settings,
              tracks: sq.tracks ?? [], duration: sq.duration ?? 0,
              createdAt: sq.createdAt ?? new Date().toISOString(),
              modifiedAt: sq.modifiedAt ?? new Date().toISOString(),
            })),
          }));

          if (pAny.bins && pAny.bins.length > 0) {
            s.bins = hydrateBins(pAny.bins);
          }

          // Collect all sequences from bins into the flat sequences array
          const allSequences: Sequence[] = [];
          const collectSequences = (bins: Bin[]) => {
            for (const bin of bins) {
              if (bin.sequences) allSequences.push(...bin.sequences);
              collectSequences(bin.children);
            }
          };
          collectSequences(s.bins);
          s.sequences = allSequences;

          // Activate the first sequence if available
          if (allSequences.length > 0) {
            const seq = allSequences[0]!;
            s.activeSequenceId = seq.id;
            s.sequenceSettings = { ...seq.settings };
            if (seq.tracks.length > 0) {
              s.tracks = JSON.parse(JSON.stringify(seq.tracks));
            }
            s.duration = seq.duration;
          } else if (pAny.sequences && pAny.sequences.length > 0) {
            // Legacy fallback: sequences stored at project root
            const seq = pAny.sequences[0];
            if (seq && seq.tracks && seq.tracks.length > 0) {
              s.tracks = seq.tracks;
            }
          }

          // Hydrate project settings if persisted
          if (pAny.settings) {
            Object.assign(s.projectSettings, pAny.settings);
          }
        });
      }).catch((err: unknown) => {
        console.warn('[loadProject] Failed to hydrate:', err);
      });
    },

    addToRenderQueue: (job) => {
      const id = createId('render');
      set((s) => {
        s.renderQueue.push({ ...job, id, status: 'queued', progress: 0, createdAt: new Date().toISOString() });
      });
      return id;
    },
    removeFromRenderQueue: (jobId) => set((s) => {
      s.renderQueue = s.renderQueue.filter((j) => j.id !== jobId);
    }),
    updateRenderJobProgress: (jobId, progress) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) job.progress = Math.min(100, Math.max(0, progress));
    }),
    updateRenderJobStatus: (jobId, status, error) => set((s) => {
      const job = s.renderQueue.find((j) => j.id === jobId);
      if (job) {
        job.status = status;
        if (error) job.error = error;
        if (status === 'complete') job.progress = 100;
      }
    }),
    clearCompletedRenderJobs: () => set((s) => {
      s.renderQueue = s.renderQueue.filter((j) => j.status !== 'complete');
    }),
    startRenderJob: (jobId) => {
      set((s) => {
        const job = s.renderQueue.find((j) => j.id === jobId);
        if (job && job.status === 'queued') { job.status = 'rendering'; job.progress = 0; }
      });
      const interval = setInterval(() => {
        const state = get();
        const renderJob = state.renderQueue.find((j: RenderJob) => j.id === jobId);
        if (!renderJob || renderJob.status !== 'rendering') { clearInterval(interval); return; }
        const nextProgress = renderJob.progress + 2;
        if (nextProgress >= 100) {
          clearInterval(interval);
          set((s) => { const rj = s.renderQueue.find((x) => x.id === jobId); if (rj) { rj.progress = 100; rj.status = 'complete'; } });
        } else {
          set((s) => { const rj = s.renderQueue.find((x) => x.id === jobId); if (rj) rj.progress = nextProgress; });
        }
      }, 100);
    },

    saveProject: async () => {
      const state = get();
      if (!state.projectId) return;
      set((s) => { s.saveStatus = 'saving'; });
      try {
        const serializeBins = (bins: Bin[]): any[] => bins.map((b) => ({
          id: b.id, name: b.name, color: b.color, parentId: b.parentId,
          isOpen: b.isOpen,
          children: serializeBins(b.children),
          assets: b.assets.map((a) => ({
            id: a.id, name: a.name, type: a.type, duration: a.duration,
            width: a.width, height: a.height, fps: a.fps, codec: a.codec,
            fileSize: a.fileSize, tags: a.tags, status: a.status,
            colorSpace: a.colorSpace, startTimecode: a.startTimecode,
            sampleRate: a.sampleRate, audioChannels: a.audioChannels,
          })),
          sequences: (b.sequences ?? []).map((sq) => ({
            id: sq.id, name: sq.name, settings: sq.settings,
            tracks: sq.tracks, duration: sq.duration,
            createdAt: sq.createdAt, modifiedAt: sq.modifiedAt,
          })),
        }));
        const project = {
          id: state.projectId, schemaVersion: 2,
          name: state.projectName,
          createdAt: state.projectCreatedAt ?? state.lastSavedAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          bins: serializeBins(state.bins),
          media: [], settings: state.projectSettings,
        } as unknown as EditorProject;
        await saveProjectToRepository(project);
        set((s) => { s.saveStatus = 'saved'; s.lastSavedAt = new Date().toISOString(); });
      } catch (err) {
        console.error('[saveProject] Failed:', err);
        set((s) => { s.saveStatus = 'error'; });
      }
    },
    markUnsaved: () => set((s) => { s.saveStatus = 'unsaved'; }),

    // Sequence settings
    updateSequenceSettings: (settings) => set((s) => {
      Object.assign(s.sequenceSettings, settings);
      // Sync project settings with sequence settings
      if (settings.width !== undefined) s.projectSettings.width = settings.width;
      if (settings.height !== undefined) s.projectSettings.height = settings.height;
      if (settings.fps !== undefined) s.projectSettings.frameRate = settings.fps;
    }),

    // Media import — real pipeline with metadata extraction
    importMediaFiles: (files, binId) => {
      // Phase 1: Create placeholder assets immediately for UI feedback
      const assetIds: string[] = [];
      set((s) => {
        let targetBin = binId
          ? (function findBin(bins: Bin[]): Bin | null {
              for (const b of bins) {
                if (b.id === binId) return b;
                const child = findBin(b.children);
                if (child) return child;
              }
              return null;
            })(s.bins)
          : s.bins[0] ?? null;

        // Auto-create a default bin if none exist
        if (!targetBin) {
          const newBin: Bin = {
            id: createId('bin'),
            name: 'Media',
            color: '#818cf8',
            isOpen: true,
            children: [],
            assets: [],
            sequences: [],
          };
          s.bins.push(newBin);
          s.selectedBinId = newBin.id;
          targetBin = newBin;
        }

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const mime = file!.type! || '';
          const ext = file!.name.split('.').pop()?.toLowerCase()! ?? '';
          const isVideo = mime.startsWith('video/') || ['mov', 'mxf', 'avi', 'mkv'].includes(ext);
          const isAudio = mime.startsWith('audio/');
          const isImage = mime.startsWith('image/') || ['exr', 'dpx', 'tga', 'psd'].includes(ext);
          const isSvg = ext === 'svg' || mime === 'image/svg+xml';
          const url = URL.createObjectURL(file!);

          const assetId = createId('asset');
          assetIds.push(assetId);

          const asset: MediaAsset = {
            id: assetId,
            name: file!.name!,
            type: isSvg ? 'GRAPHIC' : isVideo ? 'VIDEO' : isAudio ? 'AUDIO' : isImage ? 'IMAGE' : 'DOCUMENT',
            duration: 0,
            status: 'INGESTING',
            playbackUrl: url,
            tags: [],
            isFavorite: false,
            fileSize: file!.size!,
            mimeType: mime,
            fileHandle: file,
          };

          targetBin.assets.push(asset);
          s.ingestProgress[assetId] = 0;
        }

        if (s.selectedBinId === targetBin.id) {
          s.activeBinAssets = [...targetBin.assets];
        }
      });

      // Phase 2: Extract metadata asynchronously per file
      const fileArray = Array.from(files);
      fileArray.forEach(async (file, idx) => {
        const assetId = assetIds[idx];
        if (!assetId) return;

        try {
          const metadata = await mediaProbeEngine.extract(file, (progress) => {
            set((s) => { s.ingestProgress[assetId] = progress; });
          });

          // Store in media database
          await mediaDatabaseEngine.init();
          await mediaDatabaseEngine.addEntry({
            id: assetId,
            fileName: file.name,
            originalPath: file.name, // In browser, we don't have full path
            objectUrl: URL.createObjectURL(file),
            metadata,
            status: 'online',
            binId: binId ?? undefined,
            addedAt: Date.now(),
            lastVerified: Date.now(),
          });

          // Update the asset with real metadata
          set((s) => {
            function findAsset(bins: Bin[]): MediaAsset | null {
              for (const b of bins) {
                const a = b.assets.find((a) => a.id === assetId);
                if (a) return a;
                const child = findAsset(b.children);
                if (child) return child;
              }
              return null;
            }
            const asset = findAsset(s.bins);
            if (asset) {
              asset.status = 'READY';
              asset.duration = isFinite(metadata.duration) ? metadata.duration : 0;
              asset.width = metadata.width;
              asset.height = metadata.height;
              asset.fps = metadata.fps;
              asset.codec = metadata.codec;
              asset.colorSpace = metadata.colorSpace;
              // Infer HDR mode from detected color space / transfer function
              const cs = (metadata.colorSpace ?? '').toLowerCase();
              if (cs.includes('pq') || cs.includes('st2084') || cs.includes('smpte2084')) {
                asset.hdrMode = 'pq';
                asset.isHDR = true;
              } else if (cs.includes('hlg') || cs.includes('arib')) {
                asset.hdrMode = 'hlg';
                asset.isHDR = true;
              } else {
                asset.hdrMode = 'sdr';
                asset.isHDR = false;
              }
              asset.hasAlpha = metadata.hasAlpha;
              // Alpha mode will be set after dialog resolves (see below)
              asset.audioChannels = metadata.audioChannels;
              asset.sampleRate = metadata.sampleRate;
              asset.fileSize = metadata.fileSize;
              asset.startTimecode = metadata.startTimecode;
              asset.bitDepth = metadata.bitDepth;
              asset.mimeType = metadata.mimeType;
              asset.thumbnailUrl = metadata.thumbnailUrl;
              if (metadata.waveformData) {
                asset.waveformData = Array.from(metadata.waveformData);
              }
              asset.mediaDbId = assetId;
            }
            delete s.ingestProgress[assetId];

            // Refresh active bin assets
            const selectedBin = s.selectedBinId
              ? (function find(bins: Bin[]): Bin | null {
                  for (const b of bins) {
                    if (b.id === s.selectedBinId) return b;
                    const c = find(b.children);
                    if (c) return c;
                  }
                  return null;
                })(s.bins)
              : null;
            if (selectedBin) {
              s.activeBinAssets = [...selectedBin.assets];
            }
          });

          // If the imported media has alpha, prompt user for alpha interpretation
          if (metadata.hasAlpha) {
            try {
              const alphaMode = await get().openAlphaImportDialog(assetId);
              set((s) => {
                function findAssetAlpha(bins: Bin[]): MediaAsset | null {
                  for (const b of bins) {
                    const a = b.assets.find((a) => a.id === assetId);
                    if (a) return a;
                    const child = findAssetAlpha(b.children);
                    if (child) return child;
                  }
                  return null;
                }
                const asset = findAssetAlpha(s.bins);
                if (asset) {
                  asset.alphaMode = alphaMode;
                }
              });
            } catch {
              // Dialog was cancelled — default to 'auto'
            }
          }
        } catch (err) {
          console.error('Media ingest failed for', file.name, err);
          set((s) => {
            function findAsset(bins: Bin[]): MediaAsset | null {
              for (const b of bins) {
                const a = b.assets.find((a) => a.id === assetId);
                if (a) return a;
                const child = findAsset(b.children);
                if (child) return child;
              }
              return null;
            }
            const asset = findAsset(s.bins);
            if (asset) asset.status = 'ERROR';
            delete s.ingestProgress[assetId];
          });
        }
      });
    },

    // Dialogs
    toggleNewProjectDialog: () => set((s) => { s.showNewProjectDialog = !s.showNewProjectDialog; }),
    toggleSequenceDialog: () => set((s) => {
      s.showSequenceDialog = !s.showSequenceDialog;
      if (!s.showSequenceDialog) s.sequenceDialogTargetBinId = null;
    }),
    openSequenceDialogForBin: (binId) => set((s) => {
      s.sequenceDialogTargetBinId = binId;
      s.showSequenceDialog = true;
    }),
    toggleTitleTool: () => set((s) => { s.showTitleTool = !s.showTitleTool; }),
    toggleSubtitleEditor: () => set((s) => { s.showSubtitleEditor = !s.showSubtitleEditor; }),
    openAlphaImportDialog: (assetId: string) => {
      return new Promise<AlphaMode>((resolve) => {
        _alphaDialogResolve = resolve;
        set((s) => {
          s.showAlphaImportDialog = true;
          s.alphaDialogAssetId = assetId;
          // Resolve callback stored module-level in _alphaDialogResolve (functions are not Immer-compatible)
        });
      });
    },
    resolveAlphaImportDialog: (mode: AlphaMode) => {
      // Call the resolve callback outside of set() since it's not in the Immer draft
      if (_alphaDialogResolve) {
        _alphaDialogResolve(mode);
        _alphaDialogResolve = null;
      }
      set((s) => {
        // Store the chosen alphaMode on the asset (search all bins recursively)
        if (s.alphaDialogAssetId) {
          const targetId = s.alphaDialogAssetId;
          function findAndSetAlpha(bins: Bin[]): boolean {
            for (const bin of bins) {
              const asset = bin.assets.find((a) => a.id === targetId);
              if (asset) { asset.alphaMode = mode; return true; }
              if (findAndSetAlpha(bin.children)) return true;
            }
            return false;
          }
          findAndSetAlpha(s.bins);
        }
        s.showAlphaImportDialog = false;
        s.alphaDialogAssetId = null;
      });
    },
    cancelAlphaImportDialog: () => {
      if (_alphaDialogResolve) {
        _alphaDialogResolve('auto');
        _alphaDialogResolve = null;
      }
      set((s) => {
        s.showAlphaImportDialog = false;
        s.alphaDialogAssetId = null;
      });
    },

    // Subtitles
    addSubtitleTrack: (track) => set((s) => { s.subtitleTracks.push(track); }),
    addSubtitleCue: (trackId, cue) => set((s) => {
      const track = s.subtitleTracks.find((t) => t.id === trackId);
      if (track) {
        track.cues.push(cue);
        track.cues.sort((a, b) => a.start - b.start);
      }
    }),
    removeSubtitleCue: (trackId, cueId) => set((s) => {
      const track = s.subtitleTracks.find((t) => t.id === trackId);
      if (track) {
        track.cues = track.cues.filter((c) => c.id !== cueId);
      }
    }),

    // Titles
    addTitleClip: (title) => set((s) => { s.titleClips.push(title); }),
    removeTitleClip: (titleId) => set((s) => {
      s.titleClips = s.titleClips.filter((t) => t.id !== titleId);
    }),
    updateTitleClip: (titleId, data) => set((s) => {
      const title = s.titleClips.find((t) => t.id === titleId);
      if (title) Object.assign(title, data);
    }),

    // ── Multi-monitor (Task 1) ────────────────────────────────────────────
    setFullscreenMonitor: (monitor) => set((s) => { s.fullscreenMonitor = monitor; }),
    setPoppedOutMonitor: (monitor) => set((s) => { s.poppedOutMonitor = monitor; }),
    toggleFullscreenMonitor: (monitor) => set((s) => {
      s.fullscreenMonitor = s.fullscreenMonitor === monitor ? null : monitor;
    }),

    // ── Sequences (Task 3) ────────────────────────────────────────────────
    createSequence: (settings, targetBinId) => {
      const id = createId('seq');
      const now = new Date().toISOString();
      set((s) => {
        const seq: Sequence = {
          id,
          name: settings.name || 'Untitled Sequence',
          settings: { ...settings },
          tracks: [],
          duration: 0,
          createdAt: now,
          modifiedAt: now,
        };
        s.sequences.push(seq);
        s.activeSequenceId = id;

        // Add sequence to the target bin (or selected bin, or first bin)
        const binId = targetBinId ?? s.selectedBinId;
        if (binId) {
          const findBin = (bins: Bin[]): Bin | null => {
            for (const b of bins) {
              if (b.id === binId) return b;
              const child = findBin(b.children);
              if (child) return child;
            }
            return null;
          };
          const bin = findBin(s.bins);
          if (bin) {
            if (!bin.sequences) bin.sequences = [];
            bin.sequences.push(seq);
          }
        } else if (s.bins.length > 0) {
          if (!s.bins[0]!.sequences) s.bins[0]!.sequences = [];
          s.bins[0]!.sequences.push(seq);
        }
      });
      return id;
    },
    duplicateSequence: (id) => set((s) => {
      const src = s.sequences.find((seq) => seq.id === id);
      if (!src) return;
      const newId = createId('seq');
      const now = new Date().toISOString();
      const dup: Sequence = {
        id: newId,
        name: src.name + ' Copy',
        settings: { ...src.settings },
        tracks: JSON.parse(JSON.stringify(src.tracks)),
        duration: src.duration,
        createdAt: now,
        modifiedAt: now,
      };
      s.sequences.push(dup);
    }),
    deleteSequence: (id) => set((s) => {
      s.sequences = s.sequences.filter((seq) => seq.id !== id);
      if (s.activeSequenceId === id) {
        s.activeSequenceId = s.sequences.length > 0 ? s.sequences[0]!.id : null;
      }
      const removeFromBins = (bins: Bin[]) => {
        for (const bin of bins) {
          if (bin.sequences) bin.sequences = bin.sequences.filter((sq) => sq.id !== id);
          removeFromBins(bin.children);
        }
      };
      removeFromBins(s.bins);
    }),
    switchSequence: (id) => set((s) => {
      const seq = s.sequences.find((seq) => seq.id === id);
      if (seq) {
        s.activeSequenceId = id;
        s.sequenceSettings = { ...seq.settings };
        s.tracks = JSON.parse(JSON.stringify(seq.tracks));
        s.duration = seq.duration;
      }
    }),
    renameSequence: (id, name) => set((s) => {
      const seq = s.sequences.find((seq) => seq.id === id);
      if (seq) {
        seq.name = name;
        seq.modifiedAt = new Date().toISOString();
      }
      // Also rename in bin tree
      const renameInBins = (bins: Bin[]) => {
        for (const bin of bins) {
          const binSeq = bin.sequences?.find((sq) => sq.id === id);
          if (binSeq) { binSeq.name = name; binSeq.modifiedAt = new Date().toISOString(); return; }
          renameInBins(bin.children);
        }
      };
      renameInBins(s.bins);
    }),
    moveSequenceToBin: (sequenceId, targetBinId) => set((s) => {
      // Find and remove the sequence from its current bin
      let movedSeq: Sequence | null = null;
      const removeFromBins = (bins: Bin[]) => {
        for (const bin of bins) {
          if (bin.sequences) {
            const idx = bin.sequences.findIndex((sq) => sq.id === sequenceId);
            if (idx >= 0) {
              movedSeq = JSON.parse(JSON.stringify(bin.sequences[idx]));
              bin.sequences.splice(idx, 1);
              return;
            }
          }
          removeFromBins(bin.children);
        }
      };
      removeFromBins(s.bins);

      if (!movedSeq) {
        const globalSeq = s.sequences.find((sq) => sq.id === sequenceId);
        if (globalSeq) movedSeq = JSON.parse(JSON.stringify(globalSeq));
      }
      if (!movedSeq) return;

      const findBin = (bins: Bin[]): Bin | null => {
        for (const b of bins) {
          if (b.id === targetBinId) return b;
          const child = findBin(b.children);
          if (child) return child;
        }
        return null;
      };
      const targetBin = findBin(s.bins);
      if (targetBin) {
        if (!targetBin.sequences) targetBin.sequences = [];
        targetBin.sequences.push(movedSeq);
      }
    }),

    // ── Bin management (Task 2) ───────────────────────────────────────────
    renameBin: (binId, name) => set((s) => {
      const findAndRename = (bins: Bin[]): boolean => {
        for (const bin of bins) {
          if (bin.id === binId) { bin.name = name; return true; }
          if (findAndRename(bin.children)) return true;
        }
        return false;
      };
      findAndRename(s.bins);
    }),
    deleteBin: (binId) => set((s) => {
      const removeFromList = (bins: Bin[]): Bin[] => {
        return bins.filter((b) => {
          if (b.id === binId) return false;
          b.children = removeFromList(b.children);
          return true;
        });
      };
      s.bins = removeFromList(s.bins);
      if (s.selectedBinId === binId) {
        s.selectedBinId = s.bins.length > 0 ? s.bins[0]!.id : null;
        s.activeBinAssets = s.bins.length > 0 ? s.bins[0]!.assets : [];
      }
    }),
    setBinColor: (binId, color) => set((s) => {
      const findAndColor = (bins: Bin[]): boolean => {
        for (const bin of bins) {
          if (bin.id === binId) { bin.color = color; return true; }
          if (findAndColor(bin.children)) return true;
        }
        return false;
      };
      findAndColor(s.bins);
    }),
    moveBinTo: (binId, targetParentId) => set((s) => {
      // Find and remove the bin from its current location
      let movedBin: Bin | null = null;
      const removeFrom = (bins: Bin[]): Bin[] => {
        return bins.filter((b) => {
          if (b.id === binId) { movedBin = JSON.parse(JSON.stringify(b)); return false; }
          b.children = removeFrom(b.children);
          return true;
        });
      };
      s.bins = removeFrom(s.bins);
      if (!movedBin) return;

      if (targetParentId === null) {
        // Move to root level
        s.bins.push(movedBin);
      } else {
        // Move into target bin
        const findAndAdd = (bins: Bin[]): boolean => {
          for (const bin of bins) {
            if (bin.id === targetParentId) {
              bin.children.push(movedBin!);
              bin.isOpen = true;
              return true;
            }
            if (findAndAdd(bin.children)) return true;
          }
          return false;
        };
        if (!findAndAdd(s.bins)) {
          // Fallback: add to root if target not found
          s.bins.push(movedBin);
        }
      }
    }),
    setBinSortField: (field) => set((s) => { s.binSortField = field; }),
    toggleBinSortDirection: () => set((s) => {
      s.binSortDirection = s.binSortDirection === 'asc' ? 'desc' : 'asc';
    }),
    selectAsset: (assetId, multi, range) => set((s) => {
      if (multi) {
        // Toggle individual selection
        const idx = s.selectedAssetIds.indexOf(assetId);
        if (idx >= 0) {
          s.selectedAssetIds.splice(idx, 1);
        } else {
          s.selectedAssetIds.push(assetId);
        }
      } else if (range && s.selectedAssetIds.length > 0) {
        // Range select: from last selected to this one
        const allIds = s.activeBinAssets.map((a) => a.id);
        const lastSelected = s.selectedAssetIds[s.selectedAssetIds.length - 1]!;
        const startIdx = allIds.indexOf(lastSelected);
        const endIdx = allIds.indexOf(assetId);
        if (startIdx >= 0 && endIdx >= 0) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          const rangeIds = allIds.slice(from, to + 1);
          // Merge with existing
          for (const id of rangeIds) {
            if (!s.selectedAssetIds.includes(id)) {
              s.selectedAssetIds.push(id);
            }
          }
        }
      } else {
        s.selectedAssetIds = [assetId];
      }
    }),
    clearAssetSelection: () => set((s) => { s.selectedAssetIds = []; }),
    setBinContextMenu: (menu) => set((s) => { s.binContextMenu = menu as any; }),
    setAssetContextMenu: (menu) => set((s) => { s.assetContextMenu = menu as any; }),
    setBinDragOverId: (binId) => set((s) => { s.binDragOverId = binId; }),
    addRecentSearch: (search) => set((s) => {
      const existing = s.recentSearches.indexOf(search);
      if (existing >= 0) s.recentSearches.splice(existing, 1);
      s.recentSearches.unshift(search);
      if (s.recentSearches.length > 10) s.recentSearches.pop();
    }),
    setSearchScope: (scope) => set((s) => { s.searchScope = scope; }),
    toggleSearchFilterChip: (type, value) => set((s) => {
      const chip = s.searchFilterChips.find((c) => c.type === type && c.value === value);
      if (chip) {
        chip.active = !chip.active;
      } else {
        s.searchFilterChips.push({ type, value, active: true });
      }
    }),

    // Trim extended actions
    toggleTrimViewMode: () => set((s) => {
      s.trimViewMode = s.trimViewMode === 'big' ? 'small' : 'big';
    }),
    setTrimViewMode: (mode) => set((s) => { s.trimViewMode = mode; }),
    toggleTrimLoopPlayback: () => set((s) => {
      s.trimLoopPlaybackActive = !s.trimLoopPlaybackActive;
    }),
    setTrimLoopDurationPreset: (preset) => set((s) => {
      s.trimLoopDurationPreset = preset;
      if (preset === 'short') { s.trimLoopPreRollFrames = 6; s.trimLoopPostRollFrames = 6; }
      else if (preset === 'medium') { s.trimLoopPreRollFrames = 12; s.trimLoopPostRollFrames = 12; }
      else if (preset === 'long') { s.trimLoopPreRollFrames = 24; s.trimLoopPostRollFrames = 24; }
    }),
    setTrimLoopRollFrames: (pre, post) => set((s) => {
      s.trimLoopPreRollFrames = pre;
      s.trimLoopPostRollFrames = post;
      s.trimLoopDurationPreset = 'custom';
    }),
    setTrimLoopOffsetFrames: (frames) => set((s) => { s.trimLoopOffsetFrames = frames; }),
    setTrimLoopPlaybackActive: (active) => set((s) => { s.trimLoopPlaybackActive = active; }),
    selectTrimEditPoint: (selection, multi) => set((s) => {
      if (multi) {
        s.selectedTrimEditPoints.push(selection);
      } else {
        s.selectedTrimEditPoints = [selection];
      }
    }),
    clearTrimEditPoints: () => set((s) => { s.selectedTrimEditPoints = []; }),

    // Video monitor track
    setVideoMonitorTrack: (trackId) => set((s) => { s.videoMonitorTrackId = trackId; }),

    // Track color
    updateTrackColor: (trackId, color) => set((s) => {
      const track = s.tracks.find((t) => t.id === trackId);
      if (track) track.color = color;
    }),
    updateBinColor: (binId, color) => set((s) => {
      const findAndColor = (bins: Bin[]) => {
        for (const bin of bins) {
          if (bin.id === binId) { bin.color = color; return; }
          findAndColor(bin.children);
        }
      };
      findAndColor(s.bins);
    }),

    // Desktop monitor audio preview
    setDesktopMonitorAudioPreview: (consumer, status) => set((s) => {
      s.desktopMonitorAudioPreview[consumer] = status;
    }),
    clearDesktopMonitorAudioPreview: (consumer) => set((s) => {
      s.desktopMonitorAudioPreview[consumer] = null;
    }),

    // Transcript extended actions
    updateTranscriptCue: (cueId, patch) => set((s) => {
      const cue = s.transcript.find((c) => c.id === cueId);
      if (cue) Object.assign(cue, patch);
    }),
    replaceTranscript: (cues, speakers) => set((s) => {
      s.transcript = cues as any;
      if (speakers) s.transcriptSpeakers = speakers as any;
    }),
    setScriptDocument: (doc) => set((s) => { s.scriptDocument = doc as any; }),
    updateScriptDocumentText: (lineIdOrText, text) => set((s) => {
      if (s.scriptDocument) {
        if (text !== undefined) {
          // Two-arg form: updateScriptDocumentText(lineId, text)
          const line = s.scriptDocument.lines.find((l) => l.id === lineIdOrText);
          if (line) line.text = text;
        } else {
          // Single-arg form: replace entire script document text
          const { buildScriptDocumentFromText } = require('../lib/transcriptWorkbench');
          const nextDoc = buildScriptDocumentFromText(lineIdOrText, s.scriptDocument);
          Object.assign(s.scriptDocument, nextDoc);
        }
      }
    }),
    syncScriptDocumentToTranscript: () => { /* no-op stub */ },
    updateTranscriptionSettings: (patch) => set((s) => {
      Object.assign(s.transcriptionSettings, patch);
    }),
    buildTranscriptTitleEffects: (_options) => { return 0; },

    // Lift / Extract edits
    liftEdit: () => {
      const state = get();
      state.liftSelection();
    },
    extractEdit: () => {
      const state = get();
      state.extractSelection();
    },

    // Sequence source
    loadSequenceInSource: (seqId) => set((s) => { s.sourceSequenceId = seqId; }),
    setActiveSequence: (seqId) => set((s) => { s.activeSequenceId = seqId; }),
    editSourceToRecord: (_mode) => { /* no-op stub */ },
    toggleSequenceBin: () => set((s) => { s.showSequenceBin = !s.showSequenceBin; }),

    // Version history / persistence
    restoreProjectSnapshot: (_snapshot) => { /* no-op stub */ },
  }))
);

// ─── PlaybackEngine → Store sync ─────────────────────────────────────────────
// Convert engine frame updates into time-based playhead position.
playbackEngine.subscribe((frame) => {
  const state = useEditorStore.getState();
  if (!state.isPlaying) return;
  const fps = state.sequenceSettings.fps || 24;
  const time = frame / fps;
  if (time >= state.duration && state.duration > 0) {
    playbackEngine.pause();
    useEditorStore.setState((s: any) => {
      s.playheadTime = s.duration;
      s.isPlaying = false;
    });
  } else {
    useEditorStore.setState((s: any) => { s.playheadTime = Math.max(0, time); });
  }
});
