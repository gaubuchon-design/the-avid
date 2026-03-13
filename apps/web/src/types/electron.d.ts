import type {
  EditorMediaAsset,
  EditorProject,
  FrameRange,
  PlaybackStreamDescriptor,
  PlaybackTelemetry,
  TimelineRenderSnapshot,
} from '@mcua/core';

/** File filter for open/save dialogs (mirrors Electron.FileFilter) */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** Options for opening file dialogs (mirrors Electron.OpenDialogOptions) */
export interface OpenDialogOptions {
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
export interface SaveDialogOptions {
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

export interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export type DesktopJobKind = 'INGEST' | 'EXPORT';
export type DesktopJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface DesktopJob {
  id: string;
  kind: DesktopJobKind;
  projectId: string;
  label: string;
  status: DesktopJobStatus;
  /** Progress percentage 0-100 */
  progress: number;
  startedAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
}

export interface RelinkResult {
  project: EditorProject | null;
  relinkedCount: number;
  missingCount: number;
  scannedFiles: number;
}

export interface MediaToolInfo {
  ffmpeg: string | null;
  ffprobe: string | null;
}

export interface ExportTranscodeRequest {
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

export interface ExportTranscodeResult {
  outputPath: string;
  outputContainer: string;
  outputVideoCodec: string;
  outputAudioCodec?: string;
}

export interface DesktopParityPlaybackTransportView {
  buffer: SharedArrayBuffer;
  width: number;
  height: number;
  bytesPerPixel: number;
  slots: number;
}

export interface DesktopParityPlaybackTransportDescriptor {
  transportHandle: string;
  view: DesktopParityPlaybackTransportView;
}

export interface DesktopParityAudioMonitorPreviewState {
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

export interface DesktopBridge {
  // ─── System ───────────────────────────────────────────────────────────────
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getMediaTools: () => Promise<MediaToolInfo>;

  // ─── File Dialogs ─────────────────────────────────────────────────────────
  openFile: (options?: OpenDialogOptions) => Promise<OpenDialogResult>;
  saveFile: (options?: SaveDialogOptions) => Promise<SaveDialogResult>;

  // ─── Projects ─────────────────────────────────────────────────────────────
  listProjects: () => Promise<EditorProject[]>;
  getProject: (projectId: string) => Promise<EditorProject | null>;
  saveProject: (project: EditorProject) => Promise<EditorProject>;
  deleteProject: (projectId: string) => Promise<boolean>;

  // ─── Media ────────────────────────────────────────────────────────────────
  importMedia: (projectId: string, filePaths: string[], binId?: string) => Promise<EditorMediaAsset[]>;
  scanProjectMedia: (projectId: string) => Promise<EditorProject | null>;
  relinkProjectMedia: (projectId: string, searchRoots: string[]) => Promise<RelinkResult>;

  // ─── Watch Folders ────────────────────────────────────────────────────────
  addWatchFolder: (projectId: string, folderPath: string) => Promise<EditorProject | null>;
  removeWatchFolder: (projectId: string, watchFolderId: string) => Promise<EditorProject | null>;
  rescanWatchFolders: (projectId: string) => Promise<EditorProject | null>;

  // ─── Jobs ─────────────────────────────────────────────────────────────────
  listDesktopJobs: () => Promise<DesktopJob[]>;
  startExportJob: (project: EditorProject) => Promise<DesktopJob>;
  transcodeExportArtifact: (payload: ExportTranscodeRequest) => Promise<ExportTranscodeResult>;

  // ─── File I/O ─────────────────────────────────────────────────────────────
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, contents: string) => Promise<boolean>;

  // ─── Desktop Parity Playback ──────────────────────────────────────────────
  parityPlayback?: {
    syncProject: (project: EditorProject) => Promise<boolean>;
    createTransport: (request: {
      project: EditorProject;
      snapshot?: TimelineRenderSnapshot;
      sequenceId?: string;
      revisionId?: string;
    }) => Promise<DesktopParityPlaybackTransportDescriptor>;
    getTransportView: (transportHandle: string) => Promise<DesktopParityPlaybackTransportView>;
    getAudioMonitorPreview: (transportHandle: string) => Promise<DesktopParityAudioMonitorPreviewState | null>;
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

  // ─── IPC Events ───────────────────────────────────────────────────────────
  onNewProject: (callback: () => void) => () => void;
  onOpenProject: (callback: (path: string) => void) => () => void;
  onImportMedia: (callback: () => void) => () => void;
  onSave: (callback: () => void) => () => void;
  onExport: (callback: () => void) => () => void;
  onDesktopJobUpdate: (callback: (job: DesktopJob) => void) => () => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: DesktopBridge;
  }
}

export {};
