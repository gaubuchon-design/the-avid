import type { EditorMediaAsset, EditorProject } from '@mcua/core';

// ─── Dialog Types ─────────────────────────────────────────────────────────────

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
    installUpdate: () => Promise<void>;
  };
  gpu: {
    getInfo: () => Promise<unknown>;
  };

  // Dialogs
  openFile: (options?: unknown) => Promise<OpenDialogResult>;
  saveFile: (options?: unknown) => Promise<SaveDialogResult>;
  dialog: {
    openFile: (options: unknown) => Promise<OpenDialogResult>;
    saveFile: (options: unknown) => Promise<SaveDialogResult>;
  };

  // Project CRUD
  listProjects: () => Promise<EditorProject[]>;
  getProject: (projectId: string) => Promise<EditorProject | null>;
  saveProject: (project: EditorProject) => Promise<EditorProject>;
  deleteProject: (projectId: string) => Promise<boolean>;
  importMedia: (projectId: string, filePaths: string[]) => Promise<EditorMediaAsset[]>;
  scanProjectMedia: (projectId: string) => Promise<EditorProject | null>;
  relinkProjectMedia: (projectId: string, searchRoots: string[]) => Promise<RelinkResult>;
  addWatchFolder: (projectId: string, folderPath: string) => Promise<EditorProject | null>;
  removeWatchFolder: (projectId: string, watchFolderId: string) => Promise<EditorProject | null>;
  rescanWatchFolders: (projectId: string) => Promise<EditorProject | null>;

  // Jobs
  listDesktopJobs: () => Promise<DesktopJob[]>;
  startExportJob: (project: EditorProject) => Promise<DesktopJob>;

  // File system
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, contents: string) => Promise<boolean>;

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
  onRazor: (callback: () => void) => () => void;
  onSplit: (callback: () => void) => () => void;
  onLift: (callback: () => void) => () => void;
  onExtract: (callback: () => void) => () => void;
  onMatchFrame: (callback: () => void) => () => void;

  // Auto-update events
  onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateProgress: (callback: (info: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => () => void;

  // Cleanup
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: DesktopBridge;
  }
}

export {};
