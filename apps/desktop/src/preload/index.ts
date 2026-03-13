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
  // App info
  'app:get-version',
  'app:get-platform',
  'app:version',
  'app:get-media-tools',
  'app:get-paths',
  'app:reveal-in-finder',
  'app:download-update',
  'app:check-for-updates',
  'app:install-update',
  'app:notify',
  'app:get-theme',
  'app:set-theme',
  'app:confirm-discard',
  'app:get-dropped-file-info',
  'app:system-info',
  'app:filter-droppable-files',

  // Dialogs
  'dialog:open-file',
  'dialog:open',
  'dialog:save-file',
  'dialog:save',

  // GPU / Hardware acceleration
  'gpu:info',
  'hw-accel:get-settings',
  'hw-accel:save-settings',
  'hw:get-system-resources',
  'hw:get-displays',

  // Render dispatch
  'render:get-gpu-accel-args',
  'render:get-decode-args',

  // Projects
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
  'projects:recent',
  'projects:add-recent',
  'projects:clear-recent',
  'projects:mark-dirty',
  'projects:auto-save-status',

  // Jobs
  'jobs:list',
  'jobs:start-export',
  'jobs:transcode-export-artifact',

  // File system
  'fs:read-text',
  'fs:write-text',

  // Video I/O
  'video-io:available',
  'video-io:enumerate',
  'video-io:start-capture',
  'video-io:stop-capture',
  'video-io:start-playback',
  'video-io:stop-playback',
  'video-io:send-frame',
  'video-io:device-status',
  'video-io:get-transport-buffer',

  // Desktop parity playback
  'parity-playback:sync-project',
  'parity-playback:create-transport',
  'parity-playback:get-transport-view',
  'parity-playback:attach-streams',
  'parity-playback:preroll',
  'parity-playback:start',
  'parity-playback:stop',
  'parity-playback:release-transport',
  'parity-playback:play',
  'parity-playback:sync-frame',
  'parity-playback:get-telemetry',
  'parity-playback:attach-output-device',
  'parity-playback:detach-output-device',
  'parity-playback:invalidate-caches',

  // Streaming
  'streaming:available',
  'streaming:start-ndi',
  'streaming:start-srt',
  'streaming:stop',
  'streaming:stop-all',
  'streaming:stats',
  'streaming:targets',

  // Deck control
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

  // Window control
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:is-maximized',
  'window:is-fullscreen',
  'window:set-title',
]);

const ALLOWED_SUBSCRIBE_CHANNELS = new Set([
  // Menu events
  'menu:new-project',
  'menu:open-project',
  'menu:import-media',
  'menu:save',
  'menu:save-as',
  'menu:export',
  'menu:consolidate',
  'menu:preferences',
  'menu:keyboard-shortcuts',

  // Edit menu
  'menu:paste-insert',
  'menu:delete',
  'menu:ripple-delete',
  'menu:deselect-all',

  // Clip/NLE menu
  'menu:razor',
  'menu:split',
  'menu:lift',
  'menu:extract',
  'menu:toggle-link',
  'menu:group',
  'menu:ungroup',
  'menu:nest',
  'menu:match-frame',

  // Mark menu
  'menu:mark-in',
  'menu:mark-out',
  'menu:clear-marks',
  'menu:add-marker',
  'menu:next-marker',
  'menu:prev-marker',
  'menu:goto-in',
  'menu:goto-out',

  // View menu
  'menu:view-source',
  'menu:view-record',
  'menu:view-timeline',
  'menu:view-bins',
  'menu:view-effects',

  // Job & I/O events
  'desktop-job:updated',
  'video-io:frame-available',
  'streaming:stats-update',
  'deck:timecode-update',
  'deck:status-update',

  // Auto-update events
  'app:update-available',
  'app:update-progress',
  'app:update-downloaded',

  // Deep link events
  'app:deep-link',

  // Theme events
  'app:theme-changed',
]);

/**
 * Validated invoke -- only dispatches to whitelisted channels.
 */
