import type { EditorMediaAsset, EditorProject } from '@mcua/core';

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

interface DesktopBridge {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  getMediaTools: () => Promise<MediaToolInfo>;
  openFile: (options?: unknown) => Promise<OpenDialogResult>;
  saveFile: (options?: unknown) => Promise<SaveDialogResult>;
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
  listDesktopJobs: () => Promise<DesktopJob[]>;
  startExportJob: (project: EditorProject) => Promise<DesktopJob>;
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, contents: string) => Promise<boolean>;
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
