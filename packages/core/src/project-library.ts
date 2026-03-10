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
  videoCodec?: string;
  audioCodec?: string;
  durationSeconds?: number;
  frameRate?: number;
  width?: number;
  height?: number;
  audioChannels?: number;
  sampleRate?: number;
  bitRate?: number;
  timecodeStart?: string;
  reelName?: string;
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

export interface EditorProjectSettings {
  frameRate: number;
  width: number;
  height: number;
  sampleRate: number;
  exportFormat: 'mp4' | 'mov' | 'webm' | 'mp3' | 'wav' | 'aiff';
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
  reviewComments: EditorReviewComment[];
  approvals: EditorApproval[];
  publishJobs: EditorPublishJob[];
  watchFolders: EditorWatchFolder[];
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

function normalizeMediaAsset(asset: EditorMediaAsset): EditorMediaAsset {
  const waveformPeaks = asset.waveformMetadata?.peaks ?? asset.waveformData ?? [];
  const technicalMetadata = asset.technicalMetadata
    ? {
        ...asset.technicalMetadata,
        durationSeconds: asset.technicalMetadata.durationSeconds ?? asset.duration,
      }
    : asset.duration
    ? { durationSeconds: asset.duration }
    : undefined;
  const playbackUrl = asset.proxyMetadata?.status === 'READY'
    ? asset.proxyMetadata.playbackUrl ?? asset.playbackUrl ?? asset.locations?.playbackUrl
    : asset.playbackUrl ?? asset.locations?.playbackUrl;
  const fileNameStem = asset.name.replace(/\.[a-z0-9]+$/i, '');

  return {
    ...asset,
    duration: asset.duration ?? technicalMetadata?.durationSeconds,
    playbackUrl,
    waveformData: [...waveformPeaks],
    fileExtension: asset.fileExtension,
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
          pathHistory: uniqueList(asset.locations.pathHistory ?? []),
        }
      : undefined,
    fingerprint: asset.fingerprint ? { ...asset.fingerprint } : undefined,
    technicalMetadata,
    relinkIdentity: asset.relinkIdentity
      ? {
          ...asset.relinkIdentity,
          normalizedName: asset.relinkIdentity.normalizedName || normalizeAssetName(asset.name),
          sourceFileStem: asset.relinkIdentity.sourceFileStem || fileNameStem,
          lastKnownPaths: uniqueList(asset.relinkIdentity.lastKnownPaths ?? []),
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

function createTemplateBins(template: ProjectTemplate): EditorBin[] {
  const rootColor = TEMPLATE_META[template].color;
  const rushesAssets: EditorMediaAsset[] = [
    { id: generateId('asset'), name: 'Scene 01 - Take 01', type: 'VIDEO', duration: 45.2, status: 'READY', tags: ['dialogue'], isFavorite: true },
    { id: generateId('asset'), name: 'Scene 01 - Take 02', type: 'VIDEO', duration: 48.7, status: 'READY', tags: ['dialogue'], isFavorite: false },
    { id: generateId('asset'), name: template === 'sports' ? 'Goal Cam - Wide' : 'Scene 02 - Insert', type: 'VIDEO', duration: 22.1, status: 'READY', tags: template === 'sports' ? ['action'] : ['insert'], isFavorite: false },
  ];

  const secondaryAssets: EditorMediaAsset[] = [
    { id: generateId('asset'), name: template === 'documentary' ? 'Interview Selects' : 'B-Roll City', type: 'VIDEO', duration: 67.5, status: 'READY', tags: ['selects'], isFavorite: false },
    { id: generateId('asset'), name: template === 'social' ? 'Vertical Hero Shot' : 'Close-up Alt', type: 'VIDEO', duration: 31.2, status: 'READY', tags: ['coverage'], isFavorite: false },
  ];

  const musicAssets: EditorMediaAsset[] = [
    { id: generateId('asset'), name: template === 'podcast' ? 'Theme Sting' : 'Main Theme', type: 'AUDIO', duration: 180, status: 'READY', tags: ['music'], isFavorite: true, waveformData: createWaveform(120, 5) },
    { id: generateId('asset'), name: template === 'sports' ? 'Crowd Lift' : 'Tension Bed', type: 'AUDIO', duration: 90, status: 'READY', tags: ['music'], isFavorite: false, waveformData: createWaveform(120, 18) },
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
        { id: generateId('asset'), name: 'Title Card', type: 'IMAGE', status: 'READY', tags: ['graphics'], isFavorite: false },
        { id: generateId('asset'), name: 'Lower Third', type: 'IMAGE', status: 'READY', tags: ['graphics'], isFavorite: false },
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
    };
  });
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
    const bin = stack.pop()!;
    const assets = bin.assets;
    if (assets && assets.length > 0) {
      for (let i = 0; i < assets.length; i++) {
        result.push(assets[i]!);
      }
    }
    const children = bin.children;
    if (children && children.length > 0) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]!);
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
  for (let t = 0; t < tracks.length; t++) {
    const clips = tracks[t]!.clips ?? [];
    for (let c = 0; c < clips.length; c++) {
      const endTime = clips[c]!.endTime;
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
    activeWorkspaceId: 'source-record',
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
    },
    tracks: cloneValue(project.tracks ?? []),
    markers: cloneValue(project.markers ?? []),
    bins: normalizeBins(project.bins ?? []),
    collaborators: cloneValue(project.collaborators ?? []),
    aiJobs: cloneValue(project.aiJobs ?? []),
    transcript: cloneValue(project.transcript ?? []),
    reviewComments: cloneValue(project.reviewComments ?? []),
    approvals: cloneValue(project.approvals ?? []),
    publishJobs: cloneValue(project.publishJobs ?? []),
    watchFolders: cloneValue(project.watchFolders ?? []),
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
      activeWorkspaceId: workstationState.activeWorkspaceId ?? 'source-record',
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
    },
    tracks,
    markers: project.markers ?? [],
    bins,
    collaborators: project.collaborators ?? [],
    aiJobs: project.aiJobs ?? [],
    transcript: project.transcript ?? createTranscriptCues(bins, template),
    reviewComments: project.reviewComments ?? createReviewComments(template),
    approvals: project.approvals ?? createApprovals(),
    publishJobs: project.publishJobs ?? createPublishJobs(template),
    watchFolders: project.watchFolders ?? [],
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
      activeWorkspaceId: 'source-record',
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
  const meta = TEMPLATE_META[template];
  const bins = createTemplateBins(template);
  const tracks = seedTracksFromBins(createTemplateTracks(template), bins);
  const transcript = createTranscriptCues(bins, template);
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
    progress: Math.max(18, Math.min(100, Math.round(getProjectDuration({ tracks }) * 2))),
    settings: {
      frameRate: meta.resolution.frameRate,
      width: meta.resolution.width,
      height: meta.resolution.height,
      sampleRate: 48000,
      exportFormat: template === 'podcast' ? 'wav' : 'mov',
    },
    tracks,
    markers: [
      { id: generateId('marker'), time: 8.5, label: 'Beat marker', color: '#f59e0b' },
      { id: generateId('marker'), time: 22, label: 'Revision point', color: '#ef4444' },
    ],
    bins,
    collaborators: [
      { id: generateId('user'), displayName: 'Sarah K.', color: '#7c5cfc' },
      { id: generateId('user'), displayName: 'Marcus T.', color: '#25a865' },
    ],
    aiJobs: [],
    transcript,
    reviewComments: createReviewComments(template),
    approvals: createApprovals(),
    publishJobs: createPublishJobs(template),
    watchFolders: [],
    tokenBalance: template === 'sports' ? 620 : 487,
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
      activeWorkspaceId: 'source-record',
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

export function buildSeedProjectLibrary(): EditorProject[] {
  return [
    buildProject({ name: 'Demo Feature Film', template: 'film' }),
    buildProject({ name: 'Brand Campaign Q4', template: 'commercial' }),
    buildProject({ name: 'Documentary: City Life', template: 'documentary' }),
    buildProject({ name: 'Sports Highlights Reel', template: 'sports' }),
    buildProject({ name: 'Podcast Episode 24', template: 'podcast' }),
  ];
}

export function createProject(options: CreateProjectOptions = {}): EditorProject {
  return upsertProject(buildProject(options));
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
