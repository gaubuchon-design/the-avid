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
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    platform: process.platform,
  },
  gpu: {
    getInfo: () => ipcRenderer.invoke('gpu:info'),
  },

  // Dialogs
  openFile: (opts?: Electron.OpenDialogOptions) =>
    ipcRenderer.invoke('dialog:open-file', opts),
  saveFile: (opts?: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save-file', opts),
  dialog: {
    openFile: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('dialog:open', options),
    saveFile: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:save', options),
  },
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

  // ─── Video I/O (DeckLink, AJA) ────────────────────────────────────────
  videoIO: {
    available:      () => ipcRenderer.invoke('video-io:available'),
    enumerate:      () => ipcRenderer.invoke('video-io:enumerate'),
    startCapture:   (config: unknown) => ipcRenderer.invoke('video-io:start-capture', config),
    stopCapture:    (deviceId: string) => ipcRenderer.invoke('video-io:stop-capture', deviceId),
    startPlayback:  (config: unknown) => ipcRenderer.invoke('video-io:start-playback', config),
    stopPlayback:   (deviceId: string) => ipcRenderer.invoke('video-io:stop-playback', deviceId),
    sendFrame:      (deviceId: string, data: ArrayBuffer) => ipcRenderer.invoke('video-io:send-frame', deviceId, data),
    deviceStatus:   (deviceId: string) => ipcRenderer.invoke('video-io:device-status', deviceId),
    getTransportBuffer: (deviceId: string) => ipcRenderer.invoke('video-io:get-transport-buffer', deviceId),
    onFrameAvailable: (cb: (info: unknown) => void) => subscribe('video-io:frame-available', cb),
  },

  // ─── Streaming (NDI, SRT) ───────────────────────────────────────────
  streaming: {
    available:  () => ipcRenderer.invoke('streaming:available'),
    startNDI:   (config: unknown) => ipcRenderer.invoke('streaming:start-ndi', config),
    startSRT:   (config: unknown) => ipcRenderer.invoke('streaming:start-srt', config),
    stop:       (targetId: string) => ipcRenderer.invoke('streaming:stop', targetId),
    stopAll:    () => ipcRenderer.invoke('streaming:stop-all'),
    stats:      () => ipcRenderer.invoke('streaming:stats'),
    targets:    () => ipcRenderer.invoke('streaming:targets'),
    onStatsUpdate: (cb: (stats: unknown) => void) => subscribe('streaming:stats-update', cb),
  },

  // ─── Deck Control (Sony 9-pin RS-422) ───────────────────────────────
  deckControl: {
    available:     () => ipcRenderer.invoke('deck:available'),
    listPorts:     () => ipcRenderer.invoke('deck:list-ports'),
    connect:       (portPath: string) => ipcRenderer.invoke('deck:connect', portPath),
    disconnect:    (deckId: string) => ipcRenderer.invoke('deck:disconnect', deckId),
    command:       (deckId: string, cmd: string) => ipcRenderer.invoke('deck:command', deckId, cmd),
    jog:           (deckId: string, speed: number) => ipcRenderer.invoke('deck:jog', deckId, speed),
    shuttle:       (deckId: string, speed: number) => ipcRenderer.invoke('deck:shuttle', deckId, speed),
    timecode:      (deckId: string) => ipcRenderer.invoke('deck:timecode', deckId),
    goToTimecode:  (deckId: string, tc: unknown) => ipcRenderer.invoke('deck:go-to-tc', deckId, tc),
    connectedDecks: () => ipcRenderer.invoke('deck:connected-decks'),
    onTimecodeUpdate: (cb: (info: unknown) => void) => subscribe('deck:timecode-update', cb),
    onStatusUpdate:   (cb: (info: unknown) => void) => subscribe('deck:status-update', cb),
  },

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
