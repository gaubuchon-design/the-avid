import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  DEFAULT_EDITORIAL_WORKSPACE_ID,
  PROJECT_SCHEMA_VERSION,
  hydrateMediaAsset,
  type EditorMediaAsset,
  type EditorMediaTechnicalMetadata,
  type EditorProject,
  type ProjectTemplate,
} from '@mcua/core';
import { mediaProbeEngine } from '../engine/MediaProbeEngine';
import { mediaDatabaseEngine } from '../engine/MediaDatabaseEngine';
import { videoSourceManager } from '../engine/VideoSourceManager';
import { playbackEngine } from '../engine/PlaybackEngine';
import { smartToolEngine } from '../engine/SmartToolEngine';
import { editOpsEngine } from '../engine/EditOperationsEngine';
import { findActiveMediaClip, getSourceTime } from '../engine/compositeRecordFrame';
import { resolveEditorialFocusTrackIds } from '../lib/editorialTrackFocus';
import {
  trackPatchingEngine,
  type SourceTrackDescriptor,
  type TrackPatch,
} from '../engine/TrackPatchingEngine';
import { editEngine } from '../engine/EditEngine';
import {
  buildProjectFromEditorState,
  buildProjectPersistenceSnapshot,
  getActiveBinAssets,
  getProjectPersistenceHash,
  hydrateEditorStateFromProject,
} from '../lib/editorProjectState';
import {
  buildScriptDocumentFromText,
  deriveTranscriptSpeakers,
  syncScriptDocumentToTranscript as syncTranscriptWorkbench,
} from '../lib/transcriptWorkbench';
import { getProjectFromRepository, saveProjectToRepository } from '../lib/projectRepository';
import { usePlayerStore } from './player.store';
import type { ProjectMediaSettings } from '../engine/MediaDatabaseEngine';
export type { ProjectMediaSettings } from '../engine/MediaDatabaseEngine';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type TrackType = 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
export type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish' | 'timeline' | 'script' | 'review';
export type ToolbarTab = 'media' | 'effects';
export type WorkspaceTab = 'video' | 'audio' | 'color' | 'info' | 'effects';
export type TimelineViewMode = 'timeline' | 'list' | 'waveform';
export type EditTool = 'select' | 'trim' | 'razor' | 'slip' | 'slide';
export type AlphaMode = 'straight' | 'premultiplied' | 'ignore' | 'auto';
export type TrimSelectionSide = 'A_SIDE' | 'B_SIDE' | 'BOTH';
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

export interface TrimEditPointSelection {
  trackId: string;
  editPointTime: number;
  side: TrimSelectionSide;
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

/** A Sequence represents an independent timeline with its own tracks, markers, and settings. */
export interface Sequence {
  id: string;
  name: string;
  tracks: Track[];
  markers: Marker[];
  duration: number;
  fps: number;
  dropFrame: boolean;
  inPoint: number | null;
  outPoint: number | null;
  createdAt: string;
}

export interface MediaAsset extends EditorMediaAsset {
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
  audioChannelLayout?: string;
  sampleRate?: number;
  fileSize?: number;
  startTimecode?: string;
  bitDepth?: number;
  mimeType?: string;
  technicalMetadata?: EditorMediaTechnicalMetadata;
  colorLabel?: string;
  rating?: number;
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

export interface TranscriptCue {
  id: string;
  assetId?: string;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  confidence?: number;
  source: 'SCRIPT' | 'TRANSCRIPT';
  speakerId?: string;
  language?: string;
  translation?: string;
  provider?: string;
  linkedScriptLineIds?: string[];
  words?: TranscriptWord[];
}

export interface TranscriptWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speakerId?: string;
}

export interface TranscriptSpeaker {
  id: string;
  label: string;
  confidence?: number;
  color?: string;
  identified: boolean;
}

export interface ScriptDocumentLine {
  id: string;
  lineNumber: number;
  text: string;
  speaker?: string;
  linkedCueIds: string[];
}

export interface ScriptDocument {
  id: string;
  title: string;
  source: 'IMPORTED' | 'MANUAL' | 'GENERATED';
  language: string;
  text: string;
  lines: ScriptDocumentLine[];
  updatedAt: string;
}

export interface TranscriptionSettings {
  provider: 'local-faster-whisper' | 'cloud-openai-compatible';
  translationProvider: 'local-runtime' | 'cloud-openai-compatible';
  preferredLanguage: 'auto' | string;
  enableDiarization: boolean;
  enableSpeakerIdentification: boolean;
  translateToEnglish: boolean;
}

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
  kind: 'INGEST' | 'INDEX' | 'EXPORT' | 'TRANSCODE' | 'TRANSCRIPTION' | 'RENDER' | 'EFFECTS';
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  detail?: string;
  dispatchMode?: 'LOCAL' | 'DISTRIBUTED' | 'HYBRID';
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

export type DesktopMonitorConsumer = 'record-monitor' | 'program-monitor';

export interface DesktopMonitorAudioPreviewStatus {
  mixId: string;
  handle: string;
  previewPath: string;
  executionPlanPath: string;
  previewRenderArtifacts: string[];
  bufferedPreviewActive: boolean;
  offlinePrintRenderRequired: boolean;
  timeRange: {
    startSeconds: number;
    endSeconds: number;
  };
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
    position?: 'top' | 'bottom' | 'custom';
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

type SaveStatus = 'idle' | 'saved' | 'saving' | 'error';
let loadProjectRequestSequence = 0;
const MIN_CLIP_DURATION = 1 / 120;

function getTrimDurationPresetFromFrames(
  preRollFrames: number,
  postRollFrames: number,
  fps: number,
): EditorState['trimLoopDurationPreset'] {
  if (preRollFrames !== postRollFrames) {
    return 'custom';
  }

  const normalizedFps = Math.max(1, fps);
  const shortFrames = Math.max(1, Math.round(0.5 * normalizedFps));
  const mediumFrames = Math.max(1, Math.round(1 * normalizedFps));
  const longFrames = Math.max(1, Math.round(2 * normalizedFps));

  if (preRollFrames === shortFrames) {
    return 'short';
  }

  if (preRollFrames === mediumFrames) {
    return 'medium';
  }

  if (preRollFrames === longFrames) {
    return 'long';
  }

  return 'custom';
}

interface EditorialOperationSnapshot {
  tracks: Track[];
  selectedClipIds: string[];
  selectedTrimEditPoints: TrimEditPointSelection[];
  selectedTrackId: string | null;
  inspectedClipId: string | null;
  duration: number;
  playheadTime: number;
  inPoint: number | null;
  outPoint: number | null;
  sourceInPoint: number | null;
  sourceOutPoint: number | null;
  sourcePlayhead: number;
}

// ─── Store ─────────────────────────────────────────────────────────────────────

interface EditorState {
  // Project
  projectId: string | null;
  projectName: string;
  projectTemplate: ProjectTemplate;
  projectDescription: string;
  projectTags: string[];
  projectSchemaVersion: number;
  projectCreatedAt: string | null;
  projectSettings: ProjectSettings;
  projectMediaSettings: ProjectMediaSettings;
  lastSavedAt: string | null;
  saveStatus: SaveStatus;
  persistedProjectHash: string | null;
  hasUnsavedChanges: boolean;
  ingestProgress: Record<string, number>; // assetId → 0-1 progress

  // Timeline
  timelineId: string | null;
  tracks: Track[];
  markers: Marker[];
  playheadTime: number;
  isPlaying: boolean;
  zoom: number;           // pixels per second
  scrollLeft: number;
  duration: number;

  // Multi-sequence
  sequences: Sequence[];
  activeSequenceId: string;
  sourceSequenceId: string | null;
  showSequenceBin: boolean;

  // Selection
  selectedClipIds: string[];
  selectedTrimEditPoints: TrimEditPointSelection[];
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
  desktopMonitorAudioPreview: Record<DesktopMonitorConsumer, DesktopMonitorAudioPreviewStatus | null>;
  showSafeZones: boolean;
  showWaveforms: boolean;
  snapToGrid: boolean;

  // Dialog visibility
  showNewProjectDialog: boolean;
  newProjectDialogTemplate: ProjectTemplate;
  showSequenceDialog: boolean;
  showTitleTool: boolean;
  showSubtitleEditor: boolean;
  showAlphaImportDialog: boolean;
  alphaDialogAssetId: string | null;

  // UI State
  activePanel: PanelType;
  activeInspectorTab: WorkspaceTab;
  toolbarTab: ToolbarTab;
  showInspector: boolean;
  showExportPanel: boolean;
  showSettingsPanel: boolean;
  isFullscreen: boolean;

  transcript: TranscriptCue[];
  transcriptSpeakers: TranscriptSpeaker[];
  scriptDocument: ScriptDocument | null;
  transcriptionSettings: TranscriptionSettings;
  reviewComments: ReviewComment[];
  approvals: Approval[];
  publishJobs: PublishJob[];
  desktopJobs: DesktopJob[];
  watchFolders: WatchFolder[];

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
  videoMonitorTrackId: string | null;
  trackPatchLabels: string[];

  // Trim Mode State
  trimMode: 'off' | 'roll' | 'ripple' | 'slip' | 'slide' | 'asymmetric';
  trimActive: boolean;
  trimCounterFrames: number;
  trimASideFrames: number;
  trimBSideFrames: number;
  trimSelectionLabel: 'OFF' | 'A' | 'B' | 'AB' | 'ASYM';
  trimViewMode: 'small' | 'big';
  trimLoopPlaybackActive: boolean;
  trimLoopOffsetFrames: number;
  trimLoopPlaybackDirection: -1 | 1;
  trimLoopPlaybackRate: number;
  trimLoopDurationPreset: 'short' | 'medium' | 'long' | 'custom';
  trimLoopPreRollFrames: number;
  trimLoopPostRollFrames: number;

  // Smart Tool State
  smartToolLiftOverwrite: boolean;
  smartToolExtractSplice: boolean;
  smartToolOverwriteTrim: boolean;
  smartToolRippleTrim: boolean;

  // Multicam State
  multicamActive: boolean;
  multicamGroupId: string | null;
  multicamDisplayMode: 'quad' | 'nine' | 'sixteen';

  // Clip Colors (Avid-style)
  clipLocalColors: Record<string, string>;
  dupeDetectionEnabled: boolean;

  // Timeline Display
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  trackHeights: Record<string, number>;

  // Composer Display
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';

  // Audio (extended)
  audioScrubEnabled: boolean;
  soloSafeMode: boolean;

  // Workspace
  activeWorkspaceId: string;

  // ── NLE Parity: Additional Editorial State ──────────────────────────────
  /** Current edit mode: overwrite replaces content, insert pushes downstream. */
  editMode: 'overwrite' | 'insert';
  /** Active segment editing mode (lift leaves gap, extract closes gap). */
  segmentEditMode: 'lift' | 'extract' | null;
  /** Fine-grained trim mode state for clip-level trim operations. */
  trimModeState: {
    active: boolean;
    clipId: string | null;
    side: 'head' | 'tail' | null;
  };
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
  updateTrackColor: (trackId: string, color: string) => void;

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
  selectTrimEditPoint: (selection: TrimEditPointSelection, multi?: boolean) => void;
  setTrimEditPointSide: (side: TrimSelectionSide) => void;
  clearTrimEditPoints: () => void;
  clearSelection: () => void;
  setInspectedClip: (clipId: string | null) => void;

  // Clip groups
  setClipGroup: (groupId: string, clipIds: string[]) => void;
  removeClipGroup: (groupId: string) => void;

  // Bins
  selectBin: (id: string | null) => void;
  toggleBin: (id: string) => void;
  setSourceAsset: (asset: MediaAsset | null) => void;
  setDesktopMonitorAudioPreview: (
    consumer: DesktopMonitorConsumer,
    status: DesktopMonitorAudioPreviewStatus | null,
  ) => void;
  clearDesktopMonitorAudioPreview: (consumer: DesktopMonitorConsumer) => void;
  updateTranscriptCue: (cueId: string, patch: Partial<TranscriptCue>) => void;
  replaceTranscript: (cues: TranscriptCue[], speakers?: TranscriptSpeaker[]) => void;
  setScriptDocument: (document: ScriptDocument | null) => void;
  updateScriptDocumentText: (text: string) => void;
  syncScriptDocumentToTranscript: () => void;
  updateTranscriptionSettings: (patch: Partial<TranscriptionSettings>) => void;

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
  toggleExportPanel: () => void;
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

