import { contextBridge, ipcRenderer } from 'electron';

// ─── Typed subscription helper ──────────────────────────────────────────────────

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

// ─── Allowed IPC channels (security whitelist) ──────────────────────────────────

const ALLOWED_INVOKE_CHANNELS = new Set([
  'app:get-version',
  'app:get-platform',
  'app:version',
  'app:get-media-tools',
  'app:get-paths',
  'app:reveal-in-finder',
  'app:install-update',
  'dialog:open-file',
  'dialog:open',
  'dialog:save-file',
  'dialog:save',
  'gpu:info',
  'projects:list',
  'projects:get',
  'projects:save',
  'projects:delete',
  'projects:import-media',
  'projects:scan-media',
  'projects:relink-media',
  'projects:add-watch-folder',
  'projects:remove-watch-folder',
  'projects:rescan-watch-folders',
  'jobs:list',
  'jobs:start-export',
  'fs:read-text',
  'fs:write-text',
  'video-io:available',
  'video-io:enumerate',
  'video-io:start-capture',
  'video-io:stop-capture',
  'video-io:start-playback',
  'video-io:stop-playback',
  'video-io:send-frame',
  'video-io:device-status',
  'video-io:get-transport-buffer',
  'streaming:available',
  'streaming:start-ndi',
  'streaming:start-srt',
  'streaming:stop',
  'streaming:stop-all',
  'streaming:stats',
  'streaming:targets',
  'deck:available',
  'deck:list-ports',
  'deck:connect',
  'deck:disconnect',
  'deck:command',
  'deck:jog',
  'deck:shuttle',
  'deck:timecode',
  'deck:go-to-tc',
  'deck:connected-decks',
]);

const ALLOWED_SUBSCRIBE_CHANNELS = new Set([
  'menu:new-project',
  'menu:open-project',
  'menu:import-media',
  'menu:save',
  'menu:save-as',
  'menu:export',
  'menu:consolidate',
  'menu:preferences',
  'menu:keyboard-shortcuts',
  'menu:paste-insert',
  'menu:delete',
  'menu:ripple-delete',
  'menu:deselect-all',
  'menu:razor',
  'menu:split',
  'menu:lift',
  'menu:extract',
  'menu:toggle-link',
  'menu:group',
  'menu:ungroup',
  'menu:nest',
  'menu:match-frame',
  'menu:mark-in',
  'menu:mark-out',
  'menu:clear-marks',
  'menu:add-marker',
  'menu:next-marker',
  'menu:prev-marker',
  'menu:goto-in',
  'menu:goto-out',
  'menu:view-source',
  'menu:view-record',
  'menu:view-timeline',
  'menu:view-bins',
  'menu:view-effects',
  'desktop-job:updated',
  'video-io:frame-available',
  'streaming:stats-update',
  'deck:timecode-update',
  'deck:status-update',
  'app:update-available',
  'app:update-progress',
  'app:update-downloaded',
]);

/**
 * Validated invoke — only dispatches to whitelisted channels.
 */
function safeInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Validated subscribe — only listens on whitelisted channels.
 */
function safeSubscribe<Args extends unknown[]>(
  channel: string,
  callback: (...args: Args) => void,
): () => void {
  if (!ALLOWED_SUBSCRIBE_CHANNELS.has(channel)) {
    console.warn(`[Preload] Attempted subscription to disallowed channel: ${channel}`);
    return () => {};
  }
  return subscribe(channel, callback);
}

