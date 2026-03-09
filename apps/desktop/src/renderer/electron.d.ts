import type { EditorMediaAsset, EditorProject } from '@mcua/core';

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

interface IOResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

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

interface VideoIOBridge {
  available: () => Promise<IOResult<{ deckLink: boolean; aja: boolean }>>;
  enumerate: () => Promise<IOResult<unknown[]>>;
  startCapture: (config: unknown) => Promise<IOResult>;
  stopCapture: (deviceId: string) => Promise<IOResult>;
  startPlayback: (config: unknown) => Promise<IOResult>;
  stopPlayback: (deviceId: string) => Promise<IOResult>;
  sendFrame: (deviceId: string, data: ArrayBuffer) => Promise<IOResult>;
  deviceStatus: (deviceId: string) => Promise<IOResult>;
  getTransportBuffer: (deviceId: string) => Promise<SharedArrayBuffer | null>;
  onFrameAvailable: (cb: (info: unknown) => void) => () => void;
}

interface StreamingBridge {
  available: () => Promise<IOResult<{ ndi: boolean; srt: boolean }>>;
  startNDI: (config: unknown) => Promise<{ ok: boolean; targetId?: string; error?: string }>;
  startSRT: (config: unknown) => Promise<{ ok: boolean; targetId?: string; error?: string }>;
  stop: (targetId: string) => Promise<{ ok: boolean; error?: string }>;
  stopAll: () => Promise<{ ok: boolean }>;
  stats: () => Promise<IOResult<unknown[]>>;
  targets: () => Promise<IOResult<unknown[]>>;
  onStatsUpdate: (cb: (stats: unknown) => void) => () => void;
}

interface DeckControlBridge {
  available: () => Promise<IOResult<boolean>>;
  listPorts: () => Promise<IOResult<unknown[]>>;
  connect: (portPath: string) => Promise<{ ok: boolean; deckId?: string; error?: string }>;
  disconnect: (deckId: string) => Promise<{ ok: boolean; error?: string }>;
  command: (deckId: string, cmd: string) => Promise<{ ok: boolean; error?: string }>;
  jog: (deckId: string, speed: number) => Promise<{ ok: boolean; error?: string }>;
  shuttle: (deckId: string, speed: number) => Promise<{ ok: boolean; error?: string }>;
  timecode: (deckId: string) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
  goToTimecode: (deckId: string, tc: unknown) => Promise<{ ok: boolean; error?: string }>;
  connectedDecks: () => Promise<IOResult<Array<{ id: string; portPath: string; connected: boolean }>>>;
  onTimecodeUpdate: (cb: (info: unknown) => void) => () => void;
  onStatusUpdate: (cb: (info: unknown) => void) => () => void;
}

interface DesktopBridge {
  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getMediaTools: () => Promise<MediaToolInfo>;
  app: {
    getVersion: () => Promise<string>;
    platform: string;
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

  // Projects
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

  // Professional I/O subsystems
  videoIO: VideoIOBridge;
  streaming: StreamingBridge;
  deckControl: DeckControlBridge;

  // Menu event listeners
  onNewProject: (callback: () => void) => () => void;
  onOpenProject: (callback: (path: string) => void) => () => void;
  onImportMedia: (callback: () => void) => () => void;
  onSave: (callback: () => void) => () => void;
  onExport: (callback: () => void) => () => void;
  onDesktopJobUpdate: (callback: (job: DesktopJob) => void) => () => void;

  // Cleanup
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: DesktopBridge;
  }
}

export {};