  // Clip operations
  deleteSelectedClips: () => void;
  duplicateClip: (clipId: string) => void;
  appendAssetToTimeline: (assetId: string) => void;
  overwriteEdit: () => void;
  insertEdit: () => void;
  liftEdit: () => void;
  extractEdit: () => void;
  liftMarkedRange: () => void;
  extractMarkedRange: () => void;
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
  updateBinColor: (binId: string, color: string) => void;

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
  setDesktopJobs: (jobs: DesktopJob[]) => void;
  upsertDesktopJob: (job: DesktopJob) => void;

  // Enhanced trim operations
  rippleDelete: (clipId: string) => void;
  slideClip: (clipId: string, delta: number) => void;

  // Sequence
  updateSequenceSettings: (settings: Partial<SequenceSettings>) => void;

  // Media import
  importMediaFiles: (files: FileList, binId?: string) => void;

  // Dialogs
  openNewProjectDialog: (template?: ProjectTemplate) => void;
  closeNewProjectDialog: () => void;
  toggleSequenceDialog: () => void;
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
  addAdjustmentLayerClip: (options?: {
    durationSeconds?: number;
    startTime?: number;
    endTime?: number;
    trackId?: string | null;
    name?: string;
  }) => string | null;
  buildTranscriptTitleEffects: (options?: {
    trackId?: string | null;
    useTranslations?: boolean;
    includeSpeakerLabels?: boolean;
  }) => number;

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
  setVideoMonitorTrack: (trackId: string | null) => void;

  // Trim Mode
  setTrimMode: (mode: EditorState['trimMode']) => void;
  setTrimActive: (active: boolean) => void;
  setTrimViewMode: (mode: EditorState['trimViewMode']) => void;
  toggleTrimViewMode: () => void;
  setTrimLoopPlaybackActive: (active: boolean) => void;
  toggleTrimLoopPlayback: () => void;
  setTrimLoopOffsetFrames: (frames: number) => void;
  setTrimLoopPlaybackDirection: (direction: -1 | 1) => void;
  setTrimLoopPlaybackRate: (rate: number) => void;
  setTrimLoopDurationPreset: (preset: EditorState['trimLoopDurationPreset']) => void;
  setTrimLoopRollFrames: (preRollFrames: number, postRollFrames: number) => void;

  // Smart Tool
  toggleSmartToolLiftOverwrite: () => void;
  toggleSmartToolExtractSplice: () => void;
  toggleSmartToolOverwriteTrim: () => void;
  toggleSmartToolRippleTrim: () => void;

  // Multicam
  setMulticamActive: (active: boolean) => void;
  setMulticamGroupId: (groupId: string | null) => void;
  setMulticamDisplayMode: (mode: 'quad' | 'nine' | 'sixteen') => void;

  // Clip Display
  setClipLocalColor: (clipId: string, color: string) => void;
  clearClipLocalColor: (clipId: string) => void;
  toggleDupeDetection: () => void;
  setClipTextDisplay: (mode: EditorState['clipTextDisplay']) => void;

  // Track Heights
  setTrackHeight: (trackId: string, height: number) => void;
  enlargeTrack: (trackId: string) => void;
  reduceTrack: (trackId: string) => void;

  // Composer
  setComposerLayout: (layout: EditorState['composerLayout']) => void;
  toggleTrackingInfo: () => void;
  setVersionHistoryRetentionPreference: (preference: EditorState['versionHistoryRetentionPreference']) => void;
  setVersionHistoryCompareMode: (mode: EditorState['versionHistoryCompareMode']) => void;

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
  applyProjectSnapshot: (project: EditorProject, options?: { markDirty?: boolean; lastSavedAt?: string | null }) => void;
  loadProject: (projectId: string) => Promise<void>;
  saveProject: () => Promise<void>;
  restoreProjectSnapshot: (project: EditorProject) => void;

  // ── Multi-Sequence Actions ──────────────────────────────────────────────
  createSequence: (name: string) => string;
  deleteSequence: (id: string) => void;
  duplicateSequence: (id: string) => string;
  renameSequence: (id: string, name: string) => void;
  setActiveSequence: (id: string) => void;
  loadSequenceInSource: (id: string) => void;
  editSourceToRecord: (mode: 'insert' | 'overwrite') => void;
  toggleSequenceBin: () => void;