// ─── Secure API exposed to renderer ───────────────────────────────────────────

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion:  () => safeInvoke('app:get-version') as Promise<string>,
  getPlatform: () => safeInvoke('app:get-platform') as Promise<string>,
  getMediaTools: () => safeInvoke('app:get-media-tools') as Promise<unknown>,
  app: {
    getVersion: () => safeInvoke('app:version') as Promise<string>,
    platform: process.platform,
    getPaths: () => safeInvoke('app:get-paths') as Promise<Record<string, string>>,
    revealInFinder: (filePath: string) => safeInvoke('app:reveal-in-finder', filePath) as Promise<boolean>,
    installUpdate: () => safeInvoke('app:install-update') as Promise<void>,
  },
  gpu: {
    getInfo: () => safeInvoke('gpu:info'),
  },

  // Dialogs
  openFile: (opts?: Electron.OpenDialogOptions) =>
    safeInvoke('dialog:open-file', opts),
  saveFile: (opts?: Electron.SaveDialogOptions) =>
    safeInvoke('dialog:save-file', opts),
  dialog: {
    openFile: (options: Electron.OpenDialogOptions) => safeInvoke('dialog:open', options),
    saveFile: (options: Electron.SaveDialogOptions) => safeInvoke('dialog:save', options),
  },

  // Project CRUD
  listProjects: () =>
    safeInvoke('projects:list'),
  getProject: (projectId: string) =>
    safeInvoke('projects:get', projectId),
  saveProject: (project: unknown) =>
    safeInvoke('projects:save', project),
  deleteProject: (projectId: string) =>
    safeInvoke('projects:delete', projectId),
  importMedia: (projectId: string, filePaths: string[]) =>
    safeInvoke('projects:import-media', projectId, filePaths),
  scanProjectMedia: (projectId: string) =>
    safeInvoke('projects:scan-media', projectId),
  relinkProjectMedia: (projectId: string, searchRoots: string[]) =>
    safeInvoke('projects:relink-media', projectId, searchRoots),
  addWatchFolder: (projectId: string, folderPath: string) =>
    safeInvoke('projects:add-watch-folder', projectId, folderPath),
  removeWatchFolder: (projectId: string, watchFolderId: string) =>
    safeInvoke('projects:remove-watch-folder', projectId, watchFolderId),
  rescanWatchFolders: (projectId: string) =>
    safeInvoke('projects:rescan-watch-folders', projectId),
  listDesktopJobs: () =>
    safeInvoke('jobs:list'),
  startExportJob: (project: unknown) =>
    safeInvoke('jobs:start-export', project),
  readTextFile: (filePath: string) =>
    safeInvoke('fs:read-text', filePath) as Promise<string>,
  writeTextFile: (filePath: string, contents: string) =>
    safeInvoke('fs:write-text', filePath, contents) as Promise<boolean>,

  // ─── Video I/O (DeckLink, AJA) ────────────────────────────────────────
  videoIO: {
    available:      () => safeInvoke('video-io:available'),
    enumerate:      () => safeInvoke('video-io:enumerate'),
    startCapture:   (config: unknown) => safeInvoke('video-io:start-capture', config),
    stopCapture:    (deviceId: string) => safeInvoke('video-io:stop-capture', deviceId),
    startPlayback:  (config: unknown) => safeInvoke('video-io:start-playback', config),
    stopPlayback:   (deviceId: string) => safeInvoke('video-io:stop-playback', deviceId),
    sendFrame:      (deviceId: string, data: ArrayBuffer) => safeInvoke('video-io:send-frame', deviceId, data),
    deviceStatus:   (deviceId: string) => safeInvoke('video-io:device-status', deviceId),
    getTransportBuffer: (deviceId: string) => safeInvoke('video-io:get-transport-buffer', deviceId),
    onFrameAvailable: (cb: (info: unknown) => void) => safeSubscribe('video-io:frame-available', cb),
  },

  // ─── Streaming (NDI, SRT) ───────────────────────────────────────────
  streaming: {
    available:  () => safeInvoke('streaming:available'),
    startNDI:   (config: unknown) => safeInvoke('streaming:start-ndi', config),
    startSRT:   (config: unknown) => safeInvoke('streaming:start-srt', config),
    stop:       (targetId: string) => safeInvoke('streaming:stop', targetId),
    stopAll:    () => safeInvoke('streaming:stop-all'),
    stats:      () => safeInvoke('streaming:stats'),
    targets:    () => safeInvoke('streaming:targets'),
    onStatsUpdate: (cb: (stats: unknown) => void) => safeSubscribe('streaming:stats-update', cb),
  },

  // ─── Deck Control (Sony 9-pin RS-422) ───────────────────────────────
  deckControl: {
    available:     () => safeInvoke('deck:available'),
    listPorts:     () => safeInvoke('deck:list-ports'),
    connect:       (portPath: string) => safeInvoke('deck:connect', portPath),
    disconnect:    (deckId: string) => safeInvoke('deck:disconnect', deckId),
    command:       (deckId: string, cmd: string) => safeInvoke('deck:command', deckId, cmd),
    jog:           (deckId: string, speed: number) => safeInvoke('deck:jog', deckId, speed),
    shuttle:       (deckId: string, speed: number) => safeInvoke('deck:shuttle', deckId, speed),
    timecode:      (deckId: string) => safeInvoke('deck:timecode', deckId),
    goToTimecode:  (deckId: string, tc: unknown) => safeInvoke('deck:go-to-tc', deckId, tc),
    connectedDecks: () => safeInvoke('deck:connected-decks'),
    onTimecodeUpdate: (cb: (info: unknown) => void) => safeSubscribe('deck:timecode-update', cb),
    onStatusUpdate:   (cb: (info: unknown) => void) => safeSubscribe('deck:status-update', cb),
  },

  // ─── Menu event listeners ───────────────────────────────────────────
  onNewProject:  (cb: () => void) => safeSubscribe('menu:new-project', cb),
  onOpenProject: (cb: (path: string) => void) => safeSubscribe('menu:open-project', cb),
  onImportMedia: (cb: () => void) => safeSubscribe('menu:import-media', cb),
  onSave:        (cb: () => void) => safeSubscribe('menu:save', cb),
  onSaveAs:      (cb: () => void) => safeSubscribe('menu:save-as', cb),
  onExport:      (cb: () => void) => safeSubscribe('menu:export', cb),
  onConsolidate: (cb: () => void) => safeSubscribe('menu:consolidate', cb),
  onPreferences: (cb: () => void) => safeSubscribe('menu:preferences', cb),
  onDesktopJobUpdate: (cb: (job: unknown) => void) => safeSubscribe('desktop-job:updated', cb),

  // NLE-specific menu event listeners
  onMarkIn:     (cb: () => void) => safeSubscribe('menu:mark-in', cb),
  onMarkOut:    (cb: () => void) => safeSubscribe('menu:mark-out', cb),
  onClearMarks: (cb: () => void) => safeSubscribe('menu:clear-marks', cb),
  onAddMarker:  (cb: () => void) => safeSubscribe('menu:add-marker', cb),
  onRazor:      (cb: () => void) => safeSubscribe('menu:razor', cb),
  onSplit:      (cb: () => void) => safeSubscribe('menu:split', cb),
  onLift:       (cb: () => void) => safeSubscribe('menu:lift', cb),
  onExtract:    (cb: () => void) => safeSubscribe('menu:extract', cb),
  onMatchFrame: (cb: () => void) => safeSubscribe('menu:match-frame', cb),

  // Auto-update events
  onUpdateAvailable:  (cb: (info: { version: string }) => void) => safeSubscribe('app:update-available', cb),
  onUpdateProgress:   (cb: (info: { percent: number }) => void) => safeSubscribe('app:update-progress', cb),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => safeSubscribe('app:update-downloaded', cb),

  // Cleanup
  removeAllListeners: (channel: string) => {
    if (ALLOWED_SUBSCRIBE_CHANNELS.has(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});

// ─── TypeScript type declaration (for renderer) ────────────────────────────────
export type ElectronAPI = typeof window.electronAPI;
