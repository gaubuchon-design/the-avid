import { DEFAULT_EDITORIAL_WORKSPACE_ID } from './editorial-experience';
import {
  createAssetCapabilityReport,
  inferMediaSupportTier as inferSharedMediaSupportTier,
  type AssetCapabilityInput as SharedAssetCapabilityInput,
} from '@mcua/media-backend';
import type { AudioChannelLayout } from './audio/channelLayout';

export type TrackType = 'VIDEO' | 'AUDIO' | 'EFFECT' | 'SUBTITLE' | 'GRAPHIC';
export type PanelType = 'edit' | 'color' | 'audio' | 'effects' | 'publish' | 'review' | 'ingest' | 'script' | 'news';
export type WorkspaceTab = 'video' | 'audio' | 'color' | 'ai';
export type ProjectTemplate = 'film' | 'commercial' | 'documentary' | 'sports' | 'podcast' | 'social' | 'news';
export const PROJECT_SCHEMA_VERSION = 2;
export type MediaIndexStatus = 'UNSCANNED' | 'INDEXING' | 'READY' | 'MISSING' | 'ERROR';
export type MediaStorageMode = 'COPY' | 'LINK';
export type MediaProxyStatus = 'NOT_REQUESTED' | 'QUEUED' | 'READY' | 'FAILED' | 'SKIPPED';
export type MediaWaveformStatus = 'PENDING' | 'READY' | 'FAILED' | 'UNAVAILABLE';
export type MediaSemanticStatus = 'PENDING' | 'READY' | 'FAILED' | 'SKIPPED';
export type MediaSupportTier = 'native' | 'normalized' | 'adapter' | 'unsupported';
export type MediaAssetClass = 'video' | 'audio' | 'subtitle' | 'bitmap' | 'vector' | 'layered-graphic' | 'document';
export type MediaReferenceRole =
  | 'original'
  | 'managed'
  | 'playback'
  | 'proxy'
  | 'waveform'
  | 'subtitle-sidecar'
  | 'graphic-source'
  | 'graphic-render';
export type MediaReferenceLocator = 'absolute-path' | 'package-relative-path' | 'file-url' | 'http-url';
export type StreamKind = 'video' | 'audio' | 'subtitle' | 'data' | 'attachment';
export type VariantPurpose =
  | 'source'
  | 'managed'
  | 'playback'
  | 'proxy'
  | 'waveform'
  | 'subtitle'
  | 'graphic-render'
  | 'conform';
export type VariantAvailability = 'ready' | 'pending' | 'failed' | 'missing';
export type CapabilitySurface = 'desktop' | 'web' | 'mobile' | 'worker';
export type CapabilityDisposition = 'native' | 'proxy-only' | 'mezzanine-required' | 'adapter-required' | 'unsupported';
export type MediaAlphaMode = 'none' | 'straight' | 'premultiplied' | 'unknown';
export type ProbeSideDataDescriptor = {
  type: string;
  metadata: Record<string, unknown>;
};
export type CaptionDescriptor = {
  kind: 'embedded-608' | 'embedded-708' | 'subtitle-stream' | 'sidecar' | 'teletext' | 'dvb-subtitle' | 'unknown';
  codec?: string;
  language?: string;
  streamIndex?: number;
  serviceName?: string;
};

export interface TimebaseDescriptor {
  numerator: number;
  denominator: number;
  framesPerSecond?: number;
  displayString?: string;
  dropFrame?: boolean;
}

export type RationalTimebase = TimebaseDescriptor;

export interface ColorDescriptor {
  colorSpace?: string;
  primaries?: string;
  transfer?: string;
  matrix?: string;
  range?: 'full' | 'limited' | 'unknown';
  bitDepth?: number;
  chromaSubsampling?: string;
  alphaMode?: MediaAlphaMode;
  hdrMode?: 'sdr' | 'hlg' | 'pq' | 'dolby-vision' | 'unknown';
  iccProfileName?: string;
  masteringDisplayMetadata?: string;
  contentLightLevelMetadata?: string;
}

export interface GraphicDescriptor {
  kind: Extract<MediaAssetClass, 'bitmap' | 'vector' | 'layered-graphic'>;
  sourceFormat?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  pageCount?: number;
  layerCount?: number;
  hasAlpha?: boolean;
  orientation?: number;
  flatteningRequired?: boolean;
  renderStrategy?: 'direct' | 'rasterize' | 'flatten';
}