  // ── NLE Parity: Additional Editorial Actions ────────────────────────────
  /** Switch between overwrite and insert editing modes. */
  setEditMode: (mode: 'overwrite' | 'insert') => void;
  /** Splice-in (insert edit) a clip at the playhead on a specific track. */
  spliceIn: (trackId: string, clip: Partial<Clip>) => void;
  /** Overwrite (replace) at the playhead on a specific track. */
  overwriteEditOnTrack: (trackId: string, clip: Partial<Clip>) => void;
  /** Slip the currently selected clip by a number of frames. */
  slipSelectedClip: (frames: number) => void;
  /** Slide the currently selected clip by a number of frames. */
  slideSelectedClip: (frames: number) => void;
  /** Enter trim mode on a specific clip and side. */
  enterTrimMode: (clipId: string, side: 'head' | 'tail') => void;
  /** Apply an incremental trim delta in frames. */
  applyTrim: (frames: number) => void;
  /** Exit trim mode, committing changes. */
  exitTrimModeAction: () => void;
  /** Group the currently selected clips. */
  groupSelectedClips: () => void;
  /** Ungroup the group containing a specific clip. */
  ungroupClip: (clipId: string) => void;
  /** Duplicate all currently selected clips. */
  duplicateSelectedClips: () => void;
  /** Delete the current selection and close the gap (ripple delete). */
  rippleDeleteSelection: () => void;
  /** Set the active segment editing mode. */
  setSegmentEditMode: (mode: 'lift' | 'extract' | null) => void;
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

export const DEFAULT_TRACK_COLORS: Record<TrackType, string> = {
  VIDEO: '#7f8ca3',
  AUDIO: '#6f9a86',
  EFFECT: '#8f87a8',
  SUBTITLE: '#7a8ea7',
  GRAPHIC: '#9a8f7a',
};

export const TRACK_COLOR_PRESETS: Record<TrackType, string[]> = {
  VIDEO: ['#7f8ca3', '#818cf8', '#5b6af5', '#5bbfc7', '#4f63f5'],
  AUDIO: ['#6f9a86', '#2bb672', '#4ade80', '#22c896', '#7fa28f'],
  EFFECT: ['#8f87a8', '#a78bfa', '#c084fc', '#e8943a', '#f59e0b'],
  SUBTITLE: ['#7a8ea7', '#6bc5e3', '#38bdf8', '#60a5fa', '#93c5fd'],
  GRAPHIC: ['#9a8f7a', '#fb7185', '#f97316', '#f59e0b', '#e05b8e'],
};

export const BIN_COLOR_PRESETS = [
  '#5b6af5',
  '#818cf8',
  '#e05b8e',
  '#f59e0b',
  '#2bb672',
  '#5bbfc7',
  '#e8943a',
  '#9a8f7a',
];

const INITIAL_TRACKS: Track[] = [
  { id: 't-v1', name: 'V1', type: 'VIDEO', sortOrder: 0, muted: false, locked: false, solo: false, volume: 1, color: DEFAULT_TRACK_COLORS.VIDEO, clips: [] },
  { id: 't-v2', name: 'V2', type: 'VIDEO', sortOrder: 1, muted: false, locked: false, solo: false, volume: 1, color: '#8e9bb2', clips: [] },
  { id: 't-a1', name: 'A1', type: 'AUDIO', sortOrder: 2, muted: false, locked: false, solo: false, volume: 0.85, color: DEFAULT_TRACK_COLORS.AUDIO, clips: [] },
  { id: 't-a2', name: 'A2', type: 'AUDIO', sortOrder: 3, muted: false, locked: false, solo: false, volume: 0.6, color: '#7fa28f', clips: [] },
];

const INITIAL_BINS: Bin[] = [
  { id: 'b-master', name: 'Master', color: '#5b6af5', isOpen: true, children: [], assets: [] },
  { id: 'b-selects', name: 'Selects', color: '#e05b8e', isOpen: false, children: [], assets: [] },
];

const INITIAL_SMART_BINS: SmartBin[] = [
  { id: 'sb-favs', name: 'Favorites', color: '#f59e0b', rules: [{ field: 'favorite', operator: 'is', value: 'true' }], matchAll: true },
  { id: 'sb-video', name: 'All Video', color: '#5bbfc7', rules: [{ field: 'type', operator: 'equals', value: 'VIDEO' }], matchAll: true },
];

const INITIAL_TRANSCRIPT: TranscriptCue[] = [];
const INITIAL_TRANSCRIPT_SPEAKERS: TranscriptSpeaker[] = [];
const INITIAL_TRANSCRIPTION_SETTINGS: TranscriptionSettings = {
  provider: 'local-faster-whisper',
  translationProvider: 'local-runtime',
  preferredLanguage: 'auto',
  enableDiarization: true,
  enableSpeakerIdentification: false,
  translateToEnglish: false,
};
const INITIAL_APPROVALS: Approval[] = [];
const INITIAL_REVIEW_COMMENTS: ReviewComment[] = [];

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  width: 3840,
  height: 2160,
  frameRate: 24,
  exportFormat: 'mov',
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

function isVisualTrack(track: Pick<Track, 'type'>): boolean {
  return track.type === 'VIDEO' || track.type === 'GRAPHIC' || track.type === 'EFFECT';
}

function normalizeTrackOrdering(tracks: Track[]): void {
  tracks.sort((left, right) => left.sortOrder - right.sortOrder);
  tracks.forEach((track, index) => {
    track.sortOrder = index;
  });
}

function nextTrackName(tracks: Track[], type: TrackType): string {
  const prefix = type === 'VIDEO'
    ? 'V'
    : type === 'AUDIO'
      ? 'A'
      : type === 'GRAPHIC'
        ? 'G'
        : type === 'SUBTITLE'
          ? 'S'
          : 'FX';
  const count = tracks.filter((track) => track.type === type).length;
  return `${prefix}${count + 1}`;
}

function insertTrackAfterVisualTracks(tracks: Track[], track: Track): Track {
  normalizeTrackOrdering(tracks);
  const lastVisualIndex = tracks.reduce((lastIndex, currentTrack, index) => {
    return isVisualTrack(currentTrack) ? index : lastIndex;
  }, -1);
  const insertIndex = Math.max(0, lastVisualIndex + 1);
  tracks.splice(insertIndex, 0, track);
  normalizeTrackOrdering(tracks);
  return tracks[insertIndex] ?? track;
}

function ensureTimelineTrack(
  tracks: Track[],
  type: Extract<TrackType, 'EFFECT' | 'GRAPHIC'>,
): Track {
  const existing = tracks.find((track) => track.type === type && !track.locked);
  if (existing) {
    return existing;
  }

  const track: Track = {
    id: createId('track'),
    name: nextTrackName(tracks, type),
    type,
    sortOrder: tracks.length,
    muted: false,
    locked: false,
    solo: false,
    volume: 1,
    clips: [],
    color: DEFAULT_TRACK_COLORS[type],
  };

  return insertTrackAfterVisualTracks(tracks, track);
}

function removeAutogeneratedTranscriptTitles(state: EditorState): void {
  const generatedTitleIds = new Set(
    state.titleClips
      .filter((title) => title.templateId === 'auto-transcript-subtitle')
      .map((title) => title.id),
  );

  if (generatedTitleIds.size === 0) {
    return;
  }

  state.titleClips = state.titleClips.filter((title) => !generatedTitleIds.has(title.id));
  for (const track of state.tracks) {
    if (track.type !== 'GRAPHIC') {
      continue;
    }
    track.clips = track.clips.filter((clip) => !generatedTitleIds.has(clip.assetId ?? ''));
  }
}

function areDesktopMonitorAudioPreviewStatusesEqual(
  left: DesktopMonitorAudioPreviewStatus | null,
  right: DesktopMonitorAudioPreviewStatus | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (
    left.mixId !== right.mixId
    || left.handle !== right.handle
    || left.previewPath !== right.previewPath
    || left.executionPlanPath !== right.executionPlanPath
    || left.bufferedPreviewActive !== right.bufferedPreviewActive
    || left.offlinePrintRenderRequired !== right.offlinePrintRenderRequired
    || left.timeRange.startSeconds !== right.timeRange.startSeconds
    || left.timeRange.endSeconds !== right.timeRange.endSeconds
    || left.previewRenderArtifacts.length !== right.previewRenderArtifacts.length
  ) {
    return false;
  }

  return left.previewRenderArtifacts.every((artifactPath, index) => artifactPath === right.previewRenderArtifacts[index]);
}

function clipDuration(clip: Clip): number {
  return clip.endTime - clip.startTime;
}

function cloneClipForSnapshot(clip: Clip): Clip {
  return {
    ...clip,
    waveformData: clip.waveformData ? [...clip.waveformData] : undefined,
    intrinsicVideo: { ...clip.intrinsicVideo },
    intrinsicAudio: { ...clip.intrinsicAudio },
    timeRemap: {
      ...clip.timeRemap,
      keyframes: clip.timeRemap.keyframes.map((keyframe) => ({
        ...keyframe,
        bezierIn: keyframe.bezierIn ? { ...keyframe.bezierIn } : undefined,
        bezierOut: keyframe.bezierOut ? { ...keyframe.bezierOut } : undefined,
      })),
    },
  };
}

function cloneTrackForSnapshot(track: Track): Track {
  return {
    ...track,
    clips: track.clips.map(cloneClipForSnapshot),
  };
}

function findAssetById(bins: Bin[], assetId: string): MediaAsset | null {
  return collectAllAssets(bins).find((asset) => asset.id === assetId) ?? null;
}

function findBinByIdMutable(bins: Bin[], binId: string): Bin | null {
  for (const bin of bins) {
    if (bin.id === binId) {
      return bin;
    }
    const nested = findBinByIdMutable(bin.children, binId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function getAssetWaveformData(asset: MediaAsset | null | undefined): number[] | undefined {
  if (!asset) {
    return undefined;
  }

  return asset.waveformData ?? asset.waveformMetadata?.peaks;
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

// ─── Default Sequence ───────────────────────────────────────────────────────
const DEFAULT_SEQUENCE_ID = 'seq-default';
const DEFAULT_SEQUENCE: Sequence = {
  id: DEFAULT_SEQUENCE_ID,
  name: 'Sequence 1',
  tracks: INITIAL_TRACKS.map(t => ({ ...t, clips: [...t.clips] })),
  markers: [],
  duration: 0,
  fps: 24,
  dropFrame: false,
  inPoint: null,
  outPoint: null,
  createdAt: new Date().toISOString(),
};

function hydrateTrackPatchingEngineFromProjectState(
  tracks: Track[],
  enabledTrackIds: string[],
  syncLockedTrackIds: string[],
  videoMonitorTrackId: string | null,
  sourceAssetId: string | null,
  sourceTrackDescriptors: SourceTrackDescriptor[],
  trackPatches: TrackPatch[],
): void {
  trackPatchingEngine.restoreState({
    sourceAssetId,
    sourceTracks: sourceTrackDescriptors,
    patches: trackPatches,
    monitor: {
      videoMonitorTrackId,
      enabledRecordTracks: new Set(enabledTrackIds),
      soloTracks: new Set(tracks.filter((track) => track.solo).map((track) => track.id)),
      mutedTracks: new Set(tracks.filter((track) => track.muted).map((track) => track.id)),
      syncLocks: new Set(syncLockedTrackIds),
      lockedTracks: new Set(tracks.filter((track) => track.locked).map((track) => track.id)),
    },
  });
}

// Module-level holder for the alpha dialog resolve callback.
// Functions are not compatible with Immer proxies, so we store
// the resolve callback outside of the store state.
let _alphaDialogResolve: ((mode: AlphaMode) => void) | null = null;

// ─── Demo data ────────────────────────────────────────────────────────────────
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

// ─── Playback ────────────────────────────────────────────────────────────────
// Timeline playback is driven by PlaybackEngine (RAF-based).
// The store subscribes to frame updates and converts frames → seconds.

// ─── Store creation ────────────────────────────────────────────────────────────
export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => {
    const captureEditorialOperationSnapshot = (): EditorialOperationSnapshot => {
      const state = get();
      return {
        tracks: state.tracks.map(cloneTrackForSnapshot),
        selectedClipIds: [...state.selectedClipIds],
        selectedTrimEditPoints: state.selectedTrimEditPoints.map((selection) => ({ ...selection })),
        selectedTrackId: state.selectedTrackId,
        inspectedClipId: state.inspectedClipId,
        duration: state.duration,
        playheadTime: state.playheadTime,
        inPoint: state.inPoint,
        outPoint: state.outPoint,
        sourceInPoint: state.sourceInPoint,
        sourceOutPoint: state.sourceOutPoint,
        sourcePlayhead: state.sourcePlayhead,
      };
    };

    const restoreEditorialOperationSnapshot = (snapshot: EditorialOperationSnapshot): void => {
      set((s) => {
        s.tracks = snapshot.tracks.map(cloneTrackForSnapshot);
        s.selectedClipIds = [...snapshot.selectedClipIds];
        s.selectedTrimEditPoints = snapshot.selectedTrimEditPoints.map((selection) => ({ ...selection }));
        s.selectedTrackId = snapshot.selectedTrackId;
        s.inspectedClipId = snapshot.inspectedClipId;
        s.duration = snapshot.duration;
        s.playheadTime = snapshot.playheadTime;
        s.inPoint = snapshot.inPoint;
        s.outPoint = snapshot.outPoint;
        s.sourceInPoint = snapshot.sourceInPoint;
        s.sourceOutPoint = snapshot.sourceOutPoint;
        s.sourcePlayhead = snapshot.sourcePlayhead;
      });
    };

    const executeUndoableEditorialEdit = (
      description: string,
      runner: () => { success: boolean; description: string },
    ): void => {
      const beforeSnapshot = captureEditorialOperationSnapshot();
      editEngine.execute({
        description,
        execute() {
          restoreEditorialOperationSnapshot(beforeSnapshot);
          const result = runner();
          if (!result.success) {
            restoreEditorialOperationSnapshot(beforeSnapshot);
            throw new Error(result.description);
          }
        },
        undo() {
          restoreEditorialOperationSnapshot(beforeSnapshot);
        },
      });
    };

    const executeUndoableSelectionEdit = (
      description: string,
      runner: (selectedClipIds: string[]) => { success: boolean; description: string },
    ): void => {
      const selectedClipIds = [...get().selectedClipIds];
      if (selectedClipIds.length === 0) {
        return;
      }

      const beforeSnapshot = captureEditorialOperationSnapshot();
      editEngine.execute({
        description,
        execute() {
          restoreEditorialOperationSnapshot(beforeSnapshot);
          const result = runner(selectedClipIds);
          if (!result.success) {
            restoreEditorialOperationSnapshot(beforeSnapshot);
            throw new Error(result.description);
          }
          set((s) => {
            s.inspectedClipId = null;
          });
        },
        undo() {
          restoreEditorialOperationSnapshot(beforeSnapshot);
        },
      });
    };

    return ({
    applyProjectSnapshot(project: EditorProject, options?: { markDirty?: boolean; lastSavedAt?: string | null }) {
      const hydrated = hydrateEditorStateFromProject(project);
      playbackEngine.pause();
      editEngine.clear();
      usePlayerStore.setState({
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
      });
      hydrateTrackPatchingEngineFromProjectState(
        hydrated.tracks,
        hydrated.enabledTrackIds,
        hydrated.syncLockedTrackIds,
        hydrated.videoMonitorTrackId,
        hydrated.sourceAsset?.id ?? null,
        hydrated.sourceTrackDescriptors,
        hydrated.trackPatches,
      );

      set((s) => {
        s.projectId = hydrated.projectId;
        s.projectName = hydrated.projectName;
        s.projectTemplate = hydrated.projectTemplate;
        s.projectDescription = hydrated.projectDescription;
        s.projectTags = hydrated.projectTags;
        s.projectSchemaVersion = hydrated.projectSchemaVersion;
        s.projectCreatedAt = hydrated.projectCreatedAt;
        s.projectSettings = hydrated.projectSettings;
        s.lastSavedAt = options?.lastSavedAt ?? project.updatedAt;
        s.saveStatus = 'saved';
        s.persistedProjectHash = null;
        s.hasUnsavedChanges = Boolean(options?.markDirty);
        s.timelineId = hydrated.projectId;
        s.tracks = hydrated.tracks;
        s.markers = hydrated.markers;
        s.playheadTime = 0;
        s.isPlaying = false;
        s.scrollLeft = 0;
        s.duration = hydrated.duration;
        s.selectedClipIds = [];
        s.selectedTrimEditPoints = [];
        s.selectedTrackId = null;
        s.inspectedClipId = null;
        s.bins = hydrated.bins;
        s.selectedBinId = hydrated.selectedBinId;
        s.activeBinAssets = hydrated.activeBinAssets;
        s.sequenceSettings = hydrated.sequenceSettings;
        s.subtitleTracks = hydrated.subtitleTracks;
        s.titleClips = hydrated.titleClips;
        s.sourceAsset = hydrated.sourceAsset;
        s.inPoint = null;
        s.outPoint = null;
        s.desktopMonitorAudioPreview = {
          'record-monitor': null,
          'program-monitor': null,
        };
        s.transcript = hydrated.transcript;
        s.transcriptSpeakers = hydrated.transcriptSpeakers;
        s.scriptDocument = hydrated.scriptDocument;
        s.transcriptionSettings = hydrated.transcriptionSettings;
        s.reviewComments = hydrated.reviewComments;
        s.approvals = hydrated.approvals;
        s.publishJobs = hydrated.publishJobs;
        s.desktopJobs = [];
        s.watchFolders = hydrated.watchFolders;
        s.trackHeights = hydrated.trackHeights;
        s.clipTextDisplay = hydrated.clipTextDisplay;
        s.composerLayout = hydrated.composerLayout;
        s.showTrackingInfo = hydrated.showTrackingInfo;
        s.trackingInfoFields = hydrated.trackingInfoFields;
        s.versionHistoryRetentionPreference = hydrated.versionHistoryRetentionPreference;
        s.versionHistoryCompareMode = hydrated.versionHistoryCompareMode;
        s.dupeDetectionEnabled = hydrated.dupeDetectionEnabled;
        s.activeWorkspaceId = hydrated.activeWorkspaceId;
        s.sourceInPoint = null;
        s.sourceOutPoint = null;
        s.sourcePlayhead = 0;
        s.recordInPoint = null;
        s.recordOutPoint = null;
        s.enabledTrackIds = hydrated.enabledTrackIds;
        s.syncLockedTrackIds = hydrated.syncLockedTrackIds;
        s.videoMonitorTrackId = hydrated.videoMonitorTrackId;
        s.trackPatchLabels = [];
        s.trimMode = 'off';
        s.trimActive = false;
        s.trimCounterFrames = 0;
        s.trimASideFrames = 0;
        s.trimBSideFrames = 0;
        s.trimSelectionLabel = 'OFF';
        s.trimViewMode = 'small';
        s.trimLoopPlaybackActive = false;
        s.trimLoopOffsetFrames = 0;
        s.trimLoopPlaybackDirection = 1;
        s.trimLoopPlaybackRate = 1;
        s.trimLoopDurationPreset = 'short';
        s.trimLoopPreRollFrames = 12;
        s.trimLoopPostRollFrames = 12;

        // Restore sequences: build an initial sequence from the hydrated project data
        const restoredSeq: Sequence = {
          id: hydrated.projectId,
          name: hydrated.sequenceSettings.name,
          tracks: hydrated.tracks,
          markers: hydrated.markers,
          duration: hydrated.duration,
          fps: hydrated.sequenceSettings.fps,
          dropFrame: hydrated.sequenceSettings.dropFrame,
          inPoint: null,
          outPoint: null,
          createdAt: hydrated.projectCreatedAt || new Date().toISOString(),
        };
        s.sequences = [restoredSeq];
        s.activeSequenceId = restoredSeq.id;
        s.sourceSequenceId = null;
        s.showSequenceBin = false;
      });

      get().setSourceAsset(hydrated.sourceAsset);
      usePlayerStore.getState().setActiveMonitor('record');

      const snapshot = buildProjectPersistenceSnapshot(get());
      set((s) => {
        s.persistedProjectHash = options?.markDirty
          ? null
          : snapshot
            ? getProjectPersistenceHash(snapshot)
            : null;
        s.hasUnsavedChanges = Boolean(options?.markDirty);
      });
    },

    // Initial state
    projectId: null,
    projectName: 'Untitled Project',
    projectTemplate: 'film' as ProjectTemplate,
    projectDescription: '',
    projectTags: [],
    projectSchemaVersion: PROJECT_SCHEMA_VERSION,
    projectCreatedAt: null,
    projectSettings: DEFAULT_PROJECT_SETTINGS,
    projectMediaSettings: { organizationMode: 'keep-in-place', generateProxies: false, proxyResolution: '1/2' as const },
    lastSavedAt: null,
    saveStatus: 'idle' as SaveStatus,
    persistedProjectHash: null,
    hasUnsavedChanges: false,
    ingestProgress: {},
    timelineId: null,
    tracks: INITIAL_TRACKS,
    markers: [],
    playheadTime: 0,
    isPlaying: false,
    zoom: 60,
    scrollLeft: 0,
    duration: 0,

    // Multi-sequence
    sequences: [{ ...DEFAULT_SEQUENCE, tracks: INITIAL_TRACKS.map(t => ({ ...t, clips: [...t.clips] })) }],
    activeSequenceId: DEFAULT_SEQUENCE_ID,
    sourceSequenceId: null,
    showSequenceBin: false,

    selectedClipIds: [],
    selectedTrimEditPoints: [],
    selectedTrackId: null,
    inspectedClipId: null,
    bins: INITIAL_BINS,
    selectedBinId: 'b-master',
    activeBinAssets: [],
    smartBins: INITIAL_SMART_BINS,
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
    desktopMonitorAudioPreview: {
      'record-monitor': null,
      'program-monitor': null,
    },
    showSafeZones: false,
    showWaveforms: true,
    snapToGrid: true,
    showNewProjectDialog: false,
    newProjectDialogTemplate: 'film',
    showSequenceDialog: false,
    showTitleTool: false,
    showSubtitleEditor: false,
    showAlphaImportDialog: false,
    alphaDialogAssetId: null,
    activePanel: 'edit',
    activeInspectorTab: 'video',
    toolbarTab: 'media',
    showInspector: true,
    showExportPanel: false,
    showSettingsPanel: false,
    isFullscreen: false,
    transcript: INITIAL_TRANSCRIPT,
    transcriptSpeakers: INITIAL_TRANSCRIPT_SPEAKERS,
    scriptDocument: null,
    transcriptionSettings: INITIAL_TRANSCRIPTION_SETTINGS,
    reviewComments: INITIAL_REVIEW_COMMENTS,
    approvals: INITIAL_APPROVALS,
    publishJobs: [],
    desktopJobs: [],
    watchFolders: [],
    volume: 0.8,
    isMuted: false,
    timelineViewMode: 'timeline' as TimelineViewMode,
    clipGroups: {},
    activeTool: 'select' as EditTool,
    showIndex: false,
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
    videoMonitorTrackId: null,
    trackPatchLabels: [],

    // Trim Mode State
    trimMode: 'off' as EditorState['trimMode'],
    trimActive: false,
    trimCounterFrames: 0,
    trimASideFrames: 0,
    trimBSideFrames: 0,
    trimSelectionLabel: 'OFF' as EditorState['trimSelectionLabel'],
    trimViewMode: 'small' as EditorState['trimViewMode'],
    trimLoopPlaybackActive: false,
    trimLoopOffsetFrames: 0,
    trimLoopPlaybackDirection: 1 as -1 | 1,
    trimLoopPlaybackRate: 1,
    trimLoopDurationPreset: 'short' as EditorState['trimLoopDurationPreset'],
    trimLoopPreRollFrames: 12,
    trimLoopPostRollFrames: 12,

    // Smart Tool State
    smartToolLiftOverwrite: true,
    smartToolExtractSplice: true,
    smartToolOverwriteTrim: true,
    smartToolRippleTrim: true,

    // Multicam State
    multicamActive: false,
    multicamGroupId: null,
    multicamDisplayMode: 'quad' as EditorState['multicamDisplayMode'],

    // Clip Colors (Avid-style)
    clipLocalColors: {} as Record<string, string>,
    dupeDetectionEnabled: false,

    // Timeline Display
    clipTextDisplay: 'name' as EditorState['clipTextDisplay'],
    trackHeights: {} as Record<string, number>,

    // Composer Display
    composerLayout: 'source-record' as EditorState['composerLayout'],
    showTrackingInfo: true,
    trackingInfoFields: ['master-tc', 'duration'],
    versionHistoryRetentionPreference: 'manual' as EditorState['versionHistoryRetentionPreference'],
    versionHistoryCompareMode: 'summary' as EditorState['versionHistoryCompareMode'],

    // Audio (extended)
    audioScrubEnabled: false,
    soloSafeMode: false,

    // Workspace
    activeWorkspaceId: DEFAULT_EDITORIAL_WORKSPACE_ID,

    // NLE Parity: Additional Editorial State
    editMode: 'overwrite' as EditorState['editMode'],
    segmentEditMode: null as EditorState['segmentEditMode'],
    trimModeState: { active: false, clipId: null, side: null } as EditorState['trimModeState'],

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
      trackPatchingEngine.toggleMute(id);
    }),
    toggleSolo: (id) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.solo = !t.solo;
      trackPatchingEngine.toggleSolo(id);
    }),
    toggleLock: (id) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.locked = !t.locked;
      trackPatchingEngine.toggleTrackLock(id);
    }),
    setTrackVolume: (id, v) => set((s) => {
      const t = s.tracks.find(t => t.id === id); if (t) t.volume = v;
    }),
    selectTrack: (id) => set((s) => {
      s.selectedTrackId = id;
      s.selectedClipIds = [];
      s.inspectedClipId = null;
    }),
    updateTrackColor: (trackId, color) => set((s) => {
      const track = s.tracks.find((candidate) => candidate.id === trackId);
      if (!track) {
        return;
      }

      const previousColor = track.color;
      track.color = color;
      for (const clip of track.clips) {
        if (!clip.color || clip.color === previousColor) {
          clip.color = color;
        }
      }
    }),

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
        if (t.locked) {
          continue;
        }
        const c = t.clips.find(c => c.id === clipId);
        if (c) {
          const clampedDelta = Math.max(-c.trimStart, Math.min(delta, c.trimEnd));
          if (Math.abs(clampedDelta) < Number.EPSILON) {
            return;
          }
          c.trimStart = Math.max(0, c.trimStart + clampedDelta);
          c.trimEnd = Math.max(0, c.trimEnd - clampedDelta);
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
      s.selectedTrimEditPoints = [];
      // Clear inspected clip when user explicitly selects — selection takes precedence
      s.inspectedClipId = null;
    }),
    selectTrimEditPoint: (selection, multi = false) => set((s) => {
      const normalizedSelection = {
        trackId: selection.trackId,
        editPointTime: selection.editPointTime,
        side: selection.side,
      };

      if (!multi) {
        s.selectedTrimEditPoints = [normalizedSelection];
      } else {
        s.selectedTrimEditPoints = [
          ...s.selectedTrimEditPoints.filter((candidate) => candidate.trackId !== normalizedSelection.trackId),
          normalizedSelection,
        ];
      }

      s.selectedClipIds = [];
      s.selectedTrackId = normalizedSelection.trackId;
      s.inspectedClipId = null;
    }),
    setTrimEditPointSide: (side) => set((s) => {
      s.selectedTrimEditPoints = s.selectedTrimEditPoints.map((selection) => ({
        ...selection,
        side,
      }));
    }),
    clearTrimEditPoints: () => set((s) => {
      s.selectedTrimEditPoints = [];
    }),
    clearSelection: () => set((s) => {
      s.selectedClipIds = [];
      s.selectedTrimEditPoints = [];
      s.inspectedClipId = null;
    }),
    setInspectedClip: (clipId) => set((s) => { s.inspectedClipId = clipId; }),

