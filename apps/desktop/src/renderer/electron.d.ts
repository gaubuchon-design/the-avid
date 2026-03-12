import type {
  EditorMediaAsset,
  EditorProject,
  FrameRange,
  PlaybackStreamDescriptor,
  PlaybackTelemetry,
  TimelineRenderSnapshot,
} from '@mcua/core';

// ─── Dialog Types ─────────────────────────────────────────────────────────────

/** File filter for open/save dialogs (mirrors Electron.FileFilter) */
interface FileFilter {
  name: string;
  extensions: string[];
}

/** Options for opening file dialogs (mirrors Electron.OpenDialogOptions) */
interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: FileFilter[];
  properties?: Array<
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
    | 'showHiddenFiles'
    | 'createDirectory'
    | 'promptToCreate'
    | 'noResolveAliases'
    | 'treatPackageAsDirectory'
    | 'dontAddToRecent'
  >;
  message?: string;
}

/** Options for save dialogs (mirrors Electron.SaveDialogOptions) */
interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
  filters?: FileFilter[];
  message?: string;
  nameFieldLabel?: string;
  showsTagField?: boolean;
  properties?: Array<
    | 'showHiddenFiles'
    | 'createDirectory'
    | 'treatPackageAsDirectory'
    | 'showOverwriteConfirmation'
    | 'dontAddToRecent'
  >;
}

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

// ─── Job Types ────────────────────────────────────────────────────────────────

interface DesktopJob {
  id: string;
  kind: 'INGEST' | 'EXPORT';
  projectId: string;
  label: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  startedAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
}

// ─── Media Types ──────────────────────────────────────────────────────────────

interface RelinkResult {
  project: EditorProject | null;
  relinkedCount: number;
  missingCount: number;
  scannedFiles: number;
}

interface MediaToolInfo {
  ffmpeg: string | null;
  ffprobe: string | null;
}

interface ExportTranscodeRequest {
  jobId: string;
  sourceArtifact: Uint8Array;
  sourceContainer: string;
  targetContainer: string;
  targetVideoCodec?: string;
  targetAudioCodec?: string;
  fps?: number;
  width?: number;
  height?: number;
}

interface ExportTranscodeResult {
  outputPath: string;
  outputContainer: string;
  outputVideoCodec: string;
  outputAudioCodec?: string;
}

// ─── App Types ────────────────────────────────────────────────────────────────

interface AppPaths {
  userData: string;
  logs: string;
  temp: string;
  documents: string;
}

// ─── Video I/O Types ──────────────────────────────────────────────────────────

interface IOResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface VideoDevice {
  id: string;
  name: string;
  vendor: 'blackmagic' | 'aja' | 'unknown';
  model: string;
  index: number;
  supportsCapture: boolean;
  supportsPlayback: boolean;
  isActive: boolean;
}

interface VideoIOAvailability {
  deckLink: boolean;
  aja: boolean;
}

// ─── Streaming Types ──────────────────────────────────────────────────────────

interface StreamingAvailability {
  ndi: boolean;
  srt: boolean;
}

interface StreamStats {
  protocol: 'ndi' | 'srt';
  state: 'idle' | 'connecting' | 'streaming' | 'error';
  framesSent: number;
  bytesSent: number;
  bitrate: number;
  rtt?: number;
  packetLoss?: number;
  uptime: number;
}

// ─── Deck Control Types ───────────────────────────────────────────────────────

interface DeckTimecode {
  hours: number;
  minutes: number;
  seconds: number;
  frames: number;
  dropFrame: boolean;
}

interface ConnectedDeck {
  id: string;
  portPath: string;
  connected: boolean;
}

// ─── GPU / Hardware Types ─────────────────────────────────────────────────────

interface GPUInfo {
  vendor: 'nvidia' | 'amd' | 'intel' | 'apple' | 'unknown';
  renderer: string;
  driverVersion: string;
  hasHardwareEncode: boolean;
  hasHardwareDecode: boolean;
  hasCUDA: boolean;
  hasOpenCL: boolean;
  vram: number;
  supportedCodecs: {
    encode: string[];
    decode: string[];
  };
}

interface HWAccelSettings {
  enabled: boolean;
  preferHardwareDecode: boolean;
  preferHardwareEncode: boolean;
  forceGPU: 'auto' | 'nvidia' | 'amd' | 'intel' | 'apple' | 'software';
}

interface SystemResources {
  cpuModel: string;
  cpuCount: number;
  totalMemoryMB: number;
  freeMemoryMB: number;
  platform: string;
  release: string;
  arch: string;
  uptime: number;
}

interface DisplayInfo {
  id: number;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  rotation: number;
  internal: boolean;
  colorSpace: string;
  size: { width: number; height: number };
}

interface AutoSaveStatus {
  dirtyCount: number;
  dirtyIds: string[];
  intervalMs: number;
}

interface RenderAccelResult {
  gpu: GPUInfo;
  ffmpegArgs: string[];
}

