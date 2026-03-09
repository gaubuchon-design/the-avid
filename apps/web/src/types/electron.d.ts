import type { EditorMediaAsset, EditorProject } from '@mcua/core';

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
  importMedia: (projectId: string, filePaths: string[]) => Promise<EditorMediaAsset[]>;
  scanProjectMedia: (projectId: string) => Promise<EditorProject | null>;
  relinkProjectMedia: (projectId: string, searchRoots: string[]) => Promise<RelinkResult>;

  // ─── Watch Folders ────────────────────────────────────────────────────────
  addWatchFolder: (projectId: string, folderPath: string) => Promise<EditorProject | null>;
  removeWatchFolder: (projectId: string, watchFolderId: string) => Promise<EditorProject | null>;
  rescanWatchFolders: (projectId: string) => Promise<EditorProject | null>;

  // ─── Jobs ─────────────────────────────────────────────────────────────────
  listDesktopJobs: () => Promise<DesktopJob[]>;
  startExportJob: (project: EditorProject) => Promise<DesktopJob>;

  // ─── File I/O ─────────────────────────────────────────────────────────────
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, contents: string) => Promise<boolean>;

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