    selectBin: (id) => set((s) => {
      s.selectedBinId = id;
      s.selectedTrackId = null;
      s.selectedClipIds = [];
      s.selectedTrimEditPoints = [];
      s.inspectedClipId = null;
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
    setDesktopMonitorAudioPreview: (consumer, status) => set((s) => {
      const nextStatus = status
        ? {
            ...status,
            previewRenderArtifacts: [...status.previewRenderArtifacts],
            timeRange: { ...status.timeRange },
          }
        : null;
      if (areDesktopMonitorAudioPreviewStatusesEqual(s.desktopMonitorAudioPreview[consumer], nextStatus)) {
        return;
      }
      s.desktopMonitorAudioPreview[consumer] = nextStatus;
    }),
    clearDesktopMonitorAudioPreview: (consumer) => set((s) => {
      if (s.desktopMonitorAudioPreview[consumer] == null) {
        return;
      }
      s.desktopMonitorAudioPreview[consumer] = null;
    }),
    updateTranscriptCue: (cueId, patch) => set((s) => {
      const cue = s.transcript.find((entry) => entry.id === cueId);
      if (!cue) {
        return;
      }
      Object.assign(cue, patch);
      s.transcriptSpeakers = deriveTranscriptSpeakers(s.transcript);
      if (s.scriptDocument) {
        const synced = syncTranscriptWorkbench(s.scriptDocument, s.transcript);
        s.scriptDocument = synced.scriptDocument;
        s.transcript = synced.transcript;
      }
    }),
    replaceTranscript: (cues, speakers) => set((s) => {
      s.transcript = cues.map((cue) => ({
        ...cue,
        linkedScriptLineIds: [...(cue.linkedScriptLineIds ?? [])],
        words: cue.words ? cue.words.map((word) => ({ ...word })) : undefined,
      }));
      s.transcriptSpeakers = speakers
        ? speakers.map((speaker) => ({ ...speaker }))
        : deriveTranscriptSpeakers(s.transcript);
      if (s.scriptDocument) {
        const synced = syncTranscriptWorkbench(s.scriptDocument, s.transcript);
        s.scriptDocument = synced.scriptDocument;
        s.transcript = synced.transcript;
      }
    }),
    setScriptDocument: (document) => set((s) => {
      s.scriptDocument = document
        ? {
            ...document,
            lines: document.lines.map((line) => ({
              ...line,
              linkedCueIds: [...line.linkedCueIds],
            })),
          }
        : null;
      if (s.scriptDocument) {
        const synced = syncTranscriptWorkbench(s.scriptDocument, s.transcript);
        s.scriptDocument = synced.scriptDocument;
        s.transcript = synced.transcript;
      }
    }),
    updateScriptDocumentText: (text) => set((s) => {
      const nextDocument = buildScriptDocumentFromText(text, s.scriptDocument);
      const synced = syncTranscriptWorkbench(nextDocument, s.transcript);
      s.scriptDocument = synced.scriptDocument;
      s.transcript = synced.transcript;
    }),
    syncScriptDocumentToTranscript: () => set((s) => {
      const synced = syncTranscriptWorkbench(s.scriptDocument, s.transcript);
      s.scriptDocument = synced.scriptDocument;
      s.transcript = synced.transcript;
    }),
    updateTranscriptionSettings: (patch) => set((s) => {
      s.transcriptionSettings = {
        ...s.transcriptionSettings,
        ...patch,
      };
    }),
    setInPoint: (t) => set((s) => { s.inPoint = t; }),
    setOutPoint: (t) => set((s) => { s.outPoint = t; }),
    toggleSafeZones: () => set((s) => { s.showSafeZones = !s.showSafeZones; }),
    toggleWaveforms: () => set((s) => { s.showWaveforms = !s.showWaveforms; }),
    toggleSnap: () => set((s) => { s.snapToGrid = !s.snapToGrid; }),
    setActivePanel: (p) => set((s) => { s.activePanel = p; }),
    setInspectorTab: (t) => set((s) => { s.activeInspectorTab = t; }),
    setToolbarTab: (t) => set((s) => { s.toolbarTab = t; }),
    toggleInspector: () => set((s) => { s.showInspector = !s.showInspector; }),
    toggleExportPanel: () => set((s) => { s.showExportPanel = !s.showExportPanel; }),
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

      const targetTrack = getPreferredTrack(s, asset);
      if (!targetTrack) {
        return;
      }

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
        waveformData: getAssetWaveformData(asset),
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
        // Remove or trim overlapping clips in the target range.
        // Build the next clip list explicitly so clips spanning the overwrite
        // region can be split into preserved head/tail segments.
        const nextClips: Clip[] = [];
        for (const clip of targetTrack.clips) {
          if (clip.endTime <= startTime || clip.startTime >= endTime) {
            nextClips.push(clip);
            continue;
          }

          if (clip.startTime >= startTime && clip.endTime <= endTime) {
            continue;
          }

          if (clip.startTime < startTime && clip.endTime > startTime && clip.endTime <= endTime) {
            clip.endTime = startTime;
            nextClips.push(clip);
            continue;
          }

          if (clip.startTime >= startTime && clip.startTime < endTime && clip.endTime > endTime) {
            clip.trimStart += (endTime - clip.startTime);
            clip.startTime = endTime;
            nextClips.push(clip);
            continue;
          }

          if (clip.startTime < startTime && clip.endTime > endTime) {
            const originalEnd = clip.endTime;
            const originalTrimEnd = clip.trimEnd;

            clip.endTime = startTime;
            nextClips.push(clip);
            nextClips.push(makeClip({
              id: createId('clip'),
              trackId: targetTrack.id,
              name: clip.name,
              startTime: endTime,
              endTime: originalEnd,
              trimStart: clip.trimStart + (endTime - clip.startTime),
              trimEnd: originalTrimEnd,
              type: clip.type,
              assetId: clip.assetId,
              color: clip.color,
              waveformData: clip.waveformData,
            }));
          }
        }
        targetTrack.clips = nextClips;

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
          waveformData: getAssetWaveformData(asset),
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
          waveformData: getAssetWaveformData(asset),
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
    liftEdit: () => {
      const { inPoint, outPoint } = get();
      const hasIn = inPoint !== null;
      const hasOut = outPoint !== null;
      if (hasIn || hasOut) {
        if (hasIn && hasOut && outPoint! > inPoint!) {
          get().liftMarkedRange();
        }
        return;
      }

      get().liftSelection();
    },
    extractEdit: () => {
      const { inPoint, outPoint } = get();
      const hasIn = inPoint !== null;
      const hasOut = outPoint !== null;
      if (hasIn || hasOut) {
        if (hasIn && hasOut && outPoint! > inPoint!) {
          get().extractMarkedRange();
        }
        return;
      }

      get().extractSelection();
    },
    liftMarkedRange: () => {
      const { inPoint, outPoint } = get();
      if (inPoint === null || outPoint === null || outPoint <= inPoint) {
        return;
      }

      executeUndoableEditorialEdit('Lift marked range', () => editOpsEngine.lift());
    },
    extractMarkedRange: () => {
      const { inPoint, outPoint } = get();
      if (inPoint === null || outPoint === null || outPoint <= inPoint) {
        return;
      }

      executeUndoableEditorialEdit('Extract marked range', () => editOpsEngine.extract());
    },

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
    matchFrame: () => {
      const state = get();
      const clip = findActiveMediaClip(state.tracks, state.playheadTime);
      if (!clip?.assetId) {
        return;
      }

      const asset = findAssetById(state.bins, clip.assetId);
      if (!asset) {
        return;
      }

      state.setSourceAsset(asset);
      set((s) => {
        s.sourcePlayhead = getSourceTime(clip, state.playheadTime);
        s.inspectedClipId = clip.id;
      });
      usePlayerStore.getState().setActiveMonitor('source');
    },
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
    liftSelection: () => {
      const clipCount = get().selectedClipIds.length;
      executeUndoableSelectionEdit(
        clipCount === 1 ? 'Lift selected clip' : `Lift ${clipCount} selected clips`,
        (selectedClipIds) => editOpsEngine.liftSegment(selectedClipIds),
      );
    },
    extractSelection: () => {
      const clipCount = get().selectedClipIds.length;
      executeUndoableSelectionEdit(
        clipCount === 1 ? 'Extract selected clip' : `Extract ${clipCount} selected clips`,
        (selectedClipIds) => editOpsEngine.extractSegment(selectedClipIds),
      );
    },

    // Bin operations
    addBin: (name, parentId) => set((s) => {
      const newBin: Bin = {
        id: `b_${Date.now()}`,
        name,
        color: BIN_COLOR_PRESETS[0]!,
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
    updateBinColor: (binId, color) => set((s) => {
      const bin = findBinByIdMutable(s.bins, binId);
      if (bin) {
        bin.color = color;
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
    addReviewComment: ({ body, author = 'You', role = 'Reviewer', color = '#00d4aa' }) => set((s) => {
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
    setDesktopJobs: (jobs) => set((s) => {
      s.desktopJobs = jobs.map((job) => ({ ...job }));
    }),
    upsertDesktopJob: (job) => set((s) => {
      const existing = s.desktopJobs.find((entry) => entry.id === job.id);
      if (existing) {
        Object.assign(existing, job);
        return;
      }
      s.desktopJobs.unshift({ ...job });
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
        if (t.locked) {
          continue;
        }

        const orderedClips = [...t.clips].sort((a, b) => a.startTime - b.startTime);
        const idx = orderedClips.findIndex(c => c.id === clipId);
        if (idx >= 0) {
          const clip = orderedClips[idx];
          const prev = idx > 0 ? orderedClips[idx - 1] : null;
          const next = idx < orderedClips.length - 1 ? orderedClips[idx + 1] : null;
          if (!clip || !prev || !next) {
            return;
          }

          const maxSlideLeft = Math.max(
            0,
            Math.min(
              clip.startTime,
              clipDuration(prev) - MIN_CLIP_DURATION,
              next.trimStart,
            ),
          );
          const maxSlideRight = Math.max(
            0,
            Math.min(
              prev.trimEnd,
              clipDuration(next) - MIN_CLIP_DURATION,
            ),
          );
          const clampedDelta = Math.max(-maxSlideLeft, Math.min(delta, maxSlideRight));
          if (Math.abs(clampedDelta) < Number.EPSILON) {
            return;
          }

          clip.startTime += clampedDelta;
          clip.endTime += clampedDelta;
          prev.endTime = clip.startTime;
          prev.trimEnd = Math.max(0, prev.trimEnd - clampedDelta);
          next.startTime = clip.endTime;
          next.trimStart = Math.max(0, next.trimStart + clampedDelta);
          t.clips.sort((a, b) => a.startTime - b.startTime);
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
    setSourcePlayhead: (t) => set((s) => {
      const sourceDuration = s.sourceAsset?.duration;
      const clampedTime = isFinite(t) ? Math.max(0, t) : 0;
      s.sourcePlayhead = Number.isFinite(sourceDuration)
        ? Math.min(clampedTime, Math.max(0, sourceDuration!))
        : clampedTime;
    }),
    setSourceInToPlayhead: () => set((s) => { s.sourceInPoint = s.sourcePlayhead; }),
    setSourceOutToPlayhead: () => set((s) => { s.sourceOutPoint = s.sourcePlayhead; }),
    clearSourceInOut: () => set((s) => { s.sourceInPoint = null; s.sourceOutPoint = null; }),

    // ─── Track Enable/Disable ─────────────────────────────────────────────────
    enableTrack: (trackId) => set((s) => {
      trackPatchingEngine.enableRecordTrack(trackId);
      s.enabledTrackIds = trackPatchingEngine.getEnabledRecordTracks();
    }),
    disableTrack: (trackId) => set((s) => {
      trackPatchingEngine.disableRecordTrack(trackId);
      s.enabledTrackIds = trackPatchingEngine.getEnabledRecordTracks();
    }),
    toggleTrackEnabled: (trackId) => set((s) => {
      trackPatchingEngine.toggleRecordTrack(trackId);
      s.enabledTrackIds = trackPatchingEngine.getEnabledRecordTracks();
    }),
    isTrackEnabled: (trackId) => {
      return trackPatchingEngine.isRecordTrackEnabled(trackId);
    },

    // ─── Sync Lock ────────────────────────────────────────────────────────────
    toggleSyncLock: (trackId) => set((s) => {
      trackPatchingEngine.toggleSyncLock(trackId);
      s.syncLockedTrackIds = trackPatchingEngine.getSyncLockedTracks();
    }),
    isSyncLocked: (trackId) => {
      return trackPatchingEngine.isSyncLocked(trackId);
    },
    setVideoMonitorTrack: (trackId) => set((s) => {
      trackPatchingEngine.setVideoMonitorTrack(trackId);
      s.videoMonitorTrackId = trackPatchingEngine.getVideoMonitorTrack();
    }),

    // ─── Trim Mode ────────────────────────────────────────────────────────────
    setTrimMode: (mode) => set((s) => { s.trimMode = mode; }),
    setTrimActive: (active) => set((s) => {
      s.trimActive = active;
      if (!active) {
        s.trimLoopPlaybackActive = false;
        s.trimLoopOffsetFrames = 0;
        s.trimLoopPlaybackDirection = 1;
        s.trimLoopPlaybackRate = 1;
      }
    }),
    setTrimViewMode: (mode) => set((s) => { s.trimViewMode = mode; }),
    toggleTrimViewMode: () => set((s) => {
      s.trimViewMode = s.trimViewMode === 'small' ? 'big' : 'small';
    }),
    setTrimLoopPlaybackActive: (active) => set((s) => {
      s.trimLoopPlaybackActive = active;
      if (!active) {
        s.trimLoopOffsetFrames = 0;
        s.trimLoopPlaybackDirection = 1;
        s.trimLoopPlaybackRate = 1;
      }
    }),
    toggleTrimLoopPlayback: () => set((s) => {
      s.trimLoopPlaybackActive = !s.trimLoopPlaybackActive;
      if (!s.trimLoopPlaybackActive) {
        s.trimLoopOffsetFrames = 0;
        s.trimLoopPlaybackDirection = 1;
        s.trimLoopPlaybackRate = 1;
      }
    }),
    setTrimLoopOffsetFrames: (frames) => set((s) => {
      s.trimLoopOffsetFrames = frames;
    }),
    setTrimLoopPlaybackDirection: (direction) => set((s) => {
      s.trimLoopPlaybackDirection = direction < 0 ? -1 : 1;
    }),
    setTrimLoopPlaybackRate: (rate) => set((s) => {
      s.trimLoopPlaybackRate = Math.max(0.25, Math.min(8, rate || 1));
    }),
    setTrimLoopDurationPreset: (preset) => set((s) => {
      const fps = Math.max(1, s.sequenceSettings.fps || s.projectSettings.frameRate || 24);
      const seconds = preset === 'short'
        ? 0.5
        : preset === 'long'
          ? 2
          : 1;
      const frames = Math.max(1, Math.round(seconds * fps));
      s.trimLoopDurationPreset = preset;
      s.trimLoopPreRollFrames = frames;
      s.trimLoopPostRollFrames = frames;
    }),
    setTrimLoopRollFrames: (preRollFrames, postRollFrames) => set((s) => {
      s.trimLoopPreRollFrames = Math.max(1, Math.round(preRollFrames));
      s.trimLoopPostRollFrames = Math.max(1, Math.round(postRollFrames));
      s.trimLoopDurationPreset = getTrimDurationPresetFromFrames(
        s.trimLoopPreRollFrames,
        s.trimLoopPostRollFrames,
        s.sequenceSettings.fps || s.projectSettings.frameRate || 24,
      );
    }),

    // ─── Smart Tool ───────────────────────────────────────────────────────────
    toggleSmartToolLiftOverwrite: () => set((s) => {
      smartToolEngine.toggleLiftOverwriteSegment();
      const state = smartToolEngine.getState();
      s.smartToolLiftOverwrite = state.liftOverwriteSegment;
      s.smartToolExtractSplice = state.extractSpliceSegment;
      s.smartToolOverwriteTrim = state.overwriteTrim;
      s.smartToolRippleTrim = state.rippleTrim;
    }),
    toggleSmartToolExtractSplice: () => set((s) => {
      smartToolEngine.toggleExtractSpliceSegment();
      const state = smartToolEngine.getState();
      s.smartToolLiftOverwrite = state.liftOverwriteSegment;
      s.smartToolExtractSplice = state.extractSpliceSegment;
      s.smartToolOverwriteTrim = state.overwriteTrim;
      s.smartToolRippleTrim = state.rippleTrim;
    }),
    toggleSmartToolOverwriteTrim: () => set((s) => {
      smartToolEngine.toggleOverwriteTrim();
      const state = smartToolEngine.getState();
      s.smartToolLiftOverwrite = state.liftOverwriteSegment;
      s.smartToolExtractSplice = state.extractSpliceSegment;
      s.smartToolOverwriteTrim = state.overwriteTrim;
      s.smartToolRippleTrim = state.rippleTrim;
    }),
    toggleSmartToolRippleTrim: () => set((s) => {
      smartToolEngine.toggleRippleTrim();
      const state = smartToolEngine.getState();
      s.smartToolLiftOverwrite = state.liftOverwriteSegment;
      s.smartToolExtractSplice = state.extractSpliceSegment;
      s.smartToolOverwriteTrim = state.overwriteTrim;
      s.smartToolRippleTrim = state.rippleTrim;
    }),

    // ─── Multicam ─────────────────────────────────────────────────────────────
    setMulticamActive: (active) => set((s) => { s.multicamActive = active; }),
    setMulticamGroupId: (groupId) => set((s) => { s.multicamGroupId = groupId; }),
    setMulticamDisplayMode: (mode) => set((s) => { s.multicamDisplayMode = mode; }),

    // ─── Clip Display ─────────────────────────────────────────────────────────
    setClipLocalColor: (clipId, color) => set((s) => { s.clipLocalColors[clipId] = color; }),
    clearClipLocalColor: (clipId) => set((s) => { delete s.clipLocalColors[clipId]; }),
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
    setVersionHistoryRetentionPreference: (preference) => set((s) => {
      s.versionHistoryRetentionPreference = preference;
    }),
    setVersionHistoryCompareMode: (mode) => set((s) => {
      s.versionHistoryCompareMode = mode;
    }),

    // ─── Audio (extended) ─────────────────────────────────────────────────────
    toggleAudioScrub: () => set((s) => { s.audioScrubEnabled = !s.audioScrubEnabled; }),
    toggleSoloSafe: () => set((s) => { s.soloSafeMode = !s.soloSafeMode; }),

    // ─── Workspace ────────────────────────────────────────────────────────────
    setActiveWorkspace: (id) => set((s) => { s.activeWorkspaceId = id; }),

    // ─── Navigation (Avid parity) ─────────────────────────────────────────────
    goToNextEditPoint: () => set((s) => {
      const current = s.playheadTime;
      const activeTrackIds = new Set(resolveEditorialFocusTrackIds(s));
      let nearest = Infinity;
      for (const track of s.tracks) {
        if (!activeTrackIds.has(track.id) || track.locked || track.muted) continue;
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
      const activeTrackIds = new Set(resolveEditorialFocusTrackIds(s));
      let nearest = -Infinity;
      for (const track of s.tracks) {
        if (!activeTrackIds.has(track.id) || track.locked || track.muted) continue;
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

    loadProject: async (id) => {
      const requestSequence = ++loadProjectRequestSequence;
      set((s) => {
        s.projectId = id;
        s.saveStatus = 'saving';
      });

      try {
        const project = await getProjectFromRepository(id);
        if (requestSequence !== loadProjectRequestSequence) {
          return;
        }
        if (!project) {
          set((s) => {
            s.saveStatus = 'error';
          });
          return;
        }
        get().applyProjectSnapshot(project, { markDirty: false, lastSavedAt: project.updatedAt });
      } catch (error) {
        if (requestSequence !== loadProjectRequestSequence) {
          return;
        }
        console.error('Failed to load project', error);
        set((s) => {
          s.saveStatus = 'error';
        });
      }
    },
    saveProject: async () => {
      const snapshot = buildProjectPersistenceSnapshot(get());
      if (!snapshot) {
        return;
      }

      set((s) => {
        s.saveStatus = 'saving';
      });

      try {
        const projectToSave = buildProjectFromEditorState(snapshot);
        const savedProject = await saveProjectToRepository(projectToSave) ?? projectToSave;
        set((s) => {
          s.projectId = savedProject.id;
          s.projectName = savedProject.name;
          s.projectTemplate = savedProject.template;
          s.projectDescription = savedProject.description;
          s.projectTags = [...savedProject.tags];
          s.projectSchemaVersion = savedProject.schemaVersion;
          s.projectCreatedAt = savedProject.createdAt;
          s.lastSavedAt = savedProject.updatedAt;
          s.saveStatus = 'saved';
          s.persistedProjectHash = getProjectPersistenceHash(snapshot);
          s.hasUnsavedChanges = false;
        });
      } catch (error) {
        console.error('Failed to save project', error);
        set((s) => {
          s.saveStatus = 'error';
        });
      }
    },
    restoreProjectSnapshot: (project) => {
      const state = get();
      const restoredAt = new Date().toISOString();
      const effectiveProject = state.projectId
        ? {
            ...project,
            id: state.projectId,
            updatedAt: restoredAt,
          }
        : {
            ...project,
            updatedAt: restoredAt,
          };

      get().applyProjectSnapshot(effectiveProject, {
        markDirty: true,
        lastSavedAt: state.lastSavedAt,
      });
    },

    // ─── Multi-Sequence Actions ──────────────────────────────────────────
    createSequence: (name: string) => {
      const id = createId('seq');
      set((s) => {
        // Save current state back to the active sequence before switching
        const current = s.sequences.find(seq => seq.id === s.activeSequenceId);
        if (current) {
          current.tracks = s.tracks;
          current.markers = s.markers;
          current.duration = s.duration;
          current.inPoint = s.inPoint;
          current.outPoint = s.outPoint;
        }

        const newTracks = [
          { id: createId('t'), name: 'V1', type: 'VIDEO' as const, sortOrder: 0, muted: false, locked: false, solo: false, volume: 1, color: '#5b6af5', clips: [] as Clip[] },
          { id: createId('t'), name: 'V2', type: 'VIDEO' as const, sortOrder: 1, muted: false, locked: false, solo: false, volume: 1, color: '#818cf8', clips: [] as Clip[] },
          { id: createId('t'), name: 'A1', type: 'AUDIO' as const, sortOrder: 2, muted: false, locked: false, solo: false, volume: 0.85, color: '#e05b8e', clips: [] as Clip[] },
          { id: createId('t'), name: 'A2', type: 'AUDIO' as const, sortOrder: 3, muted: false, locked: false, solo: false, volume: 0.6, color: '#4ade80', clips: [] as Clip[] },
        ];
        const newSeq: Sequence = {
          id,
          name,
          tracks: newTracks,
          markers: [],
          duration: 0,
          fps: s.sequenceSettings.fps,
          dropFrame: s.sequenceSettings.dropFrame,
          inPoint: null,
          outPoint: null,
          createdAt: new Date().toISOString(),
        };
        s.sequences.push(newSeq);

        // Auto-activate the new sequence
        s.activeSequenceId = id;
        s.tracks = newTracks;
        s.markers = [];
        s.duration = 0;
        s.inPoint = null;
        s.outPoint = null;
        s.playheadTime = 0;
        s.selectedClipIds = [];
        s.inspectedClipId = null;
        s.sequenceSettings.name = name;
        s.enabledTrackIds = newTracks.map(t => t.id);
      });
      return id;
    },

    deleteSequence: (id) => set((s) => {
      // Cannot delete the active sequence if it's the only one
      if (s.sequences.length <= 1) return;
      s.sequences = s.sequences.filter(seq => seq.id !== id);
      // If the deleted sequence was active, switch to the first available
      if (s.activeSequenceId === id) {
        const next = s.sequences[0];
        if (next) {
          s.activeSequenceId = next.id;
          s.tracks = next.tracks;
          s.markers = next.markers;
          s.duration = next.duration;
          s.inPoint = next.inPoint;
          s.outPoint = next.outPoint;
          s.playheadTime = 0;
          s.selectedClipIds = [];
        }
      }
      // If the deleted sequence was loaded in source, clear it
      if (s.sourceSequenceId === id) {
        s.sourceSequenceId = null;
      }
    }),

    duplicateSequence: (id) => {
      const newId = createId('seq');
      set((s) => {
        const source = s.sequences.find(seq => seq.id === id);
        if (!source) return;
        const duplicated: Sequence = {
          ...source,
          id: newId,
          name: `${source.name} (Copy)`,
          tracks: source.tracks.map(t => ({
            ...t,
            id: createId('t'),
            clips: t.clips.map(c => ({
              ...c,
              id: createId('clip'),
              intrinsicVideo: { ...c.intrinsicVideo },
              intrinsicAudio: { ...c.intrinsicAudio },
              timeRemap: { ...c.timeRemap, keyframes: c.timeRemap.keyframes.map(kf => ({ ...kf })) },
              waveformData: c.waveformData ? [...c.waveformData] : undefined,
            })),
          })),
          markers: source.markers.map(m => ({ ...m, id: createId('marker') })),
          createdAt: new Date().toISOString(),
        };
        s.sequences.push(duplicated);
      });
      return newId;
    },

    renameSequence: (id, name) => set((s) => {
      const seq = s.sequences.find(seq => seq.id === id);
      if (seq) {
        seq.name = name;
        // Also update sequenceSettings.name if this is the active sequence
        if (s.activeSequenceId === id) {
          s.sequenceSettings.name = name;
        }
      }
    }),

    setActiveSequence: (id) => set((s) => {
      if (s.activeSequenceId === id) return;
      // Save current state back to the active sequence before switching
      const current = s.sequences.find(seq => seq.id === s.activeSequenceId);
      if (current) {
        current.tracks = s.tracks;
        current.markers = s.markers;
        current.duration = s.duration;
        current.inPoint = s.inPoint;
        current.outPoint = s.outPoint;
      }
      // Load the new sequence
      const next = s.sequences.find(seq => seq.id === id);
      if (!next) return;
      s.activeSequenceId = id;
      s.tracks = next.tracks;
      s.markers = next.markers;
      s.duration = next.duration;
      s.inPoint = next.inPoint;
      s.outPoint = next.outPoint;
      s.playheadTime = 0;
      s.selectedClipIds = [];
      s.inspectedClipId = null;
      // Sync sequence settings
      s.sequenceSettings.name = next.name;
      s.sequenceSettings.fps = next.fps;
      s.sequenceSettings.dropFrame = next.dropFrame;
      // Update enabled track IDs for the new sequence
      s.enabledTrackIds = next.tracks.map(t => t.id);
    }),

    loadSequenceInSource: (id) => set((s) => {
      s.sourceSequenceId = id;
      // Clear any existing source asset since we're loading a sequence instead
      s.sourceAsset = null;
      s.sourceInPoint = null;
      s.sourceOutPoint = null;
      s.sourcePlayhead = 0;
    }),

    editSourceToRecord: (mode) => set((s) => {
      if (!s.sourceSequenceId) return;
      const sourceSeq = s.sequences.find(seq => seq.id === s.sourceSequenceId);
      if (!sourceSeq) return;

      // Determine the source region from in/out points
      const srcIn = s.sourceInPoint ?? 0;
      const srcOut = s.sourceOutPoint ?? sourceSeq.duration;
      const editDuration = srcOut - srcIn;
      if (editDuration <= 0) return;

      const insertTime = s.playheadTime;

      // For each track in the source sequence, find or create a matching track in record
      for (const srcTrack of sourceSeq.tracks) {
        // Find a matching track in the record timeline by type and name
        let recTrack = s.tracks.find(t => t.type === srcTrack.type && t.name === srcTrack.name);
        if (!recTrack) {
          recTrack = s.tracks.find(t => t.type === srcTrack.type && !t.locked);
        }
        if (!recTrack) continue;

        // Collect clips from source that overlap with srcIn..srcOut
        const clipsInRange = srcTrack.clips.filter(c => c.endTime > srcIn && c.startTime < srcOut);
        if (clipsInRange.length === 0) continue;

        if (mode === 'overwrite') {
          // Remove or trim clips in the overwrite region on the record track
          const regionStart = insertTime;
          const regionEnd = insertTime + editDuration;
          recTrack.clips = recTrack.clips.filter(c => {
            if (c.endTime <= regionStart || c.startTime >= regionEnd) return true;
            if (c.startTime >= regionStart && c.endTime <= regionEnd) return false;
            if (c.startTime < regionStart && c.endTime > regionEnd) {
              // Split
              const tailClip: Clip = makeClip({
                id: createId('clip'),
                trackId: recTrack!.id,
                name: c.name,
                startTime: regionEnd,
                endTime: c.endTime,
                trimStart: c.trimStart + (regionEnd - c.startTime),
                trimEnd: c.trimEnd,
                type: c.type,
                assetId: c.assetId,
                color: c.color,
                waveformData: c.waveformData,
              });
              c.endTime = regionStart;
              recTrack!.clips.push(tailClip);
              return true;
            }
            if (c.startTime < regionStart) { c.endTime = regionStart; return true; }
            if (c.endTime > regionEnd) { c.trimStart += (regionEnd - c.startTime); c.startTime = regionEnd; return true; }
            return true;
          });
        } else {
          // Insert mode: push existing clips downstream
          const regionEnd = insertTime + editDuration;
          for (const c of recTrack.clips) {
            if (c.startTime >= insertTime) {
              c.startTime += editDuration;
              c.endTime += editDuration;
            } else if (c.startTime < insertTime && c.endTime > insertTime) {
              const tailClip: Clip = makeClip({
                id: createId('clip'),
                trackId: recTrack.id,
                name: c.name,
                startTime: regionEnd,
                endTime: c.endTime + editDuration,
                trimStart: c.trimStart + (insertTime - c.startTime),
                trimEnd: c.trimEnd,
                type: c.type,
                assetId: c.assetId,
                color: c.color,
                waveformData: c.waveformData,
              });
              c.endTime = insertTime;
              recTrack.clips.push(tailClip);
            }
          }
        }

        // Copy the clips from source, offsetting their times
        for (const srcClip of clipsInRange) {
          const clipStart = Math.max(srcClip.startTime, srcIn);
          const clipEnd = Math.min(srcClip.endTime, srcOut);
          const offsetStart = insertTime + (clipStart - srcIn);
          const offsetEnd = insertTime + (clipEnd - srcIn);
          const trimStartAdd = clipStart - srcClip.startTime;
          const trimEndAdd = srcClip.endTime - clipEnd;

          const newClip: Clip = makeClip({
            id: createId('clip'),
            trackId: recTrack.id,
            name: srcClip.name,
            startTime: offsetStart,
            endTime: offsetEnd,
            trimStart: srcClip.trimStart + trimStartAdd,
            trimEnd: srcClip.trimEnd + trimEndAdd,
            type: srcClip.type,
            assetId: srcClip.assetId,
            color: recTrack.color,
            waveformData: srcClip.waveformData ? [...srcClip.waveformData] : undefined,
          });
          recTrack.clips.push(newClip);
        }

        recTrack.clips.sort((a, b) => a.startTime - b.startTime);
      }

      // Update duration
      const maxEnd = Math.max(s.duration, ...s.tracks.flatMap(t => t.clips.map(c => c.endTime)));
      s.duration = maxEnd + 5;
      s.playheadTime = insertTime + editDuration;
    }),

    toggleSequenceBin: () => set((s) => { s.showSequenceBin = !s.showSequenceBin; }),

    // Sequence settings
    updateSequenceSettings: (settings) => set((s) => {
      Object.assign(s.sequenceSettings, settings);
      // Sync project settings with sequence settings
      if (settings.width !== undefined) s.projectSettings.width = settings.width;
      if (settings.height !== undefined) s.projectSettings.height = settings.height;
      if (settings.fps !== undefined) s.projectSettings.frameRate = settings.fps;
      // Sync fps/dropFrame back to the active sequence
      const activeSeq = s.sequences.find(seq => seq.id === s.activeSequenceId);
      if (activeSeq) {
        if (settings.fps !== undefined) activeSeq.fps = settings.fps;
        if (settings.dropFrame !== undefined) activeSeq.dropFrame = settings.dropFrame;
        if (settings.name !== undefined) activeSeq.name = settings.name;
      }
    }),

    // Media import — real pipeline with metadata extraction
    importMediaFiles: (files, binId) => {
      // Phase 1: Create placeholder assets immediately for UI feedback
      const assetIds: string[] = [];
      let resolvedBinId = binId;
      set((s) => {
        const createImportBin = (): Bin => {
          const importBin: Bin = {
            id: createId('bin'),
            name: 'Imported Media',
            color: '#4f63f5',
            isOpen: true,
            children: [],
            assets: [],
          };
          s.bins.unshift(importBin);
          s.selectedBinId = importBin.id;
          s.activeBinAssets = importBin.assets;
          return importBin;
        };
        const targetBin = binId
          ? (function findBin(bins: Bin[]): Bin | null {
              for (const b of bins) {
                if (b.id === binId) return b;
                const child = findBin(b.children);
                if (child) return child;
              }
              return null;
            })(s.bins)
          : s.bins[0] ?? createImportBin();
        if (!targetBin) return;
        resolvedBinId = targetBin.id;

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
            fileSizeBytes: file!.size!,
            fileExtension: ext || undefined,
            mimeType: mime,
            indexStatus: 'INDEXING',
            ingestMetadata: {
              importedAt: new Date().toISOString(),
              storageMode: 'LINK',
              importedFileName: file!.name!,
              originalFileName: file!.name!,
            },
            locations: {
              originalPath: file!.name!,
              playbackUrl: url,
              pathHistory: [file!.name!],
            },
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
            binId: resolvedBinId,
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
              const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
              const isGraphicAsset = asset.type === 'GRAPHIC' || asset.type === 'IMAGE';
              const technicalMetadata: EditorMediaTechnicalMetadata = {
                container: ext || undefined,
                videoCodec: asset.type === 'VIDEO' || asset.type === 'IMAGE' || asset.type === 'GRAPHIC' ? metadata.codec.toLowerCase() : undefined,
                audioCodec: asset.type === 'AUDIO' ? metadata.codec.toLowerCase() : asset.type === 'VIDEO' ? undefined : undefined,
                durationSeconds: isFinite(metadata.duration) ? metadata.duration : 0,
                frameRate: metadata.fps || undefined,
                width: metadata.width || undefined,
                height: metadata.height || undefined,
                audioChannels: metadata.audioChannels > 0 ? metadata.audioChannels : undefined,
                audioChannelLayout: metadata.audioChannelLayout !== 'none'
                  ? metadata.audioChannelLayout as EditorMediaTechnicalMetadata['audioChannelLayout']
                  : undefined,
                sampleRate: metadata.sampleRate || undefined,
                timecodeStart: metadata.startTimecode || undefined,
                colorDescriptor: {
                  colorSpace: metadata.colorSpace !== 'n/a' ? metadata.colorSpace : undefined,
                  range: 'unknown',
                  alphaMode: metadata.hasAlpha ? 'straight' : 'none',
                  hdrMode: 'unknown',
                  bitDepth: metadata.bitDepth || undefined,
                },
                graphicDescriptor: isGraphicAsset
                  ? {
                      kind: asset.type === 'GRAPHIC' ? (ext === 'svg' || ext === 'pdf' ? 'vector' : 'layered-graphic') : 'bitmap',
                      sourceFormat: ext || undefined,
                      canvasWidth: metadata.width || undefined,
                      canvasHeight: metadata.height || undefined,
                      hasAlpha: metadata.hasAlpha,
                      flatteningRequired: asset.type === 'GRAPHIC',
                      renderStrategy: asset.type === 'GRAPHIC'
                        ? (ext === 'svg' || ext === 'pdf' ? 'rasterize' : 'flatten')
                        : 'direct',
                    }
                  : undefined,
                sideData: [],
                captions: [],
                formatTags: {},
              };
              const hydrated = hydrateMediaAsset({
                id: asset.id,
                name: asset.name,
                type: asset.type,
                duration: isFinite(metadata.duration) ? metadata.duration : 0,
                status: 'READY',
                playbackUrl: asset.playbackUrl,
                thumbnailUrl: metadata.thumbnailUrl,
                waveformData: metadata.waveformData ? Array.from(metadata.waveformData) : undefined,
                fileExtension: ext || undefined,
                fileSizeBytes: metadata.fileSize,
                indexStatus: 'READY',
                ingestMetadata: asset.ingestMetadata,
                locations: asset.locations,
                technicalMetadata,
                proxyMetadata: {
                  status: 'NOT_REQUESTED',
                },
                waveformMetadata: metadata.waveformData
                  ? {
                      status: 'READY',
                      peaks: Array.from(metadata.waveformData),
                      sampleCount: metadata.waveformData.length,
                      updatedAt: new Date().toISOString(),
                    }
                  : {
                      status: 'UNAVAILABLE',
                      peaks: [],
                      sampleCount: 0,
                    },
                tags: asset.tags,
                isFavorite: asset.isFavorite,
              });

              Object.assign(asset, hydrated, {
                status: 'READY',
                width: metadata.width,
                height: metadata.height,
                fps: metadata.fps,
                codec: metadata.codec,
                colorSpace: metadata.colorSpace,
                hasAlpha: metadata.hasAlpha,
                audioChannels: metadata.audioChannels,
                audioChannelLayout: metadata.audioChannelLayout,
                sampleRate: metadata.sampleRate,
                fileSize: metadata.fileSize,
                startTimecode: metadata.startTimecode,
                bitDepth: metadata.bitDepth,
                mimeType: metadata.mimeType,
                thumbnailUrl: metadata.thumbnailUrl,
                waveformData: metadata.waveformData ? Array.from(metadata.waveformData) : asset.waveformData,
                mediaDbId: assetId,
              });
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
            if (asset) {
              const message = err instanceof Error ? err.message : 'Media probe failed';
              asset.status = 'ERROR';
              asset.indexStatus = 'ERROR';
              asset.capabilityReport = {
                primarySurface: window.electronAPI ? 'desktop' : 'web',
                primaryDisposition: 'unsupported',
                sourceSupportTier: asset.supportTier ?? 'unsupported',
                preferredVariantId: asset.capabilityReport?.preferredVariantId,
                surfaces: ['desktop', 'web', 'mobile', 'worker'].map((surface) => ({
                  surface: surface as 'desktop' | 'web' | 'mobile' | 'worker',
                  disposition: 'unsupported' as const,
                  supportTier: asset.supportTier ?? 'unsupported',
                  preferredVariantId: asset.capabilityReport?.preferredVariantId,
                  reasons: [message],
                })),
                issues: [message],
              };
            }
            delete s.ingestProgress[assetId];
          });
        }
      });
    },

    // Dialogs
    openNewProjectDialog: (template) => set((s) => {
      s.showNewProjectDialog = true;
      s.newProjectDialogTemplate = template ?? 'film';
    }),
    closeNewProjectDialog: () => set((s) => { s.showNewProjectDialog = false; }),
    toggleSequenceDialog: () => set((s) => { s.showSequenceDialog = !s.showSequenceDialog; }),
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
      for (const track of s.tracks) {
        if (track.type !== 'GRAPHIC') {
          continue;
        }
        track.clips = track.clips.filter((clip) => clip.assetId !== titleId);
      }
    }),
    updateTitleClip: (titleId, data) => set((s) => {
      const title = s.titleClips.find((t) => t.id === titleId);
      if (title) Object.assign(title, data);
    }),

    // ─── NLE Parity: Additional Editorial Actions ────────────────────────

    setEditMode: (mode) => set((s) => { s.editMode = mode; }),

    setSegmentEditMode: (mode) => set((s) => { s.segmentEditMode = mode; }),

    spliceIn: (trackId, clip) => set((s) => {
      const track = s.tracks.find((t) => t.id === trackId);
      if (!track || track.locked) return;

      const position = s.playheadTime;
      const duration = clip.endTime != null && clip.startTime != null
        ? clip.endTime - clip.startTime
        : 5; // default 5s if no duration specified
      const endPos = position + duration;

      // Ripple: push all clips at or after position to the right
      for (const c of track.clips) {
        if (c.startTime >= position) {
          c.startTime += duration;
          c.endTime += duration;
        } else if (c.startTime < position && c.endTime > position) {
          // Split clip that straddles the insert position
          const tailClip: Clip = makeClip({
            ...c,
            id: createId('clip'),
            trackId,
            startTime: endPos,
            endTime: c.endTime + duration,
            trimStart: c.trimStart + (position - c.startTime),
          });
          c.endTime = position;
          track.clips.push(tailClip);
        }
      }

      // Insert the new clip
      const newClip: Clip = makeClip({
        id: createId('clip'),
        trackId,
        name: clip.name ?? 'Inserted Clip',
        startTime: position,
        endTime: endPos,
        trimStart: clip.trimStart ?? 0,
        trimEnd: clip.trimEnd ?? 0,
        type: clip.type ?? 'video',
        assetId: clip.assetId,
        color: clip.color ?? track.color,
        waveformData: clip.waveformData,
      });
      track.clips.push(newClip);
      track.clips.sort((a, b) => a.startTime - b.startTime);

      // Sync-lock compensation
      for (const syncTrackId of s.syncLockedTrackIds) {
        if (syncTrackId === trackId) continue;
        const syncTrack = s.tracks.find((t) => t.id === syncTrackId);
        if (!syncTrack || syncTrack.locked) continue;
        for (const c of syncTrack.clips) {
          if (c.startTime >= position) {
            c.startTime += duration;
            c.endTime += duration;
          }
        }
      }

      s.selectedClipIds = [newClip.id];
      s.playheadTime = endPos;
      if (endPos > s.duration) s.duration = endPos + 5;
    }),

    overwriteEditOnTrack: (trackId, clip) => set((s) => {
      const track = s.tracks.find((t) => t.id === trackId);
      if (!track || track.locked) return;

      const position = s.playheadTime;
      const duration = clip.endTime != null && clip.startTime != null
        ? clip.endTime - clip.startTime
        : 5;
      const regionStart = position;
      const regionEnd = position + duration;

      // Clear clips in the overwrite region
      const newClips: Clip[] = [];
      for (const c of track.clips) {
        if (c.endTime <= regionStart || c.startTime >= regionEnd) {
          newClips.push(c);
        } else if (c.startTime >= regionStart && c.endTime <= regionEnd) {
          // Entirely within — remove
        } else if (c.startTime < regionStart && c.endTime > regionEnd) {
          // Spans entire region — split
          const tailClip: Clip = makeClip({
            ...c,
            id: createId('clip'),
            trackId,
            startTime: regionEnd,
            endTime: c.endTime,
            trimStart: c.trimStart + (regionEnd - c.startTime),
          });
          c.endTime = regionStart;
          newClips.push(c);
          newClips.push(tailClip);
        } else if (c.startTime < regionStart) {
          c.endTime = regionStart;
          newClips.push(c);
        } else if (c.endTime > regionEnd) {
          c.trimStart += (regionEnd - c.startTime);
          c.startTime = regionEnd;
          newClips.push(c);
        }
      }
      track.clips = newClips;

      // Place the new clip
      const newClip: Clip = makeClip({
        id: createId('clip'),
        trackId,
        name: clip.name ?? 'Overwrite Clip',
        startTime: regionStart,
        endTime: regionEnd,
        trimStart: clip.trimStart ?? 0,
        trimEnd: clip.trimEnd ?? 0,
        type: clip.type ?? 'video',
        assetId: clip.assetId,
        color: clip.color ?? track.color,
        waveformData: clip.waveformData,
      });
      track.clips.push(newClip);
      track.clips.sort((a, b) => a.startTime - b.startTime);

      s.selectedClipIds = [newClip.id];
      s.playheadTime = regionEnd;
      if (regionEnd > s.duration) s.duration = regionEnd + 5;
    }),

    slipSelectedClip: (frames) => set((s) => {
      if (s.selectedClipIds.length !== 1) return;
      const clipId = s.selectedClipIds[0]!;
      const fps = s.sequenceSettings.fps || 24;
      const delta = frames / fps;
      for (const t of s.tracks) {
        const c = t.clips.find((c) => c.id === clipId);
        if (c) {
          // Slip: change source window without changing timeline position
          const maxForward = c.trimEnd;
          const maxBackward = c.trimStart;
          const clamped = Math.max(-maxBackward, Math.min(maxForward, delta));
          c.trimStart += clamped;
          c.trimEnd -= clamped;
          return;
        }
      }
    }),

    slideSelectedClip: (frames) => set((s) => {
      if (s.selectedClipIds.length !== 1) return;
      const clipId = s.selectedClipIds[0]!;
      const fps = s.sequenceSettings.fps || 24;
      const delta = frames / fps;
      for (const t of s.tracks) {
        const idx = t.clips.findIndex((c) => c.id === clipId);
        if (idx >= 0) {
          const clip = t.clips[idx]!;
          const prev = idx > 0 ? t.clips[idx - 1] : null;
          const next = idx < t.clips.length - 1 ? t.clips[idx + 1] : null;

          // Clamp delta
          let clamped = delta;
          if (clamped < 0) {
            if (prev) clamped = Math.max(clamped, prev.startTime + 0.01 - prev.endTime);
            else clamped = Math.max(clamped, -clip.startTime);
          }
          if (clamped > 0 && next) {
            clamped = Math.min(clamped, next.endTime - 0.01 - next.startTime);
          }

          // Move clip
          clip.startTime += clamped;
          clip.endTime += clamped;

          // Adjust neighbors
          if (prev) {
            prev.endTime += clamped;
            prev.trimEnd = Math.max(0, prev.trimEnd - clamped);
          }
          if (next) {
            next.startTime += clamped;
            next.trimStart = Math.max(0, next.trimStart + clamped);
          }
          return;
        }
      }
    }),

    enterTrimMode: (clipId, side) => set((s) => {
      s.trimModeState = { active: true, clipId, side };
      s.trimActive = true;
    }),

    applyTrim: (frames) => set((s) => {
      if (!s.trimModeState.active || !s.trimModeState.clipId) return;
      const fps = s.sequenceSettings.fps || 24;
      const delta = frames / fps;
      const clipId = s.trimModeState.clipId;
      const side = s.trimModeState.side;

      for (const t of s.tracks) {
        const c = t.clips.find((c) => c.id === clipId);
        if (c) {
          if (side === 'head') {
            // Trim head: adjust startTime
            const newStart = Math.max(0, c.startTime + delta);
            const maxStart = c.endTime - (1 / fps); // at least one frame
            c.trimStart = Math.max(0, c.trimStart + (Math.min(newStart, maxStart) - c.startTime));
            c.startTime = Math.min(newStart, maxStart);
          } else if (side === 'tail') {
            // Trim tail: adjust endTime
            const newEnd = c.endTime + delta;
            const minEnd = c.startTime + (1 / fps);
            c.trimEnd = Math.max(0, c.trimEnd - (Math.max(newEnd, minEnd) - c.endTime));
            c.endTime = Math.max(newEnd, minEnd);
          }
          return;
        }
      }
    }),

    exitTrimModeAction: () => set((s) => {
      s.trimModeState = { active: false, clipId: null, side: null };
      s.trimActive = false;
    }),

    groupSelectedClips: () => set((s) => {
      if (s.selectedClipIds.length < 2) return;
      const groupId = createId('group');
      s.clipGroups[groupId] = [...s.selectedClipIds];
    }),

    ungroupClip: (clipId) => set((s) => {
      for (const [groupId, clipIds] of Object.entries(s.clipGroups)) {
        if (clipIds.includes(clipId)) {
          delete s.clipGroups[groupId];
          return;
        }
      }
    }),

    duplicateSelectedClips: () => set((s) => {
      if (s.selectedClipIds.length === 0) return;
      const newIds: string[] = [];
      for (const clipId of s.selectedClipIds) {
        for (const t of s.tracks) {
          const clip = t.clips.find((c) => c.id === clipId);
          if (clip) {
            const dur = clip.endTime - clip.startTime;
            const newId = createId('clip');
            const dup: Clip = {
              ...clip,
              id: newId,
              startTime: clip.endTime,
              endTime: clip.endTime + dur,
              intrinsicVideo: { ...clip.intrinsicVideo },
              intrinsicAudio: { ...clip.intrinsicAudio },
              timeRemap: { ...clip.timeRemap, keyframes: clip.timeRemap.keyframes.map(kf => ({ ...kf })) },
              waveformData: clip.waveformData ? [...clip.waveformData] : undefined,
            };
            t.clips.push(dup);
            newIds.push(newId);
            break;
          }
        }
      }
      s.selectedClipIds = newIds;
    }),

    rippleDeleteSelection: () => set((s) => {
      if (s.selectedClipIds.length === 0) return;
      for (const t of s.tracks) {
        const removedClips = t.clips
          .filter((c) => s.selectedClipIds.includes(c.id))
          .sort((a, b) => a.startTime - b.startTime);
        if (removedClips.length === 0) continue;

        // Process from last to first to maintain offsets
        for (let i = removedClips.length - 1; i >= 0; i--) {
          const clip = removedClips[i]!;
          const dur = clip.endTime - clip.startTime;
          t.clips = t.clips.filter((c) => c.id !== clip.id);
          // Shift downstream clips left
          for (const c of t.clips) {
            if (c.startTime >= clip.startTime) {
              c.startTime -= dur;
              c.endTime -= dur;
            }
          }
        }
      }
      s.selectedClipIds = [];
    }),

    addAdjustmentLayerClip: (options) => {
      let clipId: string | null = null;
      set((s) => {
        const startTime = options?.startTime ?? s.inPoint ?? s.playheadTime;
        const endTime = options?.endTime
          ?? (
            s.outPoint !== null && s.outPoint > startTime
              ? s.outPoint
              : startTime + Math.max(options?.durationSeconds ?? 5, MIN_CLIP_DURATION)
          );
        if (endTime <= startTime) {
          return;
        }

        const preferredTrack = options?.trackId
          ? s.tracks.find((track) => track.id === options.trackId && track.type === 'EFFECT' && !track.locked) ?? null
          : null;
        const effectTrack = preferredTrack ?? ensureTimelineTrack(s.tracks, 'EFFECT');
        const clip = makeClip({
          id: createId('fxclip'),
          trackId: effectTrack.id,
          name: options?.name ?? 'Adjustment Layer',
          startTime,
          endTime,
          trimStart: 0,
          trimEnd: 0,
          type: 'effect',
          color: effectTrack.color,
        });

        effectTrack.clips.push(clip);
        effectTrack.clips.sort((left, right) => left.startTime - right.startTime);
        s.selectedTrackId = effectTrack.id;
        s.selectedClipIds = [clip.id];
        s.inspectedClipId = clip.id;
        s.activeInspectorTab = 'effects';
        if (clip.endTime > s.duration) {
          s.duration = clip.endTime + 1;
        }
        clipId = clip.id;
      });
      return clipId;
    },
    buildTranscriptTitleEffects: (options) => {
      let createdCount = 0;
      set((s) => {
        if (s.transcript.length === 0) {
          return;
        }

        removeAutogeneratedTranscriptTitles(s);

        const preferredTrack = options?.trackId
          ? s.tracks.find((track) => track.id === options.trackId && track.type === 'GRAPHIC' && !track.locked) ?? null
          : null;
        const graphicTrack = preferredTrack ?? ensureTimelineTrack(s.tracks, 'GRAPHIC');
        const useTranslations = options?.useTranslations ?? true;
        const includeSpeakerLabels = options?.includeSpeakerLabels ?? false;

        for (const cue of s.transcript) {
          const textBody = useTranslations && cue.translation ? cue.translation : cue.text;
          const text = includeSpeakerLabels && cue.speaker
            ? `${cue.speaker}: ${textBody}`
            : textBody;
          const titleId = createId('title');
          const titleClip: TitleClipData = {
            id: titleId,
            templateId: 'auto-transcript-subtitle',
            text,
            style: {
              fontFamily: 'system-ui',
              fontSize: 42,
              fontWeight: 600,
              color: '#f6f7fa',
              outlineColor: '#000000',
              outlineWidth: 2,
              shadowColor: 'rgba(0, 0, 0, 0.72)',
              shadowBlur: 8,
              opacity: 1,
              textAlign: 'center',
            },
            position: {
              x: 0.12,
              y: 0.78,
              width: 0.76,
              height: 0.14,
            },
            background: {
              type: 'solid',
              color: '#000000',
              opacity: 0.62,
            },
            animation: {
              type: 'none',
              duration: 0,
            },
          };
          const clip = makeClip({
            id: createId('clip'),
            trackId: graphicTrack.id,
            name: text.slice(0, 48) || 'Transcript Title',
            startTime: cue.startTime,
            endTime: Math.max(cue.endTime, cue.startTime + MIN_CLIP_DURATION),
            trimStart: 0,
            trimEnd: 0,
            type: 'video',
            assetId: titleId,
            color: graphicTrack.color,
          });

          s.titleClips.push(titleClip);
          graphicTrack.clips.push(clip);
          createdCount += 1;
          if (clip.endTime > s.duration) {
            s.duration = clip.endTime + 1;
          }
        }

        graphicTrack.clips.sort((left, right) => left.startTime - right.startTime);
        s.selectedTrackId = graphicTrack.id;
        s.activeInspectorTab = 'effects';
      });
      return createdCount;
    },
    });
  })
);

// ─── Active Sequence Sync ────────────────────────────────────────────────────
// Keep the active sequence's tracks/markers/duration in sync with the
// top-level state whenever they change. This uses a subscribe so that any
// action that mutates tracks/markers/duration automatically mirrors back.
let _lastSyncedTracks: Track[] | null = null;
let _lastSyncedMarkers: Marker[] | null = null;
let _lastSyncedDuration: number | null = null;
useEditorStore.subscribe((state) => {
  if (state.tracks !== _lastSyncedTracks || state.markers !== _lastSyncedMarkers || state.duration !== _lastSyncedDuration) {
    _lastSyncedTracks = state.tracks;
    _lastSyncedMarkers = state.markers;
    _lastSyncedDuration = state.duration;
    // Sync back to the active sequence record
    const activeSeq = state.sequences.find(seq => seq.id === state.activeSequenceId);
    if (activeSeq && (activeSeq.tracks !== state.tracks || activeSeq.markers !== state.markers || activeSeq.duration !== state.duration)) {
      useEditorStore.setState((s: any) => {
        const seq = s.sequences.find((seq: Sequence) => seq.id === s.activeSequenceId);
        if (seq) {
          seq.tracks = s.tracks;
          seq.markers = s.markers;
          seq.duration = s.duration;
          seq.inPoint = s.inPoint;
          seq.outPoint = s.outPoint;
        }
      });
    }
  }
});

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