interface ParityPlaybackTransportView {
  buffer: SharedArrayBuffer;
  width: number;
  height: number;
  bytesPerPixel: number;
  slots: number;
}

interface ParityPlaybackTransportDescriptor {
  transportHandle: string;
  view: ParityPlaybackTransportView;
}

// ─── Desktop Bridge Interface ─────────────────────────────────────────────────

interface DesktopBridge {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getMediaTools: () => Promise<MediaToolInfo>;
  app: {
    getVersion: () => Promise<string>;
    platform: string;
    getPaths: () => Promise<AppPaths>;
    revealInFinder: (filePath: string) => Promise<boolean>;
    downloadUpdate: () => Promise<boolean>;
    checkForUpdates: () => Promise<unknown>;
    installUpdate: () => Promise<void>;
  };
  gpu: {
    getInfo: () => Promise<GPUInfo>;
  };

  // Dialogs
  openFile: (options?: OpenDialogOptions) => Promise<OpenDialogResult>;
  saveFile: (options?: SaveDialogOptions) => Promise<SaveDialogResult>;
  dialog: {
    openFile: (options: OpenDialogOptions) => Promise<OpenDialogResult>;
    saveFile: (options: SaveDialogOptions) => Promise<SaveDialogResult>;
  };

  // Project CRUD
  listProjects: () => Promise<EditorProject[]>;
  getProject: (projectId: string) => Promise<EditorProject | null>;
  saveProject: (project: EditorProject) => Promise<EditorProject>;
  deleteProject: (projectId: string) => Promise<boolean>;
  importMedia: (projectId: string, filePaths: string[], binId?: string) => Promise<EditorMediaAsset[]>;
  scanProjectMedia: (projectId: string) => Promise<EditorProject | null>;
  relinkProjectMedia: (projectId: string, searchRoots: string[]) => Promise<RelinkResult>;
  addWatchFolder: (projectId: string, folderPath: string) => Promise<EditorProject | null>;
  removeWatchFolder: (projectId: string, watchFolderId: string) => Promise<EditorProject | null>;
  rescanWatchFolders: (projectId: string) => Promise<EditorProject | null>;

  // Jobs
  listDesktopJobs: () => Promise<DesktopJob[]>;
  startExportJob: (project: EditorProject) => Promise<DesktopJob>;
  transcodeExportArtifact: (payload: ExportTranscodeRequest) => Promise<ExportTranscodeResult>;