export interface MediaReference {
  id: string;
  role: MediaReferenceRole;
  locator: MediaReferenceLocator;
  path?: string;
  relativePath?: string;
  url?: string;
  fileName?: string;
  fileExtension?: string;
  container?: string;
  mimeType?: string;
  checksum?: string;
  sizeBytes?: number;
  isPreferred?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StreamDescriptor {
  id: string;
  index: number;
  kind: StreamKind;
  codec?: string;
  codecLongName?: string;
  codecTag?: string;
  codecProfile?: string;
  language?: string;
  title?: string;
  disposition?: string[];
  durationSeconds?: number;
  bitRate?: number;
  timebase?: TimebaseDescriptor;
  frameRate?: RationalTimebase;
  averageFrameRate?: RationalTimebase;
  width?: number;
  height?: number;
  sampleAspectRatio?: string;
  displayAspectRatio?: string;
  fieldOrder?: string;
  pixelFormat?: string;
  audioChannels?: number;
  audioChannelLayout?: AudioChannelLayout;
  sampleRate?: number;
  sampleFormat?: string;
  reelName?: string;
  timecodeStart?: string;
  colorDescriptor?: ColorDescriptor;
  sideData?: ProbeSideDataDescriptor[];
  captions?: CaptionDescriptor[];
}

export interface VariantRecord {
  id: string;
  name: string;
  purpose: VariantPurpose;
  availability: VariantAvailability;
  supportTier: MediaSupportTier;
  referenceIds: string[];
  streamIds: string[];
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  colorDescriptor?: ColorDescriptor;
  error?: string;
}

export interface CapabilitySurfaceReport {
  surface: CapabilitySurface;
  disposition: CapabilityDisposition;
  supportTier: MediaSupportTier;
  preferredVariantId?: string;
  reasons: string[];
}

export interface CapabilityReport {
  primarySurface: CapabilitySurface;
  primaryDisposition: CapabilityDisposition;
  sourceSupportTier: MediaSupportTier;
  preferredVariantId?: string;
  surfaces: CapabilitySurfaceReport[];
  issues: string[];
  updatedAt?: string;
}

export interface AssetRecord {
  assetClass: MediaAssetClass;
  supportTier: MediaSupportTier;
  references: MediaReference[];
  streams: StreamDescriptor[];
  variants: VariantRecord[];
  capabilityReport?: CapabilityReport;
  timebase?: TimebaseDescriptor;
  colorDescriptor?: ColorDescriptor;
  graphicDescriptor?: GraphicDescriptor;
}

export interface EditorMediaFingerprint {
  algorithm: 'sha1-partial';
  digest: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface EditorMediaIngestMetadata {
  importedAt: string;
  storageMode: MediaStorageMode;
  importedFileName?: string;
  originalFileName?: string;
}

export interface EditorMediaLocations {
  originalPath?: string;
  managedPath?: string;
  relativeManagedPath?: string;
  playbackUrl?: string;
  pathHistory: string[];
}

export interface EditorMediaTechnicalMetadata {
  container?: string;
  containerLongName?: string;
  videoCodec?: string;
  audioCodec?: string;
  subtitleCodec?: string;
  audioChannelLayout?: AudioChannelLayout;
  durationSeconds?: number;
  frameRate?: number;
  width?: number;
  height?: number;
  audioChannels?: number;
  sampleRate?: number;
  bitRate?: number;
  timecodeStart?: string;
  reelName?: string;
  timebase?: TimebaseDescriptor;
  averageFrameRate?: RationalTimebase;
  colorDescriptor?: ColorDescriptor;
  graphicDescriptor?: GraphicDescriptor;
  subtitleLanguages?: string[];
  sideData?: ProbeSideDataDescriptor[];
  captions?: CaptionDescriptor[];
  formatTags?: Record<string, string>;
  isVariableFrameRate?: boolean;
}

export interface EditorMediaRelinkIdentity {
  assetKey: string;
  normalizedName: string;
  sourceFileStem: string;
  lastKnownPaths: string[];
  reelName?: string;
  sourceTimecodeStart?: string;
  frameRate?: number;
  durationSeconds?: number;
}

export interface EditorMediaProxyMetadata {
  status: MediaProxyStatus;
  filePath?: string;
  relativePath?: string;
  playbackUrl?: string;
  codec?: string;
  width?: number;
  height?: number;
  error?: string;
  updatedAt?: string;
}

export interface EditorMediaWaveformMetadata {
  status: MediaWaveformStatus;
  peaks: number[];
  sampleCount: number;
  error?: string;
  updatedAt?: string;
}

export interface EditorMediaSemanticMetadata {
  status: MediaSemanticStatus;
  tags: string[];
  transcriptSummary?: string;
  people: string[];
  locations: string[];
  scenes: string[];
  updatedAt?: string;
  error?: string;
}

export interface EditorWatchFolder {
  id: string;
  name: string;
  path: string;
  status: 'WATCHING' | 'PAUSED' | 'ERROR';
  createdAt: string;
  lastScannedAt?: string;
  lastImportedAt?: string;
  importedAssetCount: number;
  error?: string;
}

export interface EditorClip {
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

export interface EditorTrack {
  id: string;
  name: string;
  type: TrackType;
  sortOrder: number;
  muted: boolean;
  locked: boolean;
  solo: boolean;
  volume: number;
  clips: EditorClip[];
  color: string;
}

export interface EditorMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface EditorMediaAsset {
  id: string;
  name: string;
  type: 'VIDEO' | 'AUDIO' | 'IMAGE' | 'GRAPHIC' | 'DOCUMENT';
  assetClass?: AssetRecord['assetClass'];
  supportTier?: AssetRecord['supportTier'];
  duration?: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR' | 'INGESTING' | 'OFFLINE';
  thumbnailUrl?: string;
  playbackUrl?: string;
  waveformData?: number[];
  fileExtension?: string;
  fileSizeBytes?: number;
  indexStatus?: MediaIndexStatus;
  ingestMetadata?: EditorMediaIngestMetadata;
  locations?: EditorMediaLocations;
  fingerprint?: EditorMediaFingerprint;
  technicalMetadata?: EditorMediaTechnicalMetadata;
  relinkIdentity?: EditorMediaRelinkIdentity;
  proxyMetadata?: EditorMediaProxyMetadata;
  waveformMetadata?: EditorMediaWaveformMetadata;
  semanticMetadata?: EditorMediaSemanticMetadata;
  references?: AssetRecord['references'];
  streams?: AssetRecord['streams'];
  variants?: AssetRecord['variants'];
  capabilityReport?: AssetRecord['capabilityReport'];
  timebase?: AssetRecord['timebase'];
  colorDescriptor?: AssetRecord['colorDescriptor'];
  graphicDescriptor?: AssetRecord['graphicDescriptor'];
  tags: string[];
  isFavorite: boolean;
}

export interface EditorBin {
  id: string;
  name: string;
  color: string;
  parentId?: string;
  children: EditorBin[];
  assets: EditorMediaAsset[];
  isOpen: boolean;
}

export interface CollaboratorPresence {
  id: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  playheadTime?: number;
}

export interface EditorAIJob {
  id: string;
  type: string;
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  resultSummary?: string;
  cost: number;
  createdAt: string;
  completedAt?: string;
}

export interface EditorTranscriptCue {
  id: string;
  assetId?: string;
  speaker: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence?: number;
  source: 'TRANSCRIPT' | 'SCRIPT';
  speakerId?: string;
  language?: string;
  translation?: string;
  provider?: string;
  linkedScriptLineIds?: string[];
  words?: EditorTranscriptWord[];
}

export interface EditorTranscriptWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  speakerId?: string;
}

export interface EditorTranscriptSpeaker {
  id: string;
  label: string;
  confidence?: number;
  color?: string;
  identified: boolean;
}

export interface EditorScriptDocumentLine {
  id: string;
  lineNumber: number;
  text: string;
  speaker?: string;
  linkedCueIds: string[];
}

export interface EditorScriptDocument {
  id: string;
  title: string;
  source: 'IMPORTED' | 'MANUAL' | 'GENERATED';
  language: string;
  text: string;
  lines: EditorScriptDocumentLine[];
  updatedAt: string;
}

export interface EditorTranscriptionSettings {
  provider: 'local-faster-whisper' | 'cloud-openai-compatible';
  translationProvider: 'local-runtime' | 'cloud-openai-compatible';
  preferredLanguage: 'auto' | string;
  enableDiarization: boolean;
  enableSpeakerIdentification: boolean;
  translateToEnglish: boolean;
}

export interface EditorReviewComment {
  id: string;
  author: string;
  role: string;
  color: string;
  body: string;
  time: number;
  createdAt: string;
  status: 'OPEN' | 'RESOLVED';
}

export interface EditorApproval {
  id: string;
  reviewer: string;
  role: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  notes: string;
  updatedAt: string;
}

export interface EditorPublishJob {
  id: string;
  label: string;
  preset: string;
  destination: string;
  status: 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  createdAt: string;
  updatedAt: string;
  outputSummary?: string;
}

export interface EditorProjectVersionHistoryEntry {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  createdByProfile?: {
    userId?: string;
    displayName: string;
    avatarUrl?: string;
    color?: string;
  };
  description: string;
  snapshotData: unknown;
  isRestorePoint?: boolean;
}

export interface EditorProjectCollabReaction {
  emoji: string;
  userIds: string[];
}

export interface EditorProjectCollabReply {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

export interface EditorProjectCollabComment {
  id: string;
  userId: string;
  userName: string;
  frame: number;
  trackId?: string;
  text: string;
  timestamp: number;
  resolved: boolean;
  replies: EditorProjectCollabReply[];
  reactions: EditorProjectCollabReaction[];
}

export interface EditorProjectCollabActivityEntry {
  id: string;
  userId?: string;
  user: string;
  action: string;
  timestamp: number;
  detail: string;
}

export interface EditorProjectCollabPresenceSnapshot {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  color: string;
  isOnline: boolean;
  cursorFrame: number;
  cursorTrackId: string | null;
  playheadTime?: number;
}

export interface EditorProjectCollaborationState {
  presenceSnapshots: EditorProjectCollabPresenceSnapshot[];
  comments: EditorProjectCollabComment[];
  activityFeed: EditorProjectCollabActivityEntry[];
}

export interface EditorProjectSettings {
  frameRate: number;
  width: number;
  height: number;
  sampleRate: number;
  exportFormat: 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'aiff';
  dropFrame?: boolean;
}

export interface EditorSubtitleCueStyle {
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  position?: 'top' | 'bottom' | 'custom';
  y?: number;
  bgOpacity?: number;
}

export interface EditorSubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  style?: EditorSubtitleCueStyle;
}

export interface EditorSubtitleTrack {
  id: string;
  name: string;
  language: string;
  cues: EditorSubtitleCue[];
}

export interface EditorTitleClipStyle {
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
}

export interface EditorTitleClipPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorTitleClipBackground {
  type: 'none' | 'solid' | 'gradient';
  color?: string;
  gradientColors?: string[];
  opacity?: number;
}

export interface EditorTitleClipAnimation {
  type: 'none' | 'fade-in' | 'slide-up' | 'typewriter' | 'scale-in';
  duration: number;
}

export interface EditorTitleClip {
  id: string;
  templateId?: string;
  text: string;
  style: EditorTitleClipStyle;
  position: EditorTitleClipPosition;
  background?: EditorTitleClipBackground;
  animation?: EditorTitleClipAnimation;
}

export interface EditorProjectEditorialState {
  selectedBinId: string | null;
  sourceAssetId: string | null;
  enabledTrackIds: string[];
  syncLockedTrackIds: string[];
  videoMonitorTrackId: string | null;
  sourceTrackDescriptors: {
    id: string;
    type: 'VIDEO' | 'AUDIO';
    index: number;
  }[];
  trackPatches: {
    sourceTrackId: string;
    sourceTrackType: 'VIDEO' | 'AUDIO';
    sourceTrackIndex: number;
    recordTrackId: string;
    enabled: boolean;
  }[];
}

export interface EditorProjectWorkstationState {
  subtitleTracks: EditorSubtitleTrack[];
  titleClips: EditorTitleClip[];
  trackHeights: Record<string, number>;
  activeWorkspaceId: string;
  composerLayout: 'source-record' | 'full-frame';
  showTrackingInfo: boolean;
  trackingInfoFields: string[];
  clipTextDisplay: 'name' | 'source' | 'media' | 'comments';
  dupeDetectionEnabled: boolean;
  versionHistoryRetentionPreference: 'manual' | 'session';
  versionHistoryCompareMode: 'summary' | 'details';
}

export interface EditorProject {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  template: ProjectTemplate;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  progress: number;
  settings: EditorProjectSettings;
  tracks: EditorTrack[];
  markers: EditorMarker[];
  bins: EditorBin[];
  collaborators: CollaboratorPresence[];
  aiJobs: EditorAIJob[];
  transcript: EditorTranscriptCue[];
  transcriptSpeakers: EditorTranscriptSpeaker[];
  scriptDocument: EditorScriptDocument | null;
  transcriptionSettings: EditorTranscriptionSettings;
  reviewComments: EditorReviewComment[];
  approvals: EditorApproval[];
  publishJobs: EditorPublishJob[];
  watchFolders: EditorWatchFolder[];
  versionHistory?: EditorProjectVersionHistoryEntry[];
  collaboration?: EditorProjectCollaborationState;
  tokenBalance: number;
  editorialState: EditorProjectEditorialState;
  workstationState: EditorProjectWorkstationState;
}

export interface ProjectSummary {
  id: string;
  name: string;
  template: ProjectTemplate;
  tags: string[];
  updatedAt: string;
  durationSeconds: number;
  members: number;
  progress: number;
  tokenBalance: number;
  icon: string;
  color: string;
  description: string;
  resolutionLabel: string;
}

export interface CreateProjectOptions {
  name?: string;
  description?: string;
  template?: ProjectTemplate;
  tags?: string[];
  seedContent?: boolean;
  frameRate?: number;
  width?: number;
  height?: number;
  sampleRate?: number;
  exportFormat?: EditorProjectSettings['exportFormat'];
  dropFrame?: boolean;
  activeWorkspaceId?: string;
  composerLayout?: EditorProjectWorkstationState['composerLayout'];
}

const STORAGE_KEY = 'the-avid.projects.v1';

const TEMPLATE_META: Record<ProjectTemplate, {
  icon: string;
  color: string;
  description: string;
  tags: string[];
  resolution: { width: number; height: number; frameRate: number };
}> = {
  film: {
    icon: 'clapperboard',
    color: '#4f63f5',
    description: 'Narrative timeline with sync sound, selects, and coverage.',
    tags: ['film', 'narrative'],
    resolution: { width: 1920, height: 1080, frameRate: 24 },
  },
  commercial: {
    icon: 'tv',
    color: '#25a865',
    description: 'Fast turnaround campaign edit with social cutdowns.',
    tags: ['commercial', 'brand'],
    resolution: { width: 3840, height: 2160, frameRate: 30 },
  },
  documentary: {
    icon: 'theater',
    color: '#d4873a',
    description: 'Interview-led structure built around transcripts and selects.',
    tags: ['documentary', 'long-form'],
    resolution: { width: 3840, height: 2160, frameRate: 24 },
  },
  sports: {
    icon: 'bolt',
    color: '#c94f84',
    description: 'Action-first highlight package with fast audio transitions.',
    tags: ['sports', 'short'],
    resolution: { width: 1920, height: 1080, frameRate: 60 },
  },
  podcast: {
    icon: 'mic',
    color: '#7c5cfc',
    description: 'Audio-first edit with transcript and chapter extraction.',
    tags: ['audio', 'podcast'],
    resolution: { width: 1920, height: 1080, frameRate: 30 },
  },
  social: {
    icon: 'smartphone',
    color: '#0ea5e9',
    description: 'Vertical short-form editorial workflow tuned for speed.',
    tags: ['social', 'vertical'],
    resolution: { width: 1080, height: 1920, frameRate: 30 },
  },
  news: {
    icon: 'newspaper',
    color: '#ef4444',
    description: 'Broadcast news workflow with NRCS integration, rundown, and playout.',
    tags: ['news', 'broadcast'],
    resolution: { width: 1920, height: 1080, frameRate: 29.97 },
  },
};

const memoryStore = new Map<string, string>();

const memoryStorage = {
  getItem(key: string) {
    return memoryStore.has(key) ? memoryStore.get(key)! : null;
  },
  setItem(key: string, value: string) {
    memoryStore.set(key, value);
  },
  removeItem(key: string) {
    memoryStore.delete(key);
  },
};

function getStorage() {
  const candidate = globalThis as typeof globalThis & {
    localStorage?: {
      getItem: (key: string) => string | null;
      setItem: (key: string, value: string) => void;
      removeItem: (key: string) => void;
    };
  };

  return candidate.localStorage ?? memoryStorage;
}

function cloneValue<T>(value: T): T {
  const candidate = globalThis as typeof globalThis & {
    structuredClone?: <CloneValue>(input: CloneValue) => CloneValue;
  };

  if (typeof candidate.structuredClone === 'function') {
    return candidate.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function generateId(prefix: string): string {
  const candidate = globalThis as typeof globalThis & {
    crypto?: { randomUUID?: () => string };
  };

  if (candidate.crypto && typeof candidate.crypto.randomUUID === 'function') {
    return `${prefix}-${candidate.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWaveform(length = 96, offset = 0): number[] {
  return Array.from({ length }, (_value, index) => {
    const base = Math.sin((index + offset) * 0.18) * 0.38;
    const accent = Math.cos((index + offset) * 0.09) * 0.22;
    return Math.max(0.08, Math.min(0.94, 0.42 + base + accent));
  });
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeAssetName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const NTSC_TIMEBASES = [
  { rate: 23.976, numerator: 24000, denominator: 1001 },
  { rate: 29.97, numerator: 30000, denominator: 1001 },
  { rate: 47.952, numerator: 48000, denominator: 1001 },
  { rate: 59.94, numerator: 60000, denominator: 1001 },
  { rate: 119.88, numerator: 120000, denominator: 1001 },
] as const;

const RAW_VIDEO_EXTENSIONS = new Set(['ari', 'braw', 'cin', 'crm', 'dng', 'exr', 'r3d']);
const SUBTITLE_FILE_EXTENSIONS = new Set(['ass', 'dfxp', 'itt', 'scc', 'srt', 'ssa', 'stl', 'sub', 'ttml', 'vtt']);
const VECTOR_FILE_EXTENSIONS = new Set(['ai', 'eps', 'pdf', 'svg']);
const LAYERED_GRAPHIC_EXTENSIONS = new Set(['afdesign', 'kra', 'psb', 'psd', 'xcf']);
const ALPHA_FRIENDLY_EXTENSIONS = new Set(['exr', 'gif', 'png', 'psb', 'psd', 'svg', 'tif', 'tiff', 'webp']);

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left || 1;
}

function sanitizeRecordFragment(value: string | undefined, fallback: string): string {
  const sanitized = (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return sanitized || fallback;
}

function buildRecordId(prefix: string, value: string | undefined, fallback: string): string {
  return `${prefix}-${sanitizeRecordFragment(value, fallback)}`;
}

function inferAssetExtension(asset: Pick<EditorMediaAsset, 'fileExtension' | 'name'>): string {
  if (asset.fileExtension) {
    return asset.fileExtension.replace(/^\./, '').toLowerCase();
  }

  const match = asset.name.match(/\.([a-z0-9]+)$/i);
  return match ? match[1]!.toLowerCase() : '';
}

function normalizeTimebaseDescriptor(value?: TimebaseDescriptor): TimebaseDescriptor | undefined {
  if (!value) {
    return undefined;
  }

  const numerator = Math.max(1, Math.round(value.numerator));
  const denominator = Math.max(1, Math.round(value.denominator));
  const framesPerSecond = Number.isFinite(value.framesPerSecond)
    ? value.framesPerSecond
    : numerator / denominator;

  return {
    numerator,
    denominator,
    framesPerSecond,
    displayString: value.displayString ?? `${numerator}/${denominator}`,
    dropFrame: Boolean(value.dropFrame),
  };
}

function createTimebaseDescriptor(rate?: number): TimebaseDescriptor | undefined {
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return undefined;
  }

  const ntsc = NTSC_TIMEBASES.find((candidate) => Math.abs(candidate.rate - rate) < 0.0005);
  if (ntsc) {
    return {
      numerator: ntsc.numerator,
      denominator: ntsc.denominator,
      framesPerSecond: ntsc.rate,
      displayString: `${ntsc.numerator}/${ntsc.denominator}`,
      dropFrame: Math.abs(ntsc.rate - 29.97) < 0.0005 || Math.abs(ntsc.rate - 59.94) < 0.0005,
    };
  }

  const scaledNumerator = Math.round(rate * 1000);
  const divisor = greatestCommonDivisor(scaledNumerator, 1000);
  return {
    numerator: scaledNumerator / divisor,
    denominator: 1000 / divisor,
    framesPerSecond: rate,
    displayString: `${scaledNumerator / divisor}/${1000 / divisor}`,
    dropFrame: false,
  };
}

function inferAlphaMode(extension: string, colorDescriptor?: ColorDescriptor, graphicDescriptor?: GraphicDescriptor): MediaAlphaMode {
  if (colorDescriptor?.alphaMode) {
    return colorDescriptor.alphaMode;
  }
  if (graphicDescriptor?.hasAlpha) {
    return 'straight';
  }
  return ALPHA_FRIENDLY_EXTENSIONS.has(extension) ? 'straight' : 'none';
}

function normalizeColorDescriptor(value?: ColorDescriptor): ColorDescriptor | undefined {
  if (!value) {
    return undefined;
  }

  return {
    ...value,
    range: value.range ?? 'unknown',
    alphaMode: value.alphaMode ?? 'unknown',
    hdrMode: value.hdrMode ?? 'unknown',
  };
}

function normalizeGraphicDescriptor(value?: GraphicDescriptor): GraphicDescriptor | undefined {
  if (!value) {
    return undefined;
  }

  return {
    ...value,
    kind: value.kind,
    renderStrategy: value.renderStrategy
      ?? (value.kind === 'bitmap' ? 'direct' : value.kind === 'vector' ? 'rasterize' : 'flatten'),
    flatteningRequired: value.flatteningRequired ?? value.kind !== 'bitmap',
  };
}

function normalizeSideDataDescriptors(value?: ProbeSideDataDescriptor[]): ProbeSideDataDescriptor[] {
  return uniqueList((value ?? []).map((entry) => JSON.stringify({
    type: entry.type,
    metadata: entry.metadata ?? {},
  }))).map((serialized) => JSON.parse(serialized) as ProbeSideDataDescriptor);
}

function normalizeCaptionDescriptors(value?: CaptionDescriptor[]): CaptionDescriptor[] {
  return uniqueList((value ?? []).map((entry) => JSON.stringify({
    kind: entry.kind,
    codec: entry.codec,
    language: entry.language,
    streamIndex: entry.streamIndex,
    serviceName: entry.serviceName,
  }))).map((serialized) => JSON.parse(serialized) as CaptionDescriptor);
}

function inferAssetClass(asset: EditorMediaAsset): MediaAssetClass {
  if (asset.assetClass) {
    return asset.assetClass;
  }

  const extension = inferAssetExtension(asset);

  if (SUBTITLE_FILE_EXTENSIONS.has(extension) || asset.technicalMetadata?.subtitleCodec || asset.streams?.some((stream) => stream.kind === 'subtitle')) {
    return 'subtitle';
  }
  if (LAYERED_GRAPHIC_EXTENSIONS.has(extension) || asset.graphicDescriptor?.kind === 'layered-graphic' || asset.technicalMetadata?.graphicDescriptor?.kind === 'layered-graphic') {
    return 'layered-graphic';
  }
  if (VECTOR_FILE_EXTENSIONS.has(extension) || asset.graphicDescriptor?.kind === 'vector' || asset.technicalMetadata?.graphicDescriptor?.kind === 'vector') {
    return 'vector';
  }

  switch (asset.type) {
    case 'VIDEO':
      return 'video';
    case 'AUDIO':
      return 'audio';
    case 'IMAGE':
      return 'bitmap';
    case 'GRAPHIC':
      return 'vector';
    default:
      return 'document';
  }
}

function inferSupportTier(asset: EditorMediaAsset, assetClass: MediaAssetClass): MediaSupportTier {
  if (asset.supportTier) {
    return asset.supportTier;
  }

  return inferSharedMediaSupportTier({
    assetId: asset.id,
    assetName: asset.name,
    assetClass,
    fileExtension: inferAssetExtension(asset) || undefined,
    container: asset.technicalMetadata?.container,
    containerLongName: asset.technicalMetadata?.containerLongName,
    videoCodec: asset.technicalMetadata?.videoCodec,
    audioCodec: asset.technicalMetadata?.audioCodec,
    subtitleCodec: asset.technicalMetadata?.subtitleCodec,
    audioChannels: asset.technicalMetadata?.audioChannels,
    audioChannelLayout: asset.technicalMetadata?.audioChannelLayout,
    timebase: normalizeTimebaseDescriptor(asset.technicalMetadata?.timebase),
    averageFrameRate: normalizeTimebaseDescriptor(asset.technicalMetadata?.averageFrameRate),
    colorDescriptor: normalizeColorDescriptor(asset.technicalMetadata?.colorDescriptor),
    graphicDescriptor: normalizeGraphicDescriptor(asset.graphicDescriptor ?? asset.technicalMetadata?.graphicDescriptor),
    streams: (asset.streams ?? []).map((stream) => ({
      ...stream,
      disposition: stream.disposition ?? [],
      timebase: normalizeTimebaseDescriptor(stream.timebase),
      frameRate: normalizeTimebaseDescriptor(stream.frameRate),
      averageFrameRate: normalizeTimebaseDescriptor(stream.averageFrameRate),
      colorDescriptor: normalizeColorDescriptor(stream.colorDescriptor),
      sideData: normalizeSideDataDescriptors(stream.sideData),
      captions: normalizeCaptionDescriptors(stream.captions),
    })),
    variants: (asset.variants ?? []).map((variant) => ({
      id: variant.id,
      purpose: variant.purpose,
      availability: variant.availability,
      supportTier: variant.supportTier,
      container: variant.container,
      videoCodec: variant.videoCodec,
      audioCodec: variant.audioCodec,
    })),
  });
}

function inferColorDescriptor(asset: EditorMediaAsset, assetClass: MediaAssetClass): ColorDescriptor | undefined {
  const extension = inferAssetExtension(asset);
  const explicit = normalizeColorDescriptor(
    asset.colorDescriptor
    ?? asset.technicalMetadata?.colorDescriptor
    ?? asset.streams?.find((stream) => stream.kind === 'video')?.colorDescriptor,
  );

  if (explicit) {
    return {
      ...explicit,
      alphaMode: inferAlphaMode(extension, explicit, asset.graphicDescriptor ?? asset.technicalMetadata?.graphicDescriptor),
    };
  }

  if (assetClass !== 'video' && assetClass !== 'bitmap' && assetClass !== 'vector' && assetClass !== 'layered-graphic') {
    return undefined;
  }

  return {
    colorSpace: assetClass === 'video' ? undefined : 'sRGB',
    range: 'unknown',
    alphaMode: inferAlphaMode(extension, undefined, asset.graphicDescriptor ?? asset.technicalMetadata?.graphicDescriptor),
    hdrMode: 'unknown',
  };
}

function inferGraphicDescriptor(asset: EditorMediaAsset, assetClass: MediaAssetClass): GraphicDescriptor | undefined {
  const explicit = normalizeGraphicDescriptor(asset.graphicDescriptor ?? asset.technicalMetadata?.graphicDescriptor);
  if (explicit) {
    return explicit;
  }

  if (assetClass !== 'bitmap' && assetClass !== 'vector' && assetClass !== 'layered-graphic') {
    return undefined;
  }

  const extension = inferAssetExtension(asset);
  return {
    kind: assetClass,
    sourceFormat: extension || undefined,
    canvasWidth: asset.technicalMetadata?.width,
    canvasHeight: asset.technicalMetadata?.height,
    hasAlpha: inferAlphaMode(extension) !== 'none',
    flatteningRequired: assetClass !== 'bitmap',
    renderStrategy: assetClass === 'bitmap' ? 'direct' : assetClass === 'vector' ? 'rasterize' : 'flatten',
  };
}

function inferTimebase(asset: EditorMediaAsset): TimebaseDescriptor | undefined {
  return normalizeTimebaseDescriptor(asset.timebase ?? asset.technicalMetadata?.timebase ?? createTimebaseDescriptor(asset.technicalMetadata?.frameRate));
}

function normalizeMediaReference(reference: MediaReference): MediaReference {
  const locator = reference.locator
    ?? (reference.url?.startsWith('http://') || reference.url?.startsWith('https://')
      ? 'http-url'
      : reference.url?.startsWith('file://')
      ? 'file-url'
      : reference.relativePath
      ? 'package-relative-path'
      : 'absolute-path');

  return {
    ...reference,
    id: reference.id || buildRecordId('ref', `${reference.role}-${reference.fileName ?? reference.path ?? reference.url}`, 'media'),
    locator,
    isPreferred: Boolean(reference.isPreferred),
  };
}

function pushMediaReference(target: MediaReference[], candidate?: MediaReference): void {
  if (!candidate) {
    return;
  }

  const normalized = normalizeMediaReference(candidate);
  const key = `${normalized.role}:${normalized.path ?? ''}:${normalized.relativePath ?? ''}:${normalized.url ?? ''}`;
  const existingIndex = target.findIndex((value) => `${value.role}:${value.path ?? ''}:${value.relativePath ?? ''}:${value.url ?? ''}` === key);

  if (existingIndex >= 0) {
    target[existingIndex] = {
      ...target[existingIndex],
      ...normalized,
      isPreferred: normalized.isPreferred || target[existingIndex]!.isPreferred,
    };
    return;
  }

  target.push(normalized);
}

function buildMediaReferences(asset: EditorMediaAsset, assetClass: MediaAssetClass, playbackUrl: string | undefined): MediaReference[] {
  const extension = inferAssetExtension(asset);
  const references = (asset.references ?? []).map((reference) => normalizeMediaReference({ ...reference }));
  const checksum = asset.fingerprint?.digest;
  const sizeBytes = asset.fileSizeBytes ?? asset.fingerprint?.sizeBytes;
  const fileName = asset.ingestMetadata?.originalFileName ?? asset.name;
  const updatedAt = asset.ingestMetadata?.importedAt;

  pushMediaReference(references, asset.locations?.originalPath
    ? {
        id: buildRecordId('ref', asset.locations.originalPath, 'original'),
        role: 'original',
        locator: 'absolute-path',
        path: asset.locations.originalPath,
        fileName,
        fileExtension: extension || undefined,
        checksum,
        sizeBytes,
        container: asset.technicalMetadata?.container,
        updatedAt,
      }
    : undefined);

  pushMediaReference(references, asset.locations?.managedPath
    ? {
        id: buildRecordId('ref', asset.locations.managedPath, 'managed'),
        role: 'managed',
        locator: asset.locations.relativeManagedPath ? 'package-relative-path' : 'absolute-path',
        path: asset.locations.managedPath,
        relativePath: asset.locations.relativeManagedPath,
        fileName,
        fileExtension: extension || undefined,
        checksum,
        sizeBytes,
        container: asset.technicalMetadata?.container,
        updatedAt,
      }
    : undefined);

  pushMediaReference(references, playbackUrl
    ? {
        id: buildRecordId('ref', playbackUrl, 'playback'),
        role: 'playback',
        locator: playbackUrl.startsWith('http://') || playbackUrl.startsWith('https://') ? 'http-url' : 'file-url',
        url: playbackUrl,
        fileName,
        fileExtension: extension || undefined,
        container: asset.proxyMetadata?.status === 'READY' ? asset.proxyMetadata.codec : asset.technicalMetadata?.container,
        isPreferred: asset.proxyMetadata?.status !== 'READY',
        updatedAt,
      }
    : undefined);

  pushMediaReference(references, asset.proxyMetadata?.filePath || asset.proxyMetadata?.playbackUrl
    ? {
        id: buildRecordId('ref', asset.proxyMetadata.filePath ?? asset.proxyMetadata.playbackUrl, 'proxy'),
        role: 'proxy',
        locator: asset.proxyMetadata.filePath
          ? 'absolute-path'
          : asset.proxyMetadata.playbackUrl?.startsWith('http://') || asset.proxyMetadata.playbackUrl?.startsWith('https://')
          ? 'http-url'
          : 'file-url',
        path: asset.proxyMetadata.filePath,
        url: asset.proxyMetadata.playbackUrl,
        fileName,
        fileExtension: extension || undefined,
        container: asset.proxyMetadata.codec,
        isPreferred: asset.proxyMetadata.status === 'READY',
        updatedAt: asset.proxyMetadata.updatedAt ?? updatedAt,
      }
    : undefined);

  if (assetClass === 'subtitle') {
    pushMediaReference(references, asset.locations?.originalPath
      ? {
          id: buildRecordId('ref', `${asset.locations.originalPath}-subtitle`, 'subtitle'),
          role: 'subtitle-sidecar',
          locator: 'absolute-path',
          path: asset.locations.originalPath,
          fileName,
          fileExtension: extension || undefined,
          checksum,
          sizeBytes,
          updatedAt,
        }
      : undefined);
  }

  if ((assetClass === 'vector' || assetClass === 'layered-graphic') && asset.locations?.originalPath) {
    pushMediaReference(references, {
      id: buildRecordId('ref', `${asset.locations.originalPath}-graphic`, 'graphic'),
      role: 'graphic-source',
      locator: 'absolute-path',
      path: asset.locations.originalPath,
      fileName,
      fileExtension: extension || undefined,
      checksum,
      sizeBytes,
      updatedAt,
    });
  }

  return references;
}

function normalizeStreamDescriptor(stream: StreamDescriptor): StreamDescriptor {
  return {
    ...stream,
    id: stream.id || buildRecordId('stream', `${stream.kind}-${stream.index}`, 'primary'),
    disposition: uniqueList(stream.disposition ?? []),
    timebase: normalizeTimebaseDescriptor(stream.timebase),
    frameRate: normalizeTimebaseDescriptor(stream.frameRate),
    averageFrameRate: normalizeTimebaseDescriptor(stream.averageFrameRate),
    colorDescriptor: normalizeColorDescriptor(stream.colorDescriptor),
    sideData: normalizeSideDataDescriptors(stream.sideData),
    captions: normalizeCaptionDescriptors(stream.captions),
  };
}

function pushStreamDescriptor(target: StreamDescriptor[], candidate?: StreamDescriptor): void {
  if (!candidate) {
    return;
  }

  const normalized = normalizeStreamDescriptor(candidate);
  const existingIndex = target.findIndex((stream) => stream.kind === normalized.kind && stream.index === normalized.index);
  if (existingIndex >= 0) {
    target[existingIndex] = {
      ...target[existingIndex],
      ...normalized,
      disposition: uniqueList([
        ...(target[existingIndex]!.disposition ?? []),
        ...(normalized.disposition ?? []),
      ]),
    };
    return;
  }

  target.push(normalized);
}

function buildStreamDescriptors(
  asset: EditorMediaAsset,
  assetClass: MediaAssetClass,
  timebase: TimebaseDescriptor | undefined,
  colorDescriptor: ColorDescriptor | undefined,
): StreamDescriptor[] {
  const streams = (asset.streams ?? []).map((stream) => normalizeStreamDescriptor({ ...stream }));
  const technicalMetadata = asset.technicalMetadata;

  pushStreamDescriptor(streams, (assetClass === 'video' || assetClass === 'bitmap' || assetClass === 'vector' || assetClass === 'layered-graphic'
    || technicalMetadata?.videoCodec || technicalMetadata?.width || technicalMetadata?.height)
    ? {
        id: buildRecordId('stream', `${asset.id}-video-0`, 'video'),
        index: 0,
        kind: 'video',
        codec: technicalMetadata?.videoCodec ?? (assetClass === 'bitmap' || assetClass === 'vector' || assetClass === 'layered-graphic' ? inferAssetExtension(asset) || undefined : undefined),
        width: technicalMetadata?.width,
        height: technicalMetadata?.height,
        durationSeconds: technicalMetadata?.durationSeconds ?? asset.duration,
        bitRate: technicalMetadata?.bitRate,
        timebase,
        frameRate: normalizeTimebaseDescriptor(technicalMetadata?.timebase ?? timebase),
        averageFrameRate: normalizeTimebaseDescriptor(technicalMetadata?.averageFrameRate),
        reelName: technicalMetadata?.reelName ?? asset.relinkIdentity?.reelName,
        timecodeStart: technicalMetadata?.timecodeStart ?? asset.relinkIdentity?.sourceTimecodeStart,
        audioChannelLayout: undefined,
        colorDescriptor,
        sideData: normalizeSideDataDescriptors(technicalMetadata?.sideData),
        captions: normalizeCaptionDescriptors(technicalMetadata?.captions),
      }
    : undefined);

  pushStreamDescriptor(streams, (assetClass === 'audio' || technicalMetadata?.audioCodec || technicalMetadata?.audioChannels || technicalMetadata?.sampleRate)
    ? {
        id: buildRecordId('stream', `${asset.id}-audio-0`, 'audio'),
        index: streams.some((stream) => stream.kind === 'video') ? 1 : 0,
        kind: 'audio',
        codec: technicalMetadata?.audioCodec,
        durationSeconds: technicalMetadata?.durationSeconds ?? asset.duration,
        bitRate: technicalMetadata?.bitRate,
        audioChannels: technicalMetadata?.audioChannels,
        audioChannelLayout: technicalMetadata?.audioChannelLayout,
        sampleRate: technicalMetadata?.sampleRate,
        sampleFormat: undefined,
        reelName: technicalMetadata?.reelName ?? asset.relinkIdentity?.reelName,
        timecodeStart: technicalMetadata?.timecodeStart ?? asset.relinkIdentity?.sourceTimecodeStart,
        sideData: normalizeSideDataDescriptors(technicalMetadata?.sideData),
        captions: normalizeCaptionDescriptors(technicalMetadata?.captions),
      }
    : undefined);

  pushStreamDescriptor(streams, (assetClass === 'subtitle' || technicalMetadata?.subtitleCodec || (technicalMetadata?.subtitleLanguages?.length ?? 0) > 0)
    ? {
        id: buildRecordId('stream', `${asset.id}-subtitle-0`, 'subtitle'),
        index: streams.length,
        kind: 'subtitle',
        codec: technicalMetadata?.subtitleCodec ?? (inferAssetExtension(asset) || undefined),
        language: technicalMetadata?.subtitleLanguages?.[0],
        durationSeconds: technicalMetadata?.durationSeconds ?? asset.duration,
        timebase,
        captions: normalizeCaptionDescriptors(
          technicalMetadata?.captions?.length
            ? technicalMetadata.captions
            : [{
                kind: 'sidecar',
                codec: technicalMetadata?.subtitleCodec ?? (inferAssetExtension(asset) || undefined),
                language: technicalMetadata?.subtitleLanguages?.[0],
                streamIndex: streams.length,
              }],
        ),
      }
    : undefined);

  return streams;
}

function normalizeVariantRecord(variant: VariantRecord): VariantRecord {
  return {
    ...variant,
    id: variant.id || buildRecordId('variant', `${variant.purpose}-${variant.name}`, 'primary'),
    availability: variant.availability,
    supportTier: variant.supportTier,
    referenceIds: uniqueList(variant.referenceIds ?? []),
    streamIds: uniqueList(variant.streamIds ?? []),
    colorDescriptor: normalizeColorDescriptor(variant.colorDescriptor),
  };
}

function pushVariantRecord(target: VariantRecord[], candidate?: VariantRecord): void {
  if (!candidate) {
    return;
  }

  const normalized = normalizeVariantRecord(candidate);
  const key = `${normalized.purpose}:${normalized.referenceIds.join(',')}:${normalized.streamIds.join(',')}`;
  const existingIndex = target.findIndex((variant) => `${variant.purpose}:${variant.referenceIds.join(',')}:${variant.streamIds.join(',')}` === key);

  if (existingIndex >= 0) {
    target[existingIndex] = {
      ...target[existingIndex],
      ...normalized,
      referenceIds: uniqueList([
        ...target[existingIndex]!.referenceIds,
        ...normalized.referenceIds,
      ]),
      streamIds: uniqueList([
        ...target[existingIndex]!.streamIds,
        ...normalized.streamIds,
      ]),
    };
    return;
  }

  target.push(normalized);
}

function resolveVariantAvailability(asset: EditorMediaAsset, purpose: VariantPurpose): VariantAvailability {
  if (purpose === 'proxy' || purpose === 'playback') {
    if (asset.proxyMetadata?.status === 'READY') {
      return 'ready';
    }
    if (asset.proxyMetadata?.status === 'QUEUED' || asset.proxyMetadata?.status === 'NOT_REQUESTED') {
      return 'pending';
    }
    if (asset.proxyMetadata?.status === 'FAILED') {
      return 'failed';
    }
  }

  if (asset.status === 'ERROR' || asset.status === 'OFFLINE') {
    return 'missing';
  }

  return 'ready';
}

function buildVariantRecords(
  asset: EditorMediaAsset,
  assetClass: MediaAssetClass,
  supportTier: MediaSupportTier,
  references: MediaReference[],
  streams: StreamDescriptor[],
  colorDescriptor: ColorDescriptor | undefined,
): VariantRecord[] {
  const variants = (asset.variants ?? []).map((variant) => normalizeVariantRecord({ ...variant }));
  const streamIds = streams.map((stream) => stream.id);
  const sourceReferenceIds = references
    .filter((reference) => reference.role === 'original' || reference.role === 'graphic-source' || reference.role === 'subtitle-sidecar')
    .map((reference) => reference.id);
  const managedReferenceIds = references.filter((reference) => reference.role === 'managed').map((reference) => reference.id);
  const proxyReferenceIds = references.filter((reference) => reference.role === 'proxy').map((reference) => reference.id);
  const playbackReferenceIds = references.filter((reference) => reference.role === 'playback').map((reference) => reference.id);

  pushVariantRecord(variants, sourceReferenceIds.length > 0
    ? {
        id: buildRecordId('variant', `${asset.id}-source`, 'source'),
        name: 'Source',
        purpose: assetClass === 'subtitle' ? 'subtitle' : 'source',
        availability: resolveVariantAvailability(asset, assetClass === 'subtitle' ? 'subtitle' : 'source'),
        supportTier,
        referenceIds: sourceReferenceIds,
        streamIds,
        container: asset.technicalMetadata?.container,
        videoCodec: asset.technicalMetadata?.videoCodec,
        audioCodec: asset.technicalMetadata?.audioCodec,
        width: asset.technicalMetadata?.width,
        height: asset.technicalMetadata?.height,
        frameRate: asset.technicalMetadata?.frameRate,
        colorDescriptor,
      }
    : undefined);

  pushVariantRecord(variants, managedReferenceIds.length > 0
    ? {
        id: buildRecordId('variant', `${asset.id}-managed`, 'managed'),
        name: 'Managed',
        purpose: 'managed',
        availability: resolveVariantAvailability(asset, 'managed'),
        supportTier,
        referenceIds: managedReferenceIds,
        streamIds,
        container: asset.technicalMetadata?.container,
        videoCodec: asset.technicalMetadata?.videoCodec,
        audioCodec: asset.technicalMetadata?.audioCodec,
        width: asset.technicalMetadata?.width,
        height: asset.technicalMetadata?.height,
        frameRate: asset.technicalMetadata?.frameRate,
        colorDescriptor,
      }
    : undefined);

  pushVariantRecord(variants, proxyReferenceIds.length > 0
    ? {
        id: buildRecordId('variant', `${asset.id}-proxy`, 'proxy'),
        name: 'Proxy',
        purpose: assetClass === 'vector' || assetClass === 'layered-graphic' ? 'graphic-render' : 'proxy',
        availability: resolveVariantAvailability(asset, 'proxy'),
        supportTier: assetClass === 'vector' || assetClass === 'layered-graphic' || supportTier === 'adapter'
          ? 'adapter'
          : 'normalized',
        referenceIds: proxyReferenceIds,
        streamIds,
        container: asset.proxyMetadata?.codec ?? asset.technicalMetadata?.container,
        videoCodec: asset.proxyMetadata?.codec ?? asset.technicalMetadata?.videoCodec,
        audioCodec: asset.technicalMetadata?.audioCodec,
        width: asset.proxyMetadata?.width ?? asset.technicalMetadata?.width,
        height: asset.proxyMetadata?.height ?? asset.technicalMetadata?.height,
        frameRate: asset.technicalMetadata?.frameRate,
        colorDescriptor,
        error: asset.proxyMetadata?.error,
      }
    : undefined);

  pushVariantRecord(variants, playbackReferenceIds.length > 0
    ? {
        id: buildRecordId('variant', `${asset.id}-playback`, 'playback'),
        name: 'Playback',
        purpose: 'playback',
        availability: resolveVariantAvailability(asset, 'playback'),
        supportTier: proxyReferenceIds.length > 0 && supportTier !== 'adapter' ? 'normalized' : supportTier,
        referenceIds: playbackReferenceIds,
        streamIds,
        container: asset.proxyMetadata?.status === 'READY' ? asset.proxyMetadata.codec : asset.technicalMetadata?.container,
        videoCodec: asset.proxyMetadata?.status === 'READY' ? asset.proxyMetadata.codec : asset.technicalMetadata?.videoCodec,
        audioCodec: asset.technicalMetadata?.audioCodec,
        width: asset.proxyMetadata?.width ?? asset.technicalMetadata?.width,
        height: asset.proxyMetadata?.height ?? asset.technicalMetadata?.height,
        frameRate: asset.technicalMetadata?.frameRate,
        colorDescriptor,
      }
    : undefined);

  return variants;
}

function buildSharedCapabilityInput(
  asset: EditorMediaAsset,
  assetClass: MediaAssetClass,
  supportTier: MediaSupportTier,
  variants: VariantRecord[],
  streams: StreamDescriptor[],
): SharedAssetCapabilityInput {
  return {
    assetId: asset.id,
    assetName: asset.name,
    assetClass,
    supportTier,
    fileExtension: inferAssetExtension(asset) || undefined,
    mimeType: asset.references?.find((reference) => reference.mimeType)?.mimeType,
    container: asset.technicalMetadata?.container,
    containerLongName: asset.technicalMetadata?.containerLongName,
    videoCodec: asset.technicalMetadata?.videoCodec,
    audioCodec: asset.technicalMetadata?.audioCodec,
    subtitleCodec: asset.technicalMetadata?.subtitleCodec,
    audioChannels: asset.technicalMetadata?.audioChannels,
    audioChannelLayout: asset.technicalMetadata?.audioChannelLayout,
    timebase: normalizeTimebaseDescriptor(asset.technicalMetadata?.timebase ?? asset.timebase),
    averageFrameRate: normalizeTimebaseDescriptor(asset.technicalMetadata?.averageFrameRate),
    colorDescriptor: normalizeColorDescriptor(asset.colorDescriptor ?? asset.technicalMetadata?.colorDescriptor),
    graphicDescriptor: normalizeGraphicDescriptor(asset.graphicDescriptor ?? asset.technicalMetadata?.graphicDescriptor),
    streams: streams.map((stream) => ({
      ...stream,
      disposition: stream.disposition ?? [],
      timebase: normalizeTimebaseDescriptor(stream.timebase),
      frameRate: normalizeTimebaseDescriptor(stream.frameRate),
      averageFrameRate: normalizeTimebaseDescriptor(stream.averageFrameRate),
      colorDescriptor: normalizeColorDescriptor(stream.colorDescriptor),
      sideData: normalizeSideDataDescriptors(stream.sideData),
      captions: normalizeCaptionDescriptors(stream.captions),
    })),
    variants: variants.map((variant) => ({
      id: variant.id,
      purpose: variant.purpose,
      availability: variant.availability,
      supportTier: variant.supportTier,
      container: variant.container,
      videoCodec: variant.videoCodec,
      audioCodec: variant.audioCodec,
    })),
  };
}

function buildCapabilityReport(
  asset: EditorMediaAsset,
  assetClass: MediaAssetClass,
  supportTier: MediaSupportTier,
  variants: VariantRecord[],
  streams: StreamDescriptor[],
): CapabilityReport {
  const report = createAssetCapabilityReport(
    buildSharedCapabilityInput(asset, assetClass, supportTier, variants, streams),
    {
      primarySurface: asset.capabilityReport?.primarySurface ?? 'desktop',
      updatedAt: asset.capabilityReport?.updatedAt ?? asset.ingestMetadata?.importedAt,
    },
  );

  const explicitSurfaceMap = new Map((asset.capabilityReport?.surfaces ?? []).map((surface) => [surface.surface, surface]));
  const surfaces: CapabilitySurfaceReport[] = report.surfaces.map((surface) => {
    const explicit = explicitSurfaceMap.get(surface.surface);
    if (!explicit) {
      return {
        surface: surface.surface,
        disposition: surface.disposition,
        supportTier: surface.supportTier,
        preferredVariantId: surface.preferredVariantId,
        reasons: uniqueList(surface.reasons),
      };
    }

    return {
      surface: explicit.surface,
      disposition: explicit.disposition,
      supportTier: explicit.supportTier,
      preferredVariantId: explicit.preferredVariantId ?? surface.preferredVariantId,
      reasons: uniqueList([
        ...surface.reasons,
        ...(explicit.reasons ?? []),
      ]),
    };
  });

  return {
    primarySurface: report.primarySurface,
    primaryDisposition: asset.capabilityReport?.primaryDisposition ?? report.primaryDisposition,
    sourceSupportTier: asset.capabilityReport?.sourceSupportTier ?? report.sourceSupportTier,
    preferredVariantId: asset.capabilityReport?.preferredVariantId ?? report.preferredVariantId,
    surfaces,
    issues: uniqueList([
      ...report.issues,
      ...(asset.capabilityReport?.issues ?? []),
    ]),
    updatedAt: report.updatedAt,
  };
}

function normalizeMediaAsset(asset: EditorMediaAsset): EditorMediaAsset {
  const waveformPeaks = asset.waveformMetadata?.peaks ?? asset.waveformData ?? [];
  const playbackUrl = asset.proxyMetadata?.status === 'READY'
    ? asset.proxyMetadata.playbackUrl ?? asset.playbackUrl ?? asset.locations?.playbackUrl
    : asset.playbackUrl ?? asset.locations?.playbackUrl;
  const fileNameStem = asset.name.replace(/\.[a-z0-9]+$/i, '');
  const assetClass = inferAssetClass(asset);
  const supportTier = inferSupportTier(asset, assetClass);
  const timebase = inferTimebase(asset);
  const graphicDescriptor = inferGraphicDescriptor(asset, assetClass);
  const colorDescriptor = inferColorDescriptor(asset, assetClass);
  const technicalMetadata = asset.technicalMetadata
    ? {
        ...asset.technicalMetadata,
        durationSeconds: asset.technicalMetadata.durationSeconds ?? asset.duration,
        timebase: normalizeTimebaseDescriptor(asset.technicalMetadata.timebase ?? timebase),
        averageFrameRate: normalizeTimebaseDescriptor(asset.technicalMetadata.averageFrameRate),
        colorDescriptor: normalizeColorDescriptor(asset.technicalMetadata.colorDescriptor ?? colorDescriptor),
        graphicDescriptor: normalizeGraphicDescriptor(asset.technicalMetadata.graphicDescriptor ?? graphicDescriptor),
        subtitleLanguages: uniqueList(asset.technicalMetadata.subtitleLanguages ?? []),
        sideData: normalizeSideDataDescriptors(asset.technicalMetadata.sideData),
        captions: normalizeCaptionDescriptors(asset.technicalMetadata.captions),
        formatTags: { ...(asset.technicalMetadata.formatTags ?? {}) },
        isVariableFrameRate: asset.technicalMetadata.isVariableFrameRate
          ?? (asset.technicalMetadata.frameRate !== undefined
            && asset.technicalMetadata.averageFrameRate?.framesPerSecond !== undefined
            ? Math.abs(asset.technicalMetadata.frameRate - asset.technicalMetadata.averageFrameRate.framesPerSecond) > 0.01
            : asset.technicalMetadata.timebase?.framesPerSecond !== undefined
            && asset.technicalMetadata.averageFrameRate?.framesPerSecond !== undefined
            ? Math.abs(asset.technicalMetadata.timebase.framesPerSecond - asset.technicalMetadata.averageFrameRate.framesPerSecond) > 0.01
            : undefined),
      }
    : asset.duration || timebase || colorDescriptor || graphicDescriptor
    ? {
        durationSeconds: asset.duration,
        timebase,
        colorDescriptor,
        graphicDescriptor,
        sideData: [],
        captions: [],
        formatTags: {},
      }
    : undefined;
  const references = buildMediaReferences(asset, assetClass, playbackUrl);
  const streams = buildStreamDescriptors(asset, assetClass, timebase, colorDescriptor);
  const variants = buildVariantRecords(asset, assetClass, supportTier, references, streams, colorDescriptor);
  const capabilityReport = buildCapabilityReport(asset, assetClass, supportTier, variants, streams);

  return {
    ...asset,
    assetClass,
    supportTier,
    duration: asset.duration ?? technicalMetadata?.durationSeconds,
    playbackUrl,
    waveformData: [...waveformPeaks],
    fileExtension: asset.fileExtension ?? (inferAssetExtension(asset) || undefined),
    fileSizeBytes: asset.fileSizeBytes ?? asset.fingerprint?.sizeBytes,
    indexStatus: asset.indexStatus ?? (
      asset.status === 'ERROR'
        ? 'ERROR'
        : asset.fingerprint || asset.relinkIdentity || asset.ingestMetadata
        ? 'READY'
        : 'UNSCANNED'
    ),
    tags: uniqueList([
      ...(asset.tags ?? []),
      ...(asset.semanticMetadata?.tags ?? []),
    ]),
    isFavorite: Boolean(asset.isFavorite),
    ingestMetadata: asset.ingestMetadata
      ? { ...asset.ingestMetadata }
      : undefined,
    locations: asset.locations
      ? {
          ...asset.locations,
          playbackUrl: asset.locations.playbackUrl ?? playbackUrl,
          pathHistory: uniqueList([
            ...(asset.locations.pathHistory ?? []),
            asset.locations.originalPath ?? '',
            asset.locations.managedPath ?? '',
          ]),
        }
      : undefined,
    fingerprint: asset.fingerprint ? { ...asset.fingerprint } : undefined,
    technicalMetadata,
    relinkIdentity: asset.relinkIdentity
      ? {
          ...asset.relinkIdentity,
          normalizedName: asset.relinkIdentity.normalizedName || normalizeAssetName(asset.name),
          sourceFileStem: asset.relinkIdentity.sourceFileStem || fileNameStem,
          lastKnownPaths: uniqueList([
            ...(asset.relinkIdentity.lastKnownPaths ?? []),
            asset.locations?.originalPath ?? '',
            asset.locations?.managedPath ?? '',
          ]),
        }
      : undefined,
    proxyMetadata: asset.proxyMetadata
      ? { ...asset.proxyMetadata }
      : undefined,
    waveformMetadata: asset.waveformMetadata
      ? {
          ...asset.waveformMetadata,
          peaks: [...asset.waveformMetadata.peaks],
        }
      : waveformPeaks.length > 0
      ? {
          status: 'READY',
          peaks: [...waveformPeaks],
          sampleCount: waveformPeaks.length,
        }
      : undefined,
    semanticMetadata: asset.semanticMetadata
      ? {
          ...asset.semanticMetadata,
          tags: uniqueList(asset.semanticMetadata.tags ?? []),
          people: uniqueList(asset.semanticMetadata.people ?? []),
          locations: uniqueList(asset.semanticMetadata.locations ?? []),
          scenes: uniqueList(asset.semanticMetadata.scenes ?? []),
        }
      : undefined,
    references,
    streams,
    variants,
    capabilityReport,
    timebase,
    colorDescriptor,
    graphicDescriptor,
  };
}

function normalizeBins(bins: EditorBin[]): EditorBin[] {
  return bins.map((bin) => ({
    ...bin,
    children: normalizeBins(bin.children ?? []),
    assets: (bin.assets ?? []).map(normalizeMediaAsset),
    isOpen: Boolean(bin.isOpen),
  }));
}

export function hydrateMediaAsset(asset: EditorMediaAsset): EditorMediaAsset {
  return normalizeMediaAsset(asset);
}

function createTemplateTracks(template: ProjectTemplate): EditorTrack[] {
  const videoColor = TEMPLATE_META[template].color;
  const musicTrackName = template === 'podcast' ? 'Music Bed' : 'A2';
  const primaryAudioLabel = template === 'podcast' ? 'VO' : 'A1';

  return [
    {
      id: generateId('track'),
      name: 'V1',
      type: 'VIDEO',
      sortOrder: 0,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      color: videoColor,
      clips: [],
    },
    {
      id: generateId('track'),
      name: 'V2',
      type: 'VIDEO',
      sortOrder: 1,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      color: '#818cf8',
      clips: [],
    },
    {
      id: generateId('track'),
      name: primaryAudioLabel,
      type: 'AUDIO',
      sortOrder: 2,
      muted: false,
      locked: false,
      solo: false,
      volume: 0.85,
      color: '#2bb672',
      clips: [],
    },
    {
      id: generateId('track'),
      name: musicTrackName,
      type: 'AUDIO',
      sortOrder: 3,
      muted: false,
      locked: false,
      solo: false,
      volume: 0.7,
      color: '#4ade80',
      clips: [],
    },
    {
      id: generateId('track'),
      name: 'FX',
      type: 'EFFECT',
      sortOrder: 4,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      color: '#e8943a',
      clips: [],
    },
    {
      id: generateId('track'),
      name: 'SUB',
      type: 'SUBTITLE',
      sortOrder: 5,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      color: '#6bc5e3',
      clips: [],
    },
  ];
}

function createSeedMediaAsset(overrides: Partial<EditorMediaAsset> & Pick<EditorMediaAsset, 'name' | 'type'>): EditorMediaAsset {
  const fileName = overrides.name;
  const fileExtension = overrides.fileExtension ?? inferAssetExtension({ fileExtension: overrides.fileExtension, name: fileName });
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '');
  const importedAt = overrides.ingestMetadata?.importedAt ?? '2026-01-10T12:00:00.000Z';
  const originalPath = overrides.locations?.originalPath ?? `/seed-media/originals/${sanitizeRecordFragment(fileName, 'asset')}`;
  const managedPath = overrides.locations?.managedPath ?? `/seed-media/managed/${sanitizeRecordFragment(fileName, 'asset')}`;
  const playbackUrl = overrides.playbackUrl
    ?? overrides.proxyMetadata?.playbackUrl
    ?? overrides.locations?.playbackUrl
    ?? `file://${managedPath}`;
  const technicalMetadata = overrides.technicalMetadata ?? {};
  const relinkPaths = uniqueList([
    originalPath,
    managedPath,
    ...(overrides.relinkIdentity?.lastKnownPaths ?? []),
  ]);

  return normalizeMediaAsset({
    id: overrides.id ?? generateId('asset'),
    status: overrides.status ?? 'READY',
    tags: overrides.tags ?? [],
    isFavorite: overrides.isFavorite ?? false,
    fileExtension,
    ingestMetadata: overrides.ingestMetadata ?? {
      importedAt,
      storageMode: 'COPY',
      importedFileName: fileName,
      originalFileName: fileName,
    },
    locations: overrides.locations ?? {
      originalPath,
      managedPath,
      relativeManagedPath: `managed/${sanitizeRecordFragment(fileName, 'asset')}`,
      playbackUrl,
      pathHistory: relinkPaths,
    },
    relinkIdentity: overrides.relinkIdentity ?? {
      assetKey: `${normalizeAssetName(stem)}:${fileExtension}`,
      normalizedName: normalizeAssetName(stem),
      sourceFileStem: stem,
      lastKnownPaths: relinkPaths,
      reelName: technicalMetadata.reelName,
      sourceTimecodeStart: technicalMetadata.timecodeStart,
      frameRate: technicalMetadata.frameRate,
      durationSeconds: technicalMetadata.durationSeconds ?? overrides.duration,
    },
    technicalMetadata,
    playbackUrl,
    ...overrides,
  });
}

function createTemplateBins(template: ProjectTemplate): EditorBin[] {
  const rootColor = TEMPLATE_META[template].color;
  const rushesAssets: EditorMediaAsset[] = [
    createSeedMediaAsset({
      name: 'Scene 01 - Take 01.mxf',
      type: 'VIDEO',
      duration: 45.2,
      tags: ['dialogue', 'native'],
      isFavorite: true,
      technicalMetadata: {
        container: 'mxf',
        videoCodec: 'xdcamhd422',
        audioCodec: 'pcm_s24le',
        durationSeconds: 45.2,
        frameRate: 23.976,
        width: 1920,
        height: 1080,
        audioChannels: 4,
        audioChannelLayout: 'quad',
        sampleRate: 48000,
        bitRate: 50000000,
        timecodeStart: '01:00:00:00',
        reelName: 'A001',
        colorDescriptor: {
          colorSpace: 'Rec.709',
          primaries: 'bt709',
          transfer: 'bt709',
          matrix: 'bt709',
          range: 'limited',
          hdrMode: 'sdr',
        },
      },
      proxyMetadata: {
        status: 'READY',
        filePath: '/seed-media/proxies/scene-01-take-01-proxy.mp4',
        playbackUrl: 'file:///seed-media/proxies/scene-01-take-01-proxy.mp4',
        codec: 'h264',
        width: 1280,
        height: 720,
        updatedAt: '2026-01-10T12:05:00.000Z',
      },
    }),
    createSeedMediaAsset({
      name: 'Scene 01 - Take 02.r3d',
      type: 'VIDEO',
      duration: 48.7,
      tags: ['dialogue', 'raw'],
      technicalMetadata: {
        container: 'r3d',
        videoCodec: 'redcode_raw',
        audioCodec: 'pcm_s24le',
        durationSeconds: 48.7,
        frameRate: 23.976,
        width: 6144,
        height: 3160,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
        sampleRate: 48000,
        bitRate: 180000000,
        timecodeStart: '01:00:45:05',
        reelName: 'A002',
        colorDescriptor: {
          colorSpace: 'Rec.2020',
          primaries: 'bt2020',
          transfer: 'smpte2084',
          matrix: 'bt2020nc',
          range: 'full',
          hdrMode: 'pq',
        },
      },
      proxyMetadata: {
        status: 'READY',
        filePath: '/seed-media/proxies/scene-01-take-02-proxy.mov',
        playbackUrl: 'file:///seed-media/proxies/scene-01-take-02-proxy.mov',
        codec: 'prores',
        width: 2048,
        height: 1080,
        updatedAt: '2026-01-10T12:12:00.000Z',
      },
    }),
    createSeedMediaAsset({
      name: template === 'sports' ? 'Goal Cam - Wide.mov' : 'Scene 02 - Insert.mov',
      type: 'VIDEO',
      duration: 22.1,
      tags: template === 'sports' ? ['action', 'slow-motion'] : ['insert', 'coverage'],
      technicalMetadata: {
        container: 'mov',
        videoCodec: 'prores_422',
        audioCodec: 'pcm_s16le',
        durationSeconds: 22.1,
        frameRate: template === 'sports' ? 59.94 : 24,
        width: 3840,
        height: 2160,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
        sampleRate: 48000,
        bitRate: 180000000,
        timecodeStart: '02:12:00:00',
        reelName: template === 'sports' ? 'GCAM1' : 'B012',
        colorDescriptor: {
          colorSpace: template === 'sports' ? 'HLG' : 'Rec.709',
          primaries: template === 'sports' ? 'bt2020' : 'bt709',
          transfer: template === 'sports' ? 'arib-std-b67' : 'bt709',
          matrix: template === 'sports' ? 'bt2020nc' : 'bt709',
          range: 'limited',
          hdrMode: template === 'sports' ? 'hlg' : 'sdr',
        },
      },
    }),
  ];

  const secondaryAssets: EditorMediaAsset[] = [
    createSeedMediaAsset({
      name: template === 'documentary' ? 'Interview Selects.mp4' : 'B-Roll City.mp4',
      type: 'VIDEO',
      duration: 67.5,
      tags: ['selects'],
      technicalMetadata: {
        container: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        durationSeconds: 67.5,
        frameRate: 24,
        width: 1920,
        height: 1080,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
        sampleRate: 48000,
        bitRate: 12000000,
        timecodeStart: '10:15:03:12',
        reelName: 'BR001',
        colorDescriptor: {
          colorSpace: 'Rec.709',
          primaries: 'bt709',
          transfer: 'bt709',
          matrix: 'bt709',
          range: 'limited',
          hdrMode: 'sdr',
        },
      },
    }),
    createSeedMediaAsset({
      name: template === 'social' ? 'Vertical Hero Shot.mp4' : 'Close-up Alt.mp4',
      type: 'VIDEO',
      duration: 31.2,
      tags: ['coverage', template === 'social' ? 'vertical' : 'alternate'],
      technicalMetadata: {
        container: 'mp4',
        videoCodec: 'h265',
        audioCodec: 'aac',
        durationSeconds: 31.2,
        frameRate: template === 'social' ? 30 : 24,
        width: template === 'social' ? 1080 : 1920,
        height: template === 'social' ? 1920 : 1080,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
        sampleRate: 48000,
        bitRate: 9000000,
        timecodeStart: '10:16:24:00',
        reelName: 'ALT02',
        colorDescriptor: {
          colorSpace: 'Display-P3',
          primaries: 'display-p3',
          transfer: 'iec61966-2-1',
          matrix: 'bt709',
          range: 'full',
          hdrMode: 'sdr',
        },
      },
    }),
  ];

  const musicAssets: EditorMediaAsset[] = [
    createSeedMediaAsset({
      name: template === 'podcast' ? 'Theme Sting.wav' : 'Main Theme.wav',
      type: 'AUDIO',
      duration: 180,
      tags: ['music', 'surround'],
      isFavorite: true,
      waveformData: createWaveform(120, 5),
      technicalMetadata: {
        container: 'wav',
        audioCodec: 'pcm_s24le',
        durationSeconds: 180,
        audioChannels: 6,
        audioChannelLayout: '5.1',
        sampleRate: 48000,
        bitRate: 6912000,
        timecodeStart: '00:58:00:00',
        reelName: 'MUS01',
      },
      waveformMetadata: {
        status: 'READY',
        peaks: createWaveform(120, 5),
        sampleCount: 120,
        updatedAt: '2026-01-10T12:03:00.000Z',
      },
    }),
    createSeedMediaAsset({
      name: template === 'sports' ? 'Crowd Lift.aiff' : 'Tension Bed.aiff',
      type: 'AUDIO',
      duration: 90,
      tags: ['music', 'stereo'],
      waveformData: createWaveform(120, 18),
      technicalMetadata: {
        container: 'aiff',
        audioCodec: 'pcm_s16be',
        durationSeconds: 90,
        audioChannels: 2,
        audioChannelLayout: 'stereo',
        sampleRate: 48000,
        bitRate: 1536000,
        timecodeStart: '00:59:12:00',
        reelName: 'MUS02',
      },
      waveformMetadata: {
        status: 'READY',
        peaks: createWaveform(120, 18),
        sampleCount: 120,
        updatedAt: '2026-01-10T12:03:30.000Z',
      },
    }),
  ];

  return [
    {
      id: generateId('bin'),
      name: 'Rushes',
      color: rootColor,
      isOpen: true,
      children: [
        {
          id: generateId('bin'),
          name: 'Day 1',
          color: '#818cf8',
          isOpen: true,
          children: [],
          assets: rushesAssets,
        },
        {
          id: generateId('bin'),
          name: template === 'documentary' ? 'Interviews' : 'Coverage',
          color: '#818cf8',
          isOpen: false,
          children: [],
          assets: secondaryAssets,
        },
      ],
      assets: [],
    },
    {
      id: generateId('bin'),
      name: 'Music',
      color: '#2bb672',
      isOpen: false,
      children: [],
      assets: musicAssets,
    },
    {
      id: generateId('bin'),
      name: 'Graphics',
      color: '#e8943a',
      isOpen: false,
      children: [],
      assets: [
        createSeedMediaAsset({
          name: 'Title Card.png',
          type: 'IMAGE',
          tags: ['graphics', 'bitmap'],
          technicalMetadata: {
            container: 'png_pipe',
            videoCodec: 'png',
            width: 3840,
            height: 2160,
            colorDescriptor: {
              colorSpace: 'sRGB',
              primaries: 'bt709',
              transfer: 'iec61966-2-1',
              matrix: 'rgb',
              range: 'full',
              hdrMode: 'sdr',
              alphaMode: 'straight',
            },
            graphicDescriptor: {
              kind: 'bitmap',
              sourceFormat: 'png',
              canvasWidth: 3840,
              canvasHeight: 2160,
              hasAlpha: true,
              flatteningRequired: false,
              renderStrategy: 'direct',
            },
          },
        }),
        createSeedMediaAsset({
          name: 'Lower Third.svg',
          type: 'GRAPHIC',
          tags: ['graphics', 'vector'],
          proxyMetadata: {
            status: 'READY',
            filePath: '/seed-media/renders/lower-third.png',
            playbackUrl: 'file:///seed-media/renders/lower-third.png',
            codec: 'png',
            width: 1920,
            height: 1080,
            updatedAt: '2026-01-10T12:07:00.000Z',
          },
          technicalMetadata: {
            container: 'svg',
            width: 1920,
            height: 1080,
            graphicDescriptor: {
              kind: 'vector',
              sourceFormat: 'svg',
              canvasWidth: 1920,
              canvasHeight: 1080,
              hasAlpha: true,
              flatteningRequired: true,
              renderStrategy: 'rasterize',
            },
            colorDescriptor: {
              colorSpace: 'sRGB',
              primaries: 'bt709',
              transfer: 'iec61966-2-1',
              matrix: 'rgb',
              range: 'full',
              hdrMode: 'sdr',
              alphaMode: 'straight',
            },
          },
        }),
        createSeedMediaAsset({
          name: 'Segment Opener.psd',
          type: 'GRAPHIC',
          tags: ['graphics', 'layered'],
          proxyMetadata: {
            status: 'READY',
            filePath: '/seed-media/renders/segment-opener.png',
            playbackUrl: 'file:///seed-media/renders/segment-opener.png',
            codec: 'png',
            width: 3840,
            height: 2160,
            updatedAt: '2026-01-10T12:09:00.000Z',
          },
          technicalMetadata: {
            container: 'psd',
            width: 3840,
            height: 2160,
            graphicDescriptor: {
              kind: 'layered-graphic',
              sourceFormat: 'psd',
              canvasWidth: 3840,
              canvasHeight: 2160,
              layerCount: 12,
              hasAlpha: true,
              flatteningRequired: true,
              renderStrategy: 'flatten',
            },
            colorDescriptor: {
              colorSpace: 'Adobe RGB',
              primaries: 'adobe-rgb',
              transfer: 'iec61966-2-1',
              matrix: 'rgb',
              range: 'full',
              hdrMode: 'sdr',
              alphaMode: 'straight',
            },
          },
        }),
      ],
    },
    {
      id: generateId('bin'),
      name: 'Captions',
      color: '#6bc5e3',
      isOpen: false,
      children: [],
      assets: [
        createSeedMediaAsset({
          name: 'Scene 01 English.srt',
          type: 'DOCUMENT',
          duration: 48.7,
          tags: ['subtitle', 'english'],
          technicalMetadata: {
            container: 'srt',
            subtitleCodec: 'subrip',
            durationSeconds: 48.7,
            frameRate: 23.976,
            timebase: createTimebaseDescriptor(23.976),
            subtitleLanguages: ['en'],
            timecodeStart: '01:00:45:05',
            reelName: 'A002',
          },
        }),
      ],
    },
    {
      id: generateId('bin'),
      name: 'Selects',
      color: '#e05b8e',
      isOpen: false,
      children: [],
      assets: [],
    },
  ];
}

function createTranscriptCues(bins: EditorBin[], template: ProjectTemplate): EditorTranscriptCue[] {
  const assets = flattenAssets(bins).filter((asset) => asset.type === 'VIDEO' || asset.type === 'AUDIO').slice(0, 5);
  const templateLines: Record<ProjectTemplate, string[]> = {
    film: [
      'We open on the decision point, not the setup.',
      'Stay on the reaction until the line lands.',
      'Use the insert to bridge the cut on the turn.',
      'Bring music in after the breath, not before.',
      'Hold the last beat for two seconds before the title.',
    ],
    commercial: [
      'Lead with the product hero before the voiceover.',
      'Find the cleanest smile and trim the hesitation.',
      'Keep the CTA version inside the fifteen second cap.',
      'Use the logo resolve after the value proposition.',
      'Build a square and vertical cut from the same selects.',
    ],
    documentary: [
      'Start on the strongest observation, not the chronology.',
      'Use the city ambience under the first answer.',
      'Favor the line about memory over the explanatory setup.',
      'Cut to b-roll when the speaker references the neighborhood.',
      'Leave the pause before the final sentence.',
    ],
    sports: [
      'Open with the crowd hit, then the hero replay.',
      'Trim the package to the scoring run and reaction.',
      'Land the music accent on the replay cut.',
      'Use the bench iso as the secondary beat.',
      'Close on the celebration and sponsor bug.',
    ],
    podcast: [
      'Start with the clean hook from the guest.',
      'Cut the host overlap before the answer begins.',
      'Use the sting to separate the ad read.',
      'Favor the concise anecdote over the longer tangent.',
      'Save the strongest quote for the trailer version.',
    ],
    social: [
      'Open on the most visual line within the first second.',
      'Keep captions concise and front-loaded.',
      'Use the reaction shot before the callout graphic.',
      'Trim the pause between beats for mobile pace.',
      'End on the hook that can loop back to the top.',
    ],
    news: [
      'Lead with the SOT from the press conference.',
      'Cut to the b-roll of the scene before the standup.',
      'Keep the lower third over the interview bite.',
      'Trim the package to hit the target duration exactly.',
      'End on the anchor tag and toss to weather.',
    ],
  };

  return assets.map((asset, index) => {
    const startTime = index * 6.5;
    const endTime = startTime + Math.min(asset.duration ?? 5.5, 6.2);
    return {
      id: generateId('cue'),
      assetId: asset.id,
      speaker: index % 2 === 0 ? 'Editor' : 'Producer',
      startTime,
      endTime,
      text: templateLines[template][index] ?? `${asset.name} select`,
      confidence: 0.88 - index * 0.04,
      source: index < 3 ? 'TRANSCRIPT' : 'SCRIPT',
      language: 'en',
      provider: 'seed',
      linkedScriptLineIds: [],
    };
  });
}

function createTranscriptSpeakers(transcript: EditorTranscriptCue[]): EditorTranscriptSpeaker[] {
  const speakers = new Map<string, EditorTranscriptSpeaker>();

  for (const cue of transcript) {
    const speakerId = cue.speakerId ?? cue.speaker.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!speakers.has(speakerId)) {
      speakers.set(speakerId, {
        id: speakerId,
        label: cue.speaker,
        confidence: cue.confidence,
        identified: false,
      });
    }
  }

  return [...speakers.values()];
}

function createScriptDocument(template: ProjectTemplate, transcript: EditorTranscriptCue[]): EditorScriptDocument | null {
  if (transcript.length === 0) {
    return null;
  }

  const lines = transcript.map((cue, index) => ({
    id: generateId('script-line'),
    lineNumber: index + 1,
    text: cue.text,
    speaker: cue.speaker,
    linkedCueIds: [cue.id],
  }));

  return {
    id: generateId('script'),
    title: `${(template[0] ?? '').toUpperCase()}${template.slice(1)} Script`,
    source: 'GENERATED',
    language: 'en',
    text: lines.map((line) => {
      return line.speaker ? `${line.speaker}: ${line.text}` : line.text;
    }).join('\n\n'),
    lines,
    updatedAt: new Date().toISOString(),
  };
}

function createReviewComments(template: ProjectTemplate): EditorReviewComment[] {
  const now = Date.now();
  const templateNotes: Record<ProjectTemplate, string[]> = {
    film: [
      'Trim into the reaction faster after the line read.',
      'Keep the room tone through this cut for continuity.',
    ],
    commercial: [
      'Client prefers the product lockup two beats earlier.',
      'Need a clean cutdown for the six second version.',
    ],
    documentary: [
      'This quote is strong enough to open the act.',
      'Check rights clearance for the archival still here.',
    ],
    sports: [
      'Push the replay angle sooner after the score.',
      'Need sponsor-safe version without league bug.',
    ],
    podcast: [
      'Take a little more air out before the guest response.',
      'Ad read should land after the first story beat.',
    ],
    social: [
      'Hook needs the strongest frame inside the first second.',
      'Caption styling should be larger for mobile.',
    ],
    news: [
      'Package is three seconds over target duration.',
      'Lower third needs updated title for the source.',
    ],
  };

  return templateNotes[template].map((body, index) => ({
    id: generateId('comment'),
    author: index === 0 ? 'Sarah K.' : 'Marcus T.',
    role: index === 0 ? 'Producer' : 'Reviewer',
    color: index === 0 ? '#7c5cfc' : '#25a865',
    body,
    time: 6 + index * 8,
    createdAt: new Date(now - (index + 1) * 1000 * 60 * 45).toISOString(),
    status: index === 0 ? 'OPEN' : 'RESOLVED',
  }));
}

function createApprovals(): EditorApproval[] {
  return [
    {
      id: generateId('approval'),
      reviewer: 'Sarah K.',
      role: 'Producer',
      status: 'PENDING',
      notes: 'Story pass is ready for review.',
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId('approval'),
      reviewer: 'Marcus T.',
      role: 'Finishing',
      status: 'CHANGES_REQUESTED',
      notes: 'Need updated captions and loudness-safe export.',
      updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
  ];
}

function createPublishJobs(template: ProjectTemplate): EditorPublishJob[] {
  const templatePresets: Record<ProjectTemplate, Array<[string, string, string, EditorPublishJob['status'], number]>> = {
    film: [
      ['Screening MXF', 'Broadcast DNxHR MXF', 'Local mastering volume', 'COMPLETED', 100],
      ['Review Screener', 'H.264 Review', 'Frame.io review room', 'QUEUED', 0],
    ],
    commercial: [
      ['Master Spot', 'ProRes 422 HQ', 'Agency delivery folder', 'COMPLETED', 100],
      ['Social Cutdown', 'Vertical Social Pack', 'Instagram and TikTok queue', 'DRAFT', 0],
    ],
    documentary: [
      ['Festival Master', 'ProRes 4444', 'Archive package', 'PROCESSING', 64],
      ['Caption Package', 'SRT + VTT', 'Accessibility drop', 'DRAFT', 0],
    ],
    sports: [
      ['Broadcast Package', 'XDCAM MXF', 'Truck output', 'QUEUED', 0],
      ['Highlight Social', 'Vertical Social Pack', 'Social publishing queue', 'PROCESSING', 42],
    ],
    podcast: [
      ['Audio Master', 'WAV 24-bit', 'Podcast mastering folder', 'COMPLETED', 100],
      ['Trailer Video', 'H.264 Review', 'YouTube upload queue', 'DRAFT', 0],
    ],
    social: [
      ['Creator Master', 'Vertical Social Pack', 'TikTok and Reels', 'PROCESSING', 78],
      ['Review Link', 'H.264 Review', 'Mobile review room', 'COMPLETED', 100],
    ],
    news: [
      ['Playout MXF', 'Broadcast DNxHD MXF', 'AirSpeed Primary', 'QUEUED', 0],
      ['Archive Copy', 'XDCAM MXF', 'News archive server', 'DRAFT', 0],
    ],
  };

  return templatePresets[template].map(([label, preset, destination, status, progress], index) => ({
    id: generateId('publish'),
    label,
    preset,
    destination,
    status,
    progress,
    createdAt: new Date(Date.now() - (index + 1) * 1000 * 60 * 75).toISOString(),
    updatedAt: new Date(Date.now() - index * 1000 * 60 * 25).toISOString(),
    outputSummary: status === 'COMPLETED' ? 'Delivered successfully' : undefined,
  }));
}

function seedTracksFromBins(tracks: EditorTrack[], bins: EditorBin[]): EditorTrack[] {
  const nextTracks = cloneValue(tracks);
  const allAssets = flattenAssets(bins);
  const videoAssets = allAssets.filter((asset) => asset.type === 'VIDEO').slice(0, 4);
  const audioAssets = allAssets.filter((asset) => asset.type === 'AUDIO').slice(0, 2);

  const videoTrack = nextTracks.find((track) => track.name === 'V1');
  const overlayTrack = nextTracks.find((track) => track.name === 'V2');
  const primaryAudioTrack = nextTracks.find((track) => track.type === 'AUDIO');
  const secondaryAudioTrack = nextTracks.filter((track) => track.type === 'AUDIO')[1];
  const subtitleTrack = nextTracks.find((track) => track.type === 'SUBTITLE');

  if (videoTrack) {
    videoTrack.clips = videoAssets.map((asset, index) => ({
      id: generateId('clip'),
      trackId: videoTrack.id,
      name: asset.name,
      startTime: index * 9.5,
      endTime: index * 9.5 + Math.min(asset.duration ?? 8, 8.5),
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: asset.id,
    }));
  }

  if (overlayTrack && videoAssets[2]) {
    overlayTrack.clips = [{
      id: generateId('clip'),
      trackId: overlayTrack.id,
      name: `${videoAssets[2].name} Overlay`,
      startTime: 4,
      endTime: 10,
      trimStart: 0,
      trimEnd: 0,
      type: 'video',
      assetId: videoAssets[2].id,
    }];
  }

  if (primaryAudioTrack && audioAssets[0]) {
    primaryAudioTrack.clips = [{
      id: generateId('clip'),
      trackId: primaryAudioTrack.id,
      name: audioAssets[0].name,
      startTime: 0,
      endTime: 26,
      trimStart: 0,
      trimEnd: 0,
      type: 'audio',
      assetId: audioAssets[0].id,
      waveformData: audioAssets[0].waveformData ?? createWaveform(220, 9),
    }];
  }

  if (secondaryAudioTrack && audioAssets[1]) {
    secondaryAudioTrack.clips = [{
      id: generateId('clip'),
      trackId: secondaryAudioTrack.id,
      name: audioAssets[1].name,
      startTime: 8,
      endTime: 34,
      trimStart: 0,
      trimEnd: 0,
      type: 'audio',
      assetId: audioAssets[1].id,
      waveformData: audioAssets[1].waveformData ?? createWaveform(220, 14),
    }];
  }

  if (subtitleTrack) {
    subtitleTrack.clips = [{
      id: generateId('clip'),
      trackId: subtitleTrack.id,
      name: 'Captions',
      startTime: 0,
      endTime: 34,
      trimStart: 0,
      trimEnd: 0,
      type: 'subtitle',
    }];
  }

  return nextTracks;
}

/**
 * Recursively flatten all media assets from a bin hierarchy.
 * Handles empty bins, missing children, and missing asset arrays gracefully.
 *
 * Uses an iterative stack-based approach instead of recursive flatMap
 * to avoid stack overflow on deeply nested bin hierarchies and reduce
 * intermediate array allocations.
 *
 * @param bins - Array of editor bins to flatten.
 * @returns All media assets across all bins and nested children.
 */
export function flattenAssets(bins: EditorBin[]): EditorMediaAsset[] {
  if (!bins || bins.length === 0) return [];

  const result: EditorMediaAsset[] = [];
  // Use an explicit stack to avoid recursion overhead
  const stack: EditorBin[] = [...bins];

  while (stack.length > 0) {
    const bin = stack.pop();
    if (!bin) continue;
    const assets = bin.assets;
    if (assets && assets.length > 0) {
      for (const asset of assets) {
        result.push(asset);
      }
    }
    const children = bin.children;
    if (children && children.length > 0) {
      for (const child of [...children].reverse()) {
        stack.push(child);
      }
    }
  }

  return result;
}

/**
 * Calculate the total duration of a project from its tracks and clips.
 * Handles empty tracks, empty clips, zero-duration clips, and clips at frame 0.
 * Returns 0 for projects with no clips.
 *
 * @param project - Object with a `tracks` array.
 * @returns Duration in seconds (always >= 0).
 */
export function getProjectDuration(project: Pick<EditorProject, 'tracks'>): number {
  const tracks = project.tracks ?? [];
  if (tracks.length === 0) return 0;

  // Avoid intermediate array allocation from flatMap + reduce.
  // Iterate tracks and clips inline for O(n) with zero allocations.
  let maxEnd = 0;
  for (const track of tracks) {
    const clips = track.clips ?? [];
    for (const clip of clips) {
      const endTime = clip.endTime;
      if (Number.isFinite(endTime) && endTime > maxEnd) {
        maxEnd = endTime;
      }
    }
  }
  return maxEnd;
}

function normalizeProject(project: EditorProject): EditorProject {
  // Clamp settings to valid ranges
  const rawFrameRate = project.settings?.frameRate ?? 24;
  const frameRate = Number.isFinite(rawFrameRate) && rawFrameRate > 0 ? rawFrameRate : 24;
  const rawWidth = project.settings?.width ?? 1920;
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? Math.round(rawWidth) : 1920;
  const rawHeight = project.settings?.height ?? 1080;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? Math.round(rawHeight) : 1080;
  const rawSampleRate = project.settings?.sampleRate ?? 48000;
  const sampleRate = Number.isFinite(rawSampleRate) && rawSampleRate > 0 ? rawSampleRate : 48000;
  const dropFrame = project.settings?.dropFrame === true;

  // Clamp progress to 0-100
  const rawProgress = typeof project.progress === 'number' ? project.progress : 0;
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;

  // Clamp token balance to >= 0
  const rawTokenBalance = typeof project.tokenBalance === 'number' ? project.tokenBalance : 0;
  const tokenBalance = Number.isFinite(rawTokenBalance) ? Math.max(0, rawTokenBalance) : 0;
  const trackIds = new Set((project.tracks ?? []).map((track) => track.id));
  const defaultVideoMonitorTrackId = (project.tracks ?? []).find(
    (track) => track.type === 'VIDEO' || track.type === 'GRAPHIC',
  )?.id ?? null;
  const editorialState = project.editorialState ?? {
    selectedBinId: null,
    sourceAssetId: null,
    enabledTrackIds: Array.from(trackIds),
    syncLockedTrackIds: [],
    videoMonitorTrackId: defaultVideoMonitorTrackId,
    sourceTrackDescriptors: [],
    trackPatches: [],
  };
  const workstationState = project.workstationState ?? {
    subtitleTracks: [],
    titleClips: [],
    trackHeights: {},
    activeWorkspaceId: DEFAULT_EDITORIAL_WORKSPACE_ID,
    composerLayout: 'source-record' as const,
    showTrackingInfo: true,
    trackingInfoFields: ['master-tc', 'duration'],
    clipTextDisplay: 'name' as const,
    dupeDetectionEnabled: false,
    versionHistoryRetentionPreference: 'manual' as const,
    versionHistoryCompareMode: 'summary' as const,
  };

  return {
    ...project,
    schemaVersion: typeof project.schemaVersion === 'number' ? project.schemaVersion : PROJECT_SCHEMA_VERSION,
    description: project.description ?? '',
    tags: [...(project.tags ?? [])],
    createdAt: project.createdAt ?? new Date().toISOString(),
    updatedAt: project.updatedAt ?? new Date().toISOString(),
    progress,
    settings: {
      frameRate,
      width,
      height,
      sampleRate,
      exportFormat: project.settings?.exportFormat ?? 'mov',
      dropFrame,
    },
    tracks: cloneValue(project.tracks ?? []),
    markers: cloneValue(project.markers ?? []),
    bins: normalizeBins(project.bins ?? []),
    collaborators: cloneValue(project.collaborators ?? []),
    aiJobs: cloneValue(project.aiJobs ?? []),
    transcript: cloneValue(project.transcript ?? []),
    transcriptSpeakers: cloneValue(project.transcriptSpeakers ?? createTranscriptSpeakers(project.transcript ?? [])),
    scriptDocument: project.scriptDocument ? cloneValue(project.scriptDocument) : null,
    transcriptionSettings: cloneValue(project.transcriptionSettings ?? {
      provider: 'local-faster-whisper',
      translationProvider: 'local-runtime',
      preferredLanguage: 'auto',
      enableDiarization: true,
      enableSpeakerIdentification: false,
      translateToEnglish: false,
    }),
    reviewComments: cloneValue(project.reviewComments ?? []),
    approvals: cloneValue(project.approvals ?? []),
    publishJobs: cloneValue(project.publishJobs ?? []),
    watchFolders: cloneValue(project.watchFolders ?? []),
    versionHistory: cloneValue(project.versionHistory ?? []),
    collaboration: {
      presenceSnapshots: cloneValue(project.collaboration?.presenceSnapshots ?? []),
      comments: cloneValue(project.collaboration?.comments ?? []),
      activityFeed: cloneValue(project.collaboration?.activityFeed ?? []),
    },
    tokenBalance,
    editorialState: {
      selectedBinId: editorialState.selectedBinId ?? null,
      sourceAssetId: editorialState.sourceAssetId ?? null,
      enabledTrackIds: cloneValue(
        (editorialState.enabledTrackIds ?? []).filter((trackId) => trackIds.has(trackId)),
      ),
      syncLockedTrackIds: cloneValue(
        (editorialState.syncLockedTrackIds ?? []).filter((trackId) => trackIds.has(trackId)),
      ),
      videoMonitorTrackId: editorialState.videoMonitorTrackId && trackIds.has(editorialState.videoMonitorTrackId)
        ? editorialState.videoMonitorTrackId
        : defaultVideoMonitorTrackId,
      sourceTrackDescriptors: cloneValue(
        (editorialState.sourceTrackDescriptors ?? [])
          .filter((descriptor) => (
            typeof descriptor?.id === 'string'
            && (descriptor.type === 'VIDEO' || descriptor.type === 'AUDIO')
            && Number.isFinite(descriptor.index)
            && descriptor.index > 0
          ))
          .map((descriptor) => ({
            id: descriptor.id,
            type: descriptor.type,
            index: Math.round(descriptor.index),
          })),
      ),
      trackPatches: cloneValue(
        (editorialState.trackPatches ?? []).filter((patch) => (
          typeof patch?.sourceTrackId === 'string'
          && typeof patch.recordTrackId === 'string'
          && trackIds.has(patch.recordTrackId)
          && (patch.sourceTrackType === 'VIDEO' || patch.sourceTrackType === 'AUDIO')
          && Number.isFinite(patch.sourceTrackIndex)
          && patch.sourceTrackIndex > 0
        )),
      ),
    },
    workstationState: {
      subtitleTracks: cloneValue(workstationState.subtitleTracks ?? []),
      titleClips: cloneValue(workstationState.titleClips ?? []),
      trackHeights: cloneValue(workstationState.trackHeights ?? {}),
      activeWorkspaceId: workstationState.activeWorkspaceId ?? DEFAULT_EDITORIAL_WORKSPACE_ID,
      composerLayout: workstationState.composerLayout === 'full-frame' ? 'full-frame' : 'source-record',
      showTrackingInfo: workstationState.showTrackingInfo ?? true,
      trackingInfoFields: cloneValue(workstationState.trackingInfoFields ?? ['master-tc', 'duration']),
      clipTextDisplay: workstationState.clipTextDisplay ?? 'name',
      dupeDetectionEnabled: workstationState.dupeDetectionEnabled ?? false,
      versionHistoryRetentionPreference: workstationState.versionHistoryRetentionPreference === 'session'
        ? 'session'
        : 'manual',
      versionHistoryCompareMode: workstationState.versionHistoryCompareMode === 'details'
        ? 'details'
        : 'summary',
    },
  };
}

export function cloneProject(project: EditorProject): EditorProject {
  return cloneValue(normalizeProject(project));
}

function readProjects(): EditorProject[] {
  const raw = getStorage().getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as EditorProject[];
    return parsed.map(normalizeProject);
  } catch {
    getStorage().removeItem(STORAGE_KEY);
    return [];
  }
}

function writeProjects(projects: EditorProject[]): void {
  getStorage().setItem(STORAGE_KEY, JSON.stringify(projects.map(normalizeProject)));
}

export function getTemplateMeta(template: ProjectTemplate) {
  return TEMPLATE_META[template];
}

export function hydrateProject(project: Partial<EditorProject>): EditorProject {
  const template = project.template ?? 'film';
  const bins = project.bins ?? [];
  const tracks = project.tracks ?? [];
  const transcript = project.transcript ?? createTranscriptCues(bins, template);
  const firstVideoTrackId = tracks.find(
    (track) => track.type === 'VIDEO' || track.type === 'GRAPHIC',
  )?.id ?? null;
  return normalizeProject({
    schemaVersion: project.schemaVersion ?? PROJECT_SCHEMA_VERSION,
    id: project.id ?? generateId('project'),
    name: project.name ?? 'Imported Project',
    description: project.description ?? TEMPLATE_META[template].description,
    template,
    tags: project.tags ?? TEMPLATE_META[template].tags,
    createdAt: project.createdAt ?? new Date().toISOString(),
    updatedAt: project.updatedAt ?? new Date().toISOString(),
    progress: project.progress ?? 0,
    settings: project.settings ?? {
      frameRate: 24,
      width: 1920,
      height: 1080,
      sampleRate: 48000,
      exportFormat: 'mov',
      dropFrame: false,
    },
    tracks,
    markers: project.markers ?? [],
    bins,
    collaborators: project.collaborators ?? [],
    aiJobs: project.aiJobs ?? [],
    transcript,
    transcriptSpeakers: project.transcriptSpeakers ?? createTranscriptSpeakers(transcript),
    scriptDocument: project.scriptDocument ?? createScriptDocument(template, transcript),
    transcriptionSettings: project.transcriptionSettings ?? {
      provider: 'local-faster-whisper',
      translationProvider: 'local-runtime',
      preferredLanguage: 'auto',
      enableDiarization: true,
      enableSpeakerIdentification: false,
      translateToEnglish: false,
    },
    reviewComments: project.reviewComments ?? createReviewComments(template),
    approvals: project.approvals ?? createApprovals(),
    publishJobs: project.publishJobs ?? createPublishJobs(template),
    watchFolders: project.watchFolders ?? [],
    versionHistory: project.versionHistory ?? [],
    collaboration: {
      presenceSnapshots: project.collaboration?.presenceSnapshots ?? [],
      comments: project.collaboration?.comments ?? [],
      activityFeed: project.collaboration?.activityFeed ?? [],
    },
    tokenBalance: project.tokenBalance ?? 0,
    editorialState: project.editorialState ?? {
      selectedBinId: bins[0]?.id ?? null,
      sourceAssetId: null,
      enabledTrackIds: tracks.map((track) => track.id),
      syncLockedTrackIds: [],
      videoMonitorTrackId: firstVideoTrackId,
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: project.workstationState ?? {
      subtitleTracks: [],
      titleClips: [],
      trackHeights: {},
      activeWorkspaceId: DEFAULT_EDITORIAL_WORKSPACE_ID,
      composerLayout: 'source-record',
      showTrackingInfo: true,
      trackingInfoFields: ['master-tc', 'duration'],
      clipTextDisplay: 'name',
      dupeDetectionEnabled: false,
      versionHistoryRetentionPreference: 'manual',
      versionHistoryCompareMode: 'summary',
    },
  });
}

export function buildProject(options: CreateProjectOptions = {}): EditorProject {
  const template = options.template ?? 'film';
  const seedContent = options.seedContent ?? true;
  const meta = TEMPLATE_META[template];
  const frameRate = options.frameRate ?? meta.resolution.frameRate;
  const width = options.width ?? meta.resolution.width;
  const height = options.height ?? meta.resolution.height;
  const sampleRate = options.sampleRate ?? 48000;
  const exportFormat = options.exportFormat ?? (template === 'podcast' ? 'wav' : 'mov');
  const bins = seedContent ? createTemplateBins(template) : [];
  const tracks = seedContent
    ? seedTracksFromBins(createTemplateTracks(template), bins)
    : createTemplateTracks(template);
  const transcript = seedContent ? createTranscriptCues(bins, template) : [];
  const transcriptSpeakers = createTranscriptSpeakers(transcript);
  const scriptDocument = seedContent ? createScriptDocument(template, transcript) : null;
  const now = new Date().toISOString();
  const name = options.name ?? `Untitled ${(template[0] ?? '').toUpperCase()}${template.slice(1)}`;
  const firstVideoTrackId = tracks.find(
    (track) => track.type === 'VIDEO' || track.type === 'GRAPHIC',
  )?.id ?? null;

  return normalizeProject({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: generateId('project'),
    name,
    description: options.description ?? meta.description,
    template,
    tags: options.tags?.length ? [...options.tags] : [...meta.tags],
    createdAt: now,
    updatedAt: now,
    progress: seedContent
      ? Math.max(18, Math.min(100, Math.round(getProjectDuration({ tracks }) * 2)))
      : 0,
    settings: {
      frameRate,
      width,
      height,
      sampleRate,
      exportFormat,
      dropFrame: options.dropFrame ?? false,
    },
    tracks,
    markers: seedContent
      ? [
          { id: generateId('marker'), time: 8.5, label: 'Beat marker', color: '#f59e0b' },
          { id: generateId('marker'), time: 22, label: 'Revision point', color: '#ef4444' },
        ]
      : [],
    bins,
    collaborators: seedContent
      ? [
          { id: generateId('user'), displayName: 'Sarah K.', color: '#7c5cfc' },
          { id: generateId('user'), displayName: 'Marcus T.', color: '#25a865' },
        ]
      : [],
    aiJobs: [],
    transcript,
    transcriptSpeakers,
    scriptDocument,
    transcriptionSettings: {
      provider: 'local-faster-whisper',
      translationProvider: 'local-runtime',
      preferredLanguage: 'auto',
      enableDiarization: true,
      enableSpeakerIdentification: false,
      translateToEnglish: false,
    },
    reviewComments: seedContent ? createReviewComments(template) : [],
    approvals: seedContent ? createApprovals() : [],
    publishJobs: seedContent ? createPublishJobs(template) : [],
    watchFolders: [],
    versionHistory: [],
    collaboration: {
      presenceSnapshots: [],
      comments: [],
      activityFeed: [],
    },
    tokenBalance: seedContent ? (template === 'sports' ? 620 : 487) : 0,
    editorialState: {
      selectedBinId: bins[0]?.id ?? null,
      sourceAssetId: null,
      enabledTrackIds: tracks.map((track) => track.id),
      syncLockedTrackIds: [],
      videoMonitorTrackId: firstVideoTrackId,
      sourceTrackDescriptors: [],
      trackPatches: [],
    },
    workstationState: {
      subtitleTracks: [],
      titleClips: [],
      trackHeights: {},
      activeWorkspaceId: options.activeWorkspaceId ?? DEFAULT_EDITORIAL_WORKSPACE_ID,
      composerLayout: options.composerLayout ?? 'source-record',
      showTrackingInfo: true,
      trackingInfoFields: ['master-tc', 'duration'],
      clipTextDisplay: 'name',
      dupeDetectionEnabled: false,
      versionHistoryRetentionPreference: 'manual',
      versionHistoryCompareMode: 'summary',
    },
  });
}

export function buildSeedProjectLibrary(): EditorProject[] {
  return [
    buildProject({ name: 'Demo Feature Film', template: 'film', seedContent: true }),
    buildProject({ name: 'Brand Campaign Q4', template: 'commercial', seedContent: true }),
    buildProject({ name: 'Documentary: City Life', template: 'documentary', seedContent: true }),
    buildProject({ name: 'Sports Highlights Reel', template: 'sports', seedContent: true }),
    buildProject({ name: 'Podcast Episode 24', template: 'podcast', seedContent: true }),
  ];
}

export function createProject(options: CreateProjectOptions = {}): EditorProject {
  return upsertProject(buildProject({
    ...options,
    seedContent: options.seedContent ?? false,
  }));
}

export function ensureProjectLibrary(): EditorProject[] {
  const existing = readProjects();
  if (existing.length > 0) {
    return existing.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  const seeded = buildSeedProjectLibrary().map((project) => upsertProject(project));
  return seeded.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function listProjects(): EditorProject[] {
  return ensureProjectLibrary().map((project) => normalizeProject(project));
}

export function listProjectSummaries(): ProjectSummary[] {
  return listProjects().map(toProjectSummary);
}

/**
 * Retrieve a project by ID.
 *
 * @param id - The project ID. Must be a non-empty string.
 * @returns The project, or null if not found.
 * @throws {TypeError} if id is not a non-empty string.
 */
export function getProject(id: string): EditorProject | null {
  if (!id || typeof id !== 'string') {
    throw new TypeError('getProject() requires a non-empty string id');
  }
  return listProjects().find((project) => project.id === id) ?? null;
}

/**
 * Insert or update a project in storage.
 *
 * @param project - The project to upsert. Must have a valid id.
 * @throws {TypeError} if project is null/undefined or has no id.
 */
export function upsertProject(project: EditorProject): EditorProject {
  if (!project || typeof project !== 'object') {
    throw new TypeError('upsertProject() requires a valid project object');
  }
  if (!project.id || typeof project.id !== 'string') {
    throw new TypeError('upsertProject() requires a project with a non-empty string id');
  }
  const nextProject = normalizeProject({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  const projects = readProjects();
  const index = projects.findIndex((item) => item.id === nextProject.id);

  if (index >= 0) {
    projects[index] = nextProject;
  } else {
    projects.push(nextProject);
  }

  writeProjects(projects);
  return cloneValue(nextProject);
}

/**
 * Delete a project by ID.
 *
 * @param projectId - The project ID to delete. Must be a non-empty string.
 * @throws {TypeError} if projectId is not a non-empty string.
 */
export function deleteProject(projectId: string): void {
  if (!projectId || typeof projectId !== 'string') {
    throw new TypeError('deleteProject() requires a non-empty string projectId');
  }
  const projects = readProjects().filter((project) => project.id !== projectId);
  writeProjects(projects);
}

/**
 * Export a project to a JSON string.
 *
 * @param projectOrId - Either a project object or a project ID string.
 * @throws {Error} if the project is not found.
 * @throws {TypeError} if projectOrId is an empty string.
 */
export function exportProject(projectOrId: EditorProject | string): string {
  if (typeof projectOrId === 'string' && !projectOrId.trim()) {
    throw new TypeError('exportProject() requires a non-empty string id');
  }
  const project = typeof projectOrId === 'string' ? getProject(projectOrId) : projectOrId;
  if (!project) {
    throw new Error('Project not found');
  }
  return JSON.stringify(normalizeProject(project), null, 2);
}

/**
 * Import a project from a JSON string.
 *
 * @param serialized - JSON string representing a project.
 * @throws {TypeError} if serialized is not a string.
 * @throws {SyntaxError} if serialized is not valid JSON.
 * @throws {Error} if the parsed data cannot be hydrated into a valid project.
 */
export function importProject(serialized: string): EditorProject {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new TypeError('importProject() requires a non-empty JSON string');
  }
  let parsed: Partial<EditorProject>;
  try {
    parsed = JSON.parse(serialized) as Partial<EditorProject>;
  } catch (err) {
    throw new SyntaxError(
      `importProject() failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('importProject() requires a JSON object, not an array or primitive');
  }
  return upsertProject(hydrateProject(parsed));
}

export function toProjectSummary(project: EditorProject): ProjectSummary {
  const meta = TEMPLATE_META[project.template];
  return {
    id: project.id,
    name: project.name,
    template: project.template,
    tags: [...project.tags],
    updatedAt: project.updatedAt,
    durationSeconds: getProjectDuration(project),
    members: Math.max(project.collaborators.length, 1),
    progress: project.progress,
    tokenBalance: project.tokenBalance,
    icon: meta.icon,
    color: meta.color,
    description: project.description,
    resolutionLabel: `${project.settings.width}x${project.settings.height} @ ${project.settings.frameRate}fps`,
  };
}
