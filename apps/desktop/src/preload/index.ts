import { contextBridge, ipcRenderer } from 'electron';

function subscribe<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, ...args: Args) => {
    callback(...args);
  };

  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// ─── Secure API exposed to renderer ───────────────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion:  () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
  getMediaTools: () => ipcRenderer.invoke('app:get-media-tools'),

  // Dialogs
  openFile: (opts?: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open-file', opts),
  saveFile: (opts?: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save-file', opts),
  listProjects: () =>
    ipcRenderer.invoke('projects:list'),
  getProject: (projectId: string) =>
    ipcRenderer.invoke('projects:get', projectId),
  saveProject: (project: unknown) =>
    ipcRenderer.invoke('projects:save', project),
  deleteProject: (projectId: string) =>
    ipcRenderer.invoke('projects:delete', projectId),
  importMedia: (projectId: string, filePaths: string[]) =>
    ipcRenderer.invoke('projects:import-media', projectId, filePaths),
  scanProjectMedia: (projectId: string) =>
    ipcRenderer.invoke('projects:scan-media', projectId),
  relinkProjectMedia: (projectId: string, searchRoots: string[]) =>
    ipcRenderer.invoke('projects:relink-media', projectId, searchRoots),
  addWatchFolder: (projectId: string, folderPath: string) =>
    ipcRenderer.invoke('projects:add-watch-folder', projectId, folderPath),
  removeWatchFolder: (projectId: string, watchFolderId: string) =>
    ipcRenderer.invoke('projects:remove-watch-folder', projectId, watchFolderId),
  rescanWatchFolders: (projectId: string) =>
    ipcRenderer.invoke('projects:rescan-watch-folders', projectId),
  listDesktopJobs: () =>
    ipcRenderer.invoke('jobs:list'),
  startExportJob: (project: unknown) =>
    ipcRenderer.invoke('jobs:start-export', project),
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke('fs:read-text', filePath),
  writeTextFile: (filePath: string, contents: string) =>
    ipcRenderer.invoke('fs:write-text', filePath, contents),

  // Menu event listeners
  onNewProject:  (cb: () => void) => subscribe('menu:new-project', cb),
  onOpenProject: (cb: (path: string) => void) => subscribe('menu:open-project', cb),
  onImportMedia: (cb: () => void) => subscribe('menu:import-media', cb),
  onSave:        (cb: () => void) => subscribe('menu:save', cb),
  onExport:      (cb: () => void) => subscribe('menu:export', cb),
  onDesktopJobUpdate: (cb: (job: unknown) => void) => subscribe('desktop-job:updated', cb),

  // Cleanup
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
});

// ─── TypeScript type declaration (for renderer) ────────────────────────────────
export type ElectronAPI = typeof window.electronAPI;