  // File system
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, contents: string) => Promise<boolean>;

  // Auto-save / dirty tracking
  markProjectDirty: (projectId: string) => Promise<boolean>;
  getAutoSaveStatus: () => Promise<AutoSaveStatus>;

  // Render dispatch
  render: {
    getGPUAccelArgs: (codec: string) => Promise<RenderAccelResult>;
    getDecodeArgs: () => Promise<RenderAccelResult>;
  };

  // Hardware info
  hardware: {
    getSystemResources: () => Promise<SystemResources>;
    getDisplays: () => Promise<DisplayInfo[]>;
    getHWAccelSettings: () => Promise<HWAccelSettings>;
    saveHWAccelSettings: (settings: HWAccelSettings) => Promise<HWAccelSettings>;
  };

  // File drag & drop helpers
  filterDroppableFiles: (filePaths: string[]) => Promise<string[]>;

  // Video I/O (DeckLink, AJA)
  videoIO: {
    available: () => Promise<IOResult<VideoIOAvailability>>;
    enumerate: () => Promise<IOResult<VideoDevice[]>>;
    startCapture: (config: unknown) => Promise<IOResult>;
    stopCapture: (deviceId: string) => Promise<IOResult>;
    startPlayback: (config: unknown) => Promise<IOResult>;
    stopPlayback: (deviceId: string) => Promise<IOResult>;
    sendFrame: (deviceId: string, data: ArrayBuffer) => Promise<IOResult>;
    deviceStatus: (deviceId: string) => Promise<IOResult>;
    getTransportBuffer: (deviceId: string) => Promise<SharedArrayBuffer | null>;
    onFrameAvailable: (cb: (info: unknown) => void) => () => void;
  };

  parityPlayback: {
    syncProject: (project: EditorProject) => Promise<boolean>;
    createTransport: (request: {
      project: EditorProject;
      snapshot?: TimelineRenderSnapshot;
      sequenceId?: string;
      revisionId?: string;
    }) => Promise<ParityPlaybackTransportDescriptor>;
    getTransportView: (transportHandle: string) => Promise<ParityPlaybackTransportView>;
    attachStreams: (transportHandle: string, streams: PlaybackStreamDescriptor[]) => Promise<boolean>;
    preroll: (transportHandle: string, range: FrameRange) => Promise<boolean>;
    start: (transportHandle: string, frame: number) => Promise<boolean>;
    stop: (transportHandle: string) => Promise<boolean>;
    releaseTransport: (transportHandle: string) => Promise<boolean>;
    play: (transportHandle: string, frame: number, playbackRate?: number) => Promise<boolean>;
    syncFrame: (transportHandle: string, frame: number) => Promise<boolean>;
    getTelemetry: (transportHandle: string) => Promise<PlaybackTelemetry>;
    attachOutputDevice: (transportHandle: string, config: unknown) => Promise<boolean>;
    detachOutputDevice: (transportHandle: string, deviceId?: string) => Promise<boolean>;
    invalidateCaches: (projectId: string) => Promise<boolean>;
  };

  // Streaming (NDI, SRT)
  streaming: {
    available: () => Promise<IOResult<StreamingAvailability>>;
    startNDI: (config: unknown) => Promise<{ ok: boolean; targetId?: string; error?: string }>;
    startSRT: (config: unknown) => Promise<{ ok: boolean; targetId?: string; error?: string }>;
    stop: (targetId: string) => Promise<{ ok: boolean; error?: string }>;
    stopAll: () => Promise<{ ok: boolean }>;
    stats: () => Promise<IOResult<StreamStats[]>>;
    targets: () => Promise<IOResult<unknown[]>>;
    onStatsUpdate: (cb: (stats: unknown) => void) => () => void;
  };

  // Deck Control (Sony 9-pin)
  deckControl: {
    available: () => Promise<IOResult<boolean>>;
    listPorts: () => Promise<IOResult<unknown[]>>;
    connect: (portPath: string) => Promise<{ ok: boolean; deckId?: string; error?: string }>;
    disconnect: (deckId: string) => Promise<{ ok: boolean; error?: string }>;
    command: (deckId: string, cmd: string) => Promise<{ ok: boolean; error?: string }>;
    jog: (deckId: string, speed: number) => Promise<{ ok: boolean; error?: string }>;
    shuttle: (deckId: string, speed: number) => Promise<{ ok: boolean; error?: string }>;
    timecode: (deckId: string) => Promise<{ ok: boolean; data?: DeckTimecode; error?: string }>;
    goToTimecode: (deckId: string, tc: DeckTimecode) => Promise<{ ok: boolean; error?: string }>;
    connectedDecks: () => Promise<IOResult<ConnectedDeck[]>>;
    onTimecodeUpdate: (cb: (info: unknown) => void) => () => void;
    onStatusUpdate: (cb: (info: unknown) => void) => () => void;
  };

  // Menu event listeners
  onNewProject: (callback: () => void) => () => void;
  onOpenProject: (callback: (path: string) => void) => () => void;
  onImportMedia: (callback: () => void) => () => void;
  onSave: (callback: () => void) => () => void;
  onSaveAs: (callback: () => void) => () => void;
  onExport: (callback: () => void) => () => void;
  onConsolidate: (callback: () => void) => () => void;
  onPreferences: (callback: () => void) => () => void;
  onDesktopJobUpdate: (callback: (job: DesktopJob) => void) => () => void;

  // NLE menu events
  onMarkIn: (callback: () => void) => () => void;
  onMarkOut: (callback: () => void) => () => void;
  onClearMarks: (callback: () => void) => () => void;
  onAddMarker: (callback: () => void) => () => void;
  onNextMarker: (callback: () => void) => () => void;
  onPrevMarker: (callback: () => void) => () => void;
  onGotoIn: (callback: () => void) => () => void;
  onGotoOut: (callback: () => void) => () => void;
  onRazor: (callback: () => void) => () => void;
  onSplit: (callback: () => void) => () => void;
  onLift: (callback: () => void) => () => void;
  onExtract: (callback: () => void) => () => void;
  onToggleLink: (callback: () => void) => () => void;
  onGroup: (callback: () => void) => () => void;
  onUngroup: (callback: () => void) => () => void;
  onNest: (callback: () => void) => () => void;
  onMatchFrame: (callback: () => void) => () => void;

  // Edit menu events
  onPasteInsert: (callback: () => void) => () => void;
  onDelete: (callback: () => void) => () => void;
  onRippleDelete: (callback: () => void) => () => void;
  onDeselectAll: (callback: () => void) => () => void;

  // View panel events
  onViewSource: (callback: () => void) => () => void;
  onViewRecord: (callback: () => void) => () => void;
  onViewTimeline: (callback: () => void) => () => void;
  onViewBins: (callback: () => void) => () => void;
  onViewEffects: (callback: () => void) => () => void;

  // Keyboard shortcuts
  onKeyboardShortcuts: (callback: () => void) => () => void;

  // Auto-update events
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateProgress: (callback: (info: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;

  // Deep link events
  onDeepLink: (callback: (url: string) => void) => () => void;

  // Theme change events
  onThemeChanged: (callback: (info: { shouldUseDarkColors: boolean; themeSource: string }) => void) => () => void;

  // Cleanup
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: DesktopBridge;
  }
}

export {};