function safeInvoke(channel: string, ...args: unknown[]): Promise<unknown> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Validated subscribe -- only listens on whitelisted channels.
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
    downloadUpdate: () => safeInvoke('app:download-update') as Promise<boolean>,
    checkForUpdates: () => safeInvoke('app:check-for-updates') as Promise<unknown>,
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
  importMedia: (projectId: string, filePaths: string[], binId?: string) =>
    safeInvoke('projects:import-media', projectId, filePaths, binId),
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
  transcodeExportArtifact: (payload: unknown) =>
    safeInvoke('jobs:transcode-export-artifact', payload),
  readTextFile: (filePath: string) =>
    safeInvoke('fs:read-text', filePath) as Promise<string>,
  writeTextFile: (filePath: string, contents: string) =>
    safeInvoke('fs:write-text', filePath, contents) as Promise<boolean>,

  // ─── Auto-save / dirty tracking ──────────────────────────────────────
  markProjectDirty: (projectId: string) =>
    safeInvoke('projects:mark-dirty', projectId) as Promise<boolean>,
  getAutoSaveStatus: () =>
    safeInvoke('projects:auto-save-status') as Promise<{
      dirtyCount: number;
      dirtyIds: string[];
      intervalMs: number;
    }>,

  // ─── Render dispatch ─────────────────────────────────────────────────
  render: {
    getGPUAccelArgs: (codec: string) => safeInvoke('render:get-gpu-accel-args', codec),
    getDecodeArgs: () => safeInvoke('render:get-decode-args'),
  },

  // ─── Hardware info ──────────────────────────────────────────────────
  hardware: {
    getSystemResources: () => safeInvoke('hw:get-system-resources'),
    getDisplays: () => safeInvoke('hw:get-displays'),
    getHWAccelSettings: () => safeInvoke('hw-accel:get-settings'),
    saveHWAccelSettings: (settings: unknown) => safeInvoke('hw-accel:save-settings', settings),
  },

  // ─── File drag & drop helpers ────────────────────────────────────────
  filterDroppableFiles: (filePaths: string[]) =>
    safeInvoke('app:filter-droppable-files', filePaths) as Promise<string[]>,

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

  parityPlayback: {
    syncProject: (project: unknown) => safeInvoke('parity-playback:sync-project', project) as Promise<boolean>,
    createTransport: (request: unknown) => safeInvoke('parity-playback:create-transport', request),
    getTransportView: (transportHandle: string) => safeInvoke('parity-playback:get-transport-view', transportHandle),
    getAudioMonitorPreview: (transportHandle: string) =>
      safeInvoke('parity-playback:get-audio-monitor-preview', transportHandle),
    attachStreams: (transportHandle: string, streams: unknown[]) =>
      safeInvoke('parity-playback:attach-streams', transportHandle, streams) as Promise<boolean>,
    preroll: (transportHandle: string, range: unknown) =>
      safeInvoke('parity-playback:preroll', transportHandle, range) as Promise<boolean>,
    start: (transportHandle: string, frame: number) =>
      safeInvoke('parity-playback:start', transportHandle, frame) as Promise<boolean>,
    stop: (transportHandle: string) =>
      safeInvoke('parity-playback:stop', transportHandle) as Promise<boolean>,
    releaseTransport: (transportHandle: string) =>
      safeInvoke('parity-playback:release-transport', transportHandle) as Promise<boolean>,
    play: (transportHandle: string, frame: number, playbackRate?: number) =>
      safeInvoke('parity-playback:play', transportHandle, frame, playbackRate) as Promise<boolean>,
    syncFrame: (transportHandle: string, frame: number) =>
      safeInvoke('parity-playback:sync-frame', transportHandle, frame) as Promise<boolean>,
    getTelemetry: (transportHandle: string) => safeInvoke('parity-playback:get-telemetry', transportHandle),
    attachOutputDevice: (transportHandle: string, config: unknown) =>
      safeInvoke('parity-playback:attach-output-device', transportHandle, config) as Promise<boolean>,
    detachOutputDevice: (transportHandle: string, deviceId?: string) =>
      safeInvoke('parity-playback:detach-output-device', transportHandle, deviceId) as Promise<boolean>,
    invalidateCaches: (projectId: string) =>
      safeInvoke('parity-playback:invalidate-caches', projectId) as Promise<boolean>,
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
  onNextMarker: (cb: () => void) => safeSubscribe('menu:next-marker', cb),
  onPrevMarker: (cb: () => void) => safeSubscribe('menu:prev-marker', cb),
  onGotoIn:     (cb: () => void) => safeSubscribe('menu:goto-in', cb),
  onGotoOut:    (cb: () => void) => safeSubscribe('menu:goto-out', cb),
  onRazor:      (cb: () => void) => safeSubscribe('menu:razor', cb),
  onSplit:      (cb: () => void) => safeSubscribe('menu:split', cb),
  onLift:       (cb: () => void) => safeSubscribe('menu:lift', cb),
  onExtract:    (cb: () => void) => safeSubscribe('menu:extract', cb),
  onToggleLink: (cb: () => void) => safeSubscribe('menu:toggle-link', cb),
  onGroup:      (cb: () => void) => safeSubscribe('menu:group', cb),
  onUngroup:    (cb: () => void) => safeSubscribe('menu:ungroup', cb),
  onNest:       (cb: () => void) => safeSubscribe('menu:nest', cb),
  onMatchFrame: (cb: () => void) => safeSubscribe('menu:match-frame', cb),

  // Edit menu events
  onPasteInsert:  (cb: () => void) => safeSubscribe('menu:paste-insert', cb),
  onDelete:       (cb: () => void) => safeSubscribe('menu:delete', cb),
  onRippleDelete: (cb: () => void) => safeSubscribe('menu:ripple-delete', cb),
  onDeselectAll:  (cb: () => void) => safeSubscribe('menu:deselect-all', cb),

  // View panel events
  onViewSource:   (cb: () => void) => safeSubscribe('menu:view-source', cb),
  onViewRecord:   (cb: () => void) => safeSubscribe('menu:view-record', cb),
  onViewTimeline: (cb: () => void) => safeSubscribe('menu:view-timeline', cb),
  onViewBins:     (cb: () => void) => safeSubscribe('menu:view-bins', cb),
  onViewEffects:  (cb: () => void) => safeSubscribe('menu:view-effects', cb),

  // Keyboard shortcuts menu
  onKeyboardShortcuts: (cb: () => void) => safeSubscribe('menu:keyboard-shortcuts', cb),

  // Auto-update events
  onUpdateAvailable:  (cb: (info: { version: string }) => void) => safeSubscribe('app:update-available', cb),
  onUpdateProgress:   (cb: (info: { percent: number }) => void) => safeSubscribe('app:update-progress', cb),
  onUpdateDownloaded: (cb: (info: { version: string }) => void) => safeSubscribe('app:update-downloaded', cb),

  // Deep link events
  onDeepLink: (cb: (url: string) => void) => safeSubscribe('app:deep-link', cb),

  // Theme change events
  onThemeChanged: (cb: (info: { shouldUseDarkColors: boolean; themeSource: string }) => void) =>
    safeSubscribe('app:theme-changed', cb),

  // Cleanup
  removeAllListeners: (channel: string) => {
    if (ALLOWED_SUBSCRIBE_CHANNELS.has(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  },
});

// ─── TypeScript type declaration (for renderer) ────────────────────────────────
export type ElectronAPI = typeof window.electronAPI;
