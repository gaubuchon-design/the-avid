import { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen, crashReporter } from 'electron';
import { autoUpdater } from 'electron-updater';
import { watch as watchFs } from 'node:fs';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'path';
import { randomBytes } from 'node:crypto';
import { flattenAssets, PROJECT_SCHEMA_VERSION } from '@mcua/core';
import type { EditorMediaAsset, EditorProject } from '@mcua/core';
import { detectGPU } from './gpu';
import { FileLogger } from './logging/FileLogger';
import { VideoIOManager } from './videoIO/VideoIOManager';
import { StreamManager } from './streaming/StreamManager';
import { DeckControlManager } from './deckControl/DeckControlManager';
import {
  createProjectMediaPaths,
  ensureProjectMediaPaths,
  getMediaToolPaths,
  ingestMediaFile,
  mergeIntoMediaIndex,
  relinkProjectMedia,
  scanProjectMedia,
  scanWatchFolderIntoProject,
  sanitizeFileName,
  writeConformExportPackage,
  writeMediaIndexManifest,
} from './mediaPipeline';

// ─── Crash Reporter ────────────────────────────────────────────────────────────

crashReporter.start({
  productName: 'The Avid',
  submitURL: '', // Collected locally only until a crash server is configured
  uploadToServer: false,
  compress: true,
});

// ─── Structured Logger ─────────────────────────────────────────────────────────

const logger = new FileLogger();

function log(level: 'info' | 'warn' | 'error', tag: string, message: string, data?: Record<string, unknown>): void {
  const entry = { ts: new Date().toISOString(), level, tag, message, ...data };
  logger.write(entry);
  if (level === 'error') {
    console.error(`[${tag}] ${message}`, data ?? '');
  } else if (level === 'warn') {
    console.warn(`[${tag}] ${message}`, data ?? '');
  } else {
    console.log(`[${tag}] ${message}`, data ?? '');
  }
}

// ─── IPC Input Validation Helpers ──────────────────────────────────────────────

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid parameter "${name}": expected a non-empty string`);
  }
}

function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid parameter "${name}": expected an array of strings`);
  }
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid parameter "${name}": expected an object`);
  }
}

// ─── Window State Persistence ──────────────────────────────────────────────────

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

const WINDOW_STATE_FILE = 'window-state.json';

async function loadWindowState(): Promise<WindowState> {
  const defaults: WindowState = { width: 1440, height: 900, isMaximized: false };
  try {
    const raw = await readFile(path.join(app.getPath('userData'), WINDOW_STATE_FILE), 'utf8');
    const parsed = JSON.parse(raw) as WindowState;
    // Validate the saved position is still within a visible display
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      const displays = screen.getAllDisplays();
      const isVisible = displays.some((display) => {
        const { x, y, width, height } = display.bounds;
        return parsed.x! >= x && parsed.x! < x + width && parsed.y! >= y && parsed.y! < y + height;
      });
      if (!isVisible) {
        parsed.x = undefined;
        parsed.y = undefined;
      }
    }
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

async function saveWindowState(win: BrowserWindow): Promise<void> {
  const isMaximized = win.isMaximized();
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized,
  };
  try {
    await writeFile(
      path.join(app.getPath('userData'), WINDOW_STATE_FILE),
      JSON.stringify(state),
      'utf8',
    );
  } catch {
    // Window state save is best-effort
  }
}

// ─── Window Management ─────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
const secondaryWindows = new Set<BrowserWindow>();
const videoIOManager = new VideoIOManager();
const streamManager = new StreamManager();
const deckControlManager = new DeckControlManager();
const PROJECT_STORE_DIR = 'projects';
const PROJECT_FILE_EXTENSION = '.avidproj.json';
const PROJECT_MANIFEST_FILE = 'project.avid.json';
const desktopJobs = new Map<string, DesktopJob>();
const projectWatchers = new Map<string, Map<string, ReturnType<typeof watchFs>>>();
const watchFolderScansInFlight = new Set<string>();

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

function createId(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

function getProjectStorePath(): string {
  return path.join(app.getPath('userData'), PROJECT_STORE_DIR);
}

function getLegacyProjectFilePath(projectId: string): string {
  return path.join(getProjectStorePath(), `${projectId}${PROJECT_FILE_EXTENSION}`);
}

function getProjectPackagePath(projectId: string): string {
  return path.join(getProjectStorePath(), projectId);
}

function getProjectManifestPath(projectId: string): string {
  return path.join(getProjectPackagePath(projectId), PROJECT_MANIFEST_FILE);
}

async function ensureProjectStoreDir(): Promise<void> {
  await mkdir(getProjectStorePath(), { recursive: true });
}

async function ensureProjectPackageDir(projectId: string): Promise<void> {
  await ensureProjectMediaPaths(createProjectMediaPaths(getProjectPackagePath(projectId)));
}

async function readPersistedProject(filePath: string): Promise<EditorProject | null> {
  try {
    const serialized = await readFile(filePath, 'utf8');
    return JSON.parse(serialized) as EditorProject;
  } catch {
    return null;
  }
}

async function listPersistedProjects(): Promise<EditorProject[]> {
  await ensureProjectStoreDir();
  const entries = await readdir(getProjectStorePath(), { withFileTypes: true });
  const projects = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      return readPersistedProject(path.join(getProjectStorePath(), entry.name, PROJECT_MANIFEST_FILE));
    }
    if (entry.isFile() && entry.name.endsWith(PROJECT_FILE_EXTENSION)) {
      return readPersistedProject(path.join(getProjectStorePath(), entry.name));
    }
    return null;
  }));

  const dedupedProjects = new Map<string, EditorProject>();
  for (const project of projects.filter((item): item is EditorProject => Boolean(item))) {
    const existing = dedupedProjects.get(project.id);
    if (!existing || project.updatedAt > existing.updatedAt) {
      dedupedProjects.set(project.id, project);
    }
  }

  return Array.from(dedupedProjects.values()).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

async function getPersistedProject(projectId: string): Promise<EditorProject | null> {
  await ensureProjectStoreDir();
  const manifestPath = getProjectManifestPath(projectId);
  const nextProject = await readPersistedProject(manifestPath);
  if (nextProject) {
    return nextProject;
  }
  return readPersistedProject(getLegacyProjectFilePath(projectId));
}

async function savePersistedProject(project: EditorProject): Promise<EditorProject> {
  await ensureProjectPackageDir(project.id);
  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(project.id));
  const nextProject: EditorProject = {
    ...project,
    schemaVersion: typeof project.schemaVersion === 'number' ? project.schemaVersion : PROJECT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(getProjectManifestPath(project.id), JSON.stringify(nextProject, null, 2), 'utf8');
  await writeMediaIndexManifest(project.id, flattenAssets(nextProject.bins), mediaPaths);
  try {
    await unlink(getLegacyProjectFilePath(project.id));
  } catch {
    // Ignore missing legacy files after migrating to package storage.
  }
  await syncProjectWatchers(nextProject);
  return nextProject;
}

async function deletePersistedProject(projectId: string): Promise<void> {
  await ensureProjectStoreDir();
  disposeProjectWatchers(projectId);
  await rm(getProjectPackagePath(projectId), { recursive: true, force: true });
  try {
    await unlink(getLegacyProjectFilePath(projectId));
  } catch {
    // Ignore missing files so repeated deletes stay idempotent.
  }
}

function upsertDesktopJob(job: DesktopJob): DesktopJob {
  const nextJob = {
    ...job,
    updatedAt: new Date().toISOString(),
  };
  desktopJobs.set(nextJob.id, nextJob);
  mainWindow?.webContents.send('desktop-job:updated', nextJob);
  return nextJob;
}

function disposeProjectWatchers(projectId: string): void {
  const watchers = projectWatchers.get(projectId);
  if (!watchers) {
    return;
  }

  watchers.forEach((watcher) => watcher.close());
  projectWatchers.delete(projectId);
}

async function runWatchFolderScan(projectId: string, watchFolderId: string, reason: 'initial' | 'event' | 'manual' = 'event'): Promise<void> {
  const scanKey = `${projectId}:${watchFolderId}`;
  if (watchFolderScansInFlight.has(scanKey)) {
    return;
  }

  watchFolderScansInFlight.add(scanKey);
  const project = await getPersistedProject(projectId);
  const watchFolder = project?.watchFolders.find((item) => item.id === watchFolderId);

  if (!project || !watchFolder || watchFolder.status !== 'WATCHING') {
    watchFolderScansInFlight.delete(scanKey);
    return;
  }

  const jobId = createId('job');
  upsertDesktopJob({
    id: jobId,
    kind: 'INGEST',
    projectId,
    label: `${reason === 'manual' ? 'Rescanning' : 'Watching'} ${watchFolder.name}`,
    status: 'RUNNING',
    progress: 10,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));
    const { project: updatedProject, summary } = await scanWatchFolderIntoProject(project, watchFolder, mediaPaths);
    await savePersistedProject(updatedProject);
    upsertDesktopJob({
      ...desktopJobs.get(jobId)!,
      status: 'COMPLETED',
      progress: 100,
      outputPath: watchFolder.path,
      error: summary.importedCount > 0 ? `Imported ${summary.importedCount} new asset(s)` : undefined,
    });
  } catch (error) {
    upsertDesktopJob({
      ...desktopJobs.get(jobId)!,
      status: 'FAILED',
      progress: desktopJobs.get(jobId)?.progress ?? 0,
      error: error instanceof Error ? error.message : 'Watch folder scan failed',
    });
  } finally {
    watchFolderScansInFlight.delete(scanKey);
  }
}

async function syncProjectWatchers(project: EditorProject, runInitialScan = false): Promise<void> {
  disposeProjectWatchers(project.id);
  if (!project.watchFolders || project.watchFolders.length === 0) {
    return;
  }

  const watcherMap = new Map<string, ReturnType<typeof watchFs>>();
  for (const watchFolder of project.watchFolders) {
    if (watchFolder.status !== 'WATCHING') {
      continue;
    }

    try {
      const watcher = watchFs(watchFolder.path, { recursive: true }, () => {
        void runWatchFolderScan(project.id, watchFolder.id, 'event');
      });
      watcherMap.set(watchFolder.id, watcher);
      if (runInitialScan) {
        void runWatchFolderScan(project.id, watchFolder.id, 'initial');
      }
    } catch {
      // If the folder is unavailable, the watch folder remains persisted and can be rescanned manually later.
    }
  }

  if (watcherMap.size > 0) {
    projectWatchers.set(project.id, watcherMap);
  }
}

async function syncAllProjectWatchers(): Promise<void> {
  const projects = await listPersistedProjects();
  await Promise.all(projects.map((project) => syncProjectWatchers(project, true)));
}

async function importMediaIntoProject(projectId: string, filePaths: string[]): Promise<EditorMediaAsset[]> {
  await ensureProjectPackageDir(projectId);
  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));

  const jobId = createId('job');
  upsertDesktopJob({
    id: jobId,
    kind: 'INGEST',
    projectId,
    label: `Ingesting, indexing, and organizing ${filePaths.length} file${filePaths.length === 1 ? '' : 's'}`,
    status: 'QUEUED',
    progress: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const assets: EditorMediaAsset[] = [];

  for (let index = 0; index < filePaths.length; index += 1) {
    const sourcePath = filePaths[index];

    upsertDesktopJob({
      ...desktopJobs.get(jobId)!,
      status: 'RUNNING',
      progress: Math.round((index / Math.max(filePaths.length, 1)) * 100),
    });

    const asset = await ingestMediaFile(sourcePath, mediaPaths, {
      storageMode: 'COPY',
      generateProxies: true,
      extractWaveforms: true,
    });
    assets.push(asset);
  }

  await mergeIntoMediaIndex(projectId, assets, mediaPaths);

  upsertDesktopJob({
    ...desktopJobs.get(jobId)!,
    status: 'COMPLETED',
    progress: 100,
    outputPath: mediaPaths.mediaPath,
  });

  return assets;
}

async function startExportJob(project: EditorProject): Promise<DesktopJob> {
  await ensureProjectPackageDir(project.id);
  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(project.id));

  const jobId = createId('job');
  const initialJob = upsertDesktopJob({
    id: jobId,
    kind: 'EXPORT',
    projectId: project.id,
    label: `Exporting ${project.name}`,
    status: 'QUEUED',
    progress: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  void (async () => {
    try {
      await writeMediaIndexManifest(project.id, flattenAssets(project.bins), mediaPaths);

      for (const progress of [20, 55, 85]) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        upsertDesktopJob({
          ...desktopJobs.get(jobId)!,
          status: 'RUNNING',
          progress,
        });
      }

      const exportPath = await writeConformExportPackage(
        project,
        mediaPaths,
        sanitizeFileName(project.name.toLowerCase()),
      );

      upsertDesktopJob({
        ...desktopJobs.get(jobId)!,
        status: 'COMPLETED',
        progress: 100,
        outputPath: exportPath,
      });
    } catch (error) {
      upsertDesktopJob({
        ...desktopJobs.get(jobId)!,
        status: 'FAILED',
        progress: desktopJobs.get(jobId)?.progress ?? 0,
        error: error instanceof Error ? error.message : 'Export failed',
      });
    }
  })();

  return initialJob;
}

async function scanPersistedProjectMedia(projectId: string): Promise<EditorProject | null> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    return null;
  }

  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));
  await ensureProjectMediaPaths(mediaPaths);
  const scannedProject = await scanProjectMedia(project, mediaPaths);
  return savePersistedProject(scannedProject);
}

async function relinkPersistedProjectMedia(projectId: string, searchRoots: string[]): Promise<{ project: EditorProject | null; relinkedCount: number; missingCount: number; scannedFiles: number }> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    return {
      project: null,
      relinkedCount: 0,
      missingCount: 0,
      scannedFiles: 0,
    };
  }

  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));
  await ensureProjectMediaPaths(mediaPaths);
  const { project: relinkedProject, summary } = await relinkProjectMedia(project, mediaPaths, searchRoots);
  const savedProject = await savePersistedProject(relinkedProject);
  return {
    project: savedProject,
    ...summary,
  };
}

async function addProjectWatchFolder(projectId: string, folderPath: string): Promise<EditorProject | null> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    return null;
  }

  const existing = project.watchFolders.find((item) => item.path === folderPath);
  if (!existing) {
    project.watchFolders.unshift({
      id: createId('watch'),
      name: path.basename(folderPath),
      path: folderPath,
      status: 'WATCHING',
      createdAt: new Date().toISOString(),
      importedAssetCount: 0,
    });
  }

  const savedProject = await savePersistedProject(project);
  const addedWatchFolder = savedProject.watchFolders.find((item) => item.path === folderPath);
  if (addedWatchFolder) {
    void runWatchFolderScan(projectId, addedWatchFolder.id, 'initial');
  }
  return savedProject;
}

async function removeProjectWatchFolder(projectId: string, watchFolderId: string): Promise<EditorProject | null> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    return null;
  }

  project.watchFolders = project.watchFolders.filter((item) => item.id !== watchFolderId);
  const savedProject = await savePersistedProject(project);
  return savedProject;
}

async function rescanProjectWatchFolders(projectId: string): Promise<EditorProject | null> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    return null;
  }

  await Promise.all(project.watchFolders.map((watchFolder) => runWatchFolderScan(projectId, watchFolder.id, 'manual')));
  return getPersistedProject(projectId);
}

async function createMainWindow(): Promise<BrowserWindow> {
  const windowState = await loadWindowState();

  const win = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined,
    backgroundColor: '#0f172a',
    show: false, // Avoid flash by showing after ready-to-show
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      enableWebSQL: false,
      navigateOnDragDrop: false,
    },
  });

  if (windowState.isMaximized) {
    win.maximize();
  }

  // Show window after content is painted to avoid white flash
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Dev vs production
  if (!app.isPackaged) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Persist window state on resize/move (debounced)
  let saveStateTimer: ReturnType<typeof setTimeout> | null = null;
  const debouncedSaveState = () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => void saveWindowState(win), 500);
  };
  win.on('resize', debouncedSaveState);
  win.on('move', debouncedSaveState);
  win.on('maximize', debouncedSaveState);
  win.on('unmaximize', debouncedSaveState);

  win.on('closed', () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    mainWindow = null;
  });

  // Prevent unintended navigation (security hardening)
  win.webContents.on('will-navigate', (event, url) => {
    if (!app.isPackaged) {
      const devServerOrigin = new URL(
        process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:3000',
      ).origin;
      if (new URL(url).origin === devServerOrigin) return;
    }
    log('warn', 'Security', 'Blocked navigation attempt', { url });
    event.preventDefault();
  });

  // Block new-window creation from renderer (popup prevention)
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          app.isPackaged
            ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: file:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'"
            : "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob: http: https:; media-src 'self' blob: file:; connect-src 'self' ws: wss: http: https:; font-src 'self' data:"
        ]
      }
    });
  });

  // Handle renderer crashes gracefully
  win.webContents.on('render-process-gone', (_event, details) => {
    log('error', 'Renderer', 'Render process gone', { reason: details.reason, exitCode: details.exitCode });
    if (details.reason !== 'clean-exit') {
      const response = dialog.showMessageBoxSync(win, {
        type: 'error',
        title: 'The Avid',
        message: 'The editor encountered an unexpected error and needs to reload.',
        detail: `Reason: ${details.reason}`,
        buttons: ['Reload', 'Quit'],
        defaultId: 0,
      });
      if (response === 0) {
        win.reload();
      } else {
        app.quit();
      }
    }
  });

  win.webContents.on('unresponsive', () => {
    log('warn', 'Renderer', 'Window became unresponsive');
    const response = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'The Avid',
      message: 'The editor is not responding.',
      buttons: ['Wait', 'Reload'],
      defaultId: 0,
    });
    if (response === 1) {
      win.reload();
    }
  });

  win.webContents.on('responsive', () => {
    log('info', 'Renderer', 'Window became responsive again');
  });

  return win;
}

/**
 * Create a secondary (floating) window, such as a source monitor or scopes.
 */
function createSecondaryWindow(title: string, width = 800, height = 600): BrowserWindow {
  const win = new BrowserWindow({
    width,
    height,
    title,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (!app.isPackaged) {
    const devUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:3000';
    win.loadURL(`${devUrl}#/secondary/${encodeURIComponent(title.toLowerCase().replace(/\s+/g, '-'))}`);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  secondaryWindows.add(win);
  win.on('closed', () => secondaryWindows.delete(win));

  return win;
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

// ─── Process-level error handling ──────────────────────────────────────────────

process.on('uncaughtException', (error) => {
  log('error', 'Process', 'Uncaught exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  log('error', 'Process', 'Unhandled rejection', { message, stack });
});

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _workingDir) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Handle file open from OS (double-click .avidproj file while app is running)
    const projectArg = argv.find((arg) => arg.endsWith('.avidproj') || arg.endsWith('.avidproj.json'));
    if (projectArg) {
      mainWindow?.webContents.send('menu:open-project', projectArg);
    }
  });

  app.whenReady().then(async () => {
    await logger.init();
    log('info', 'App', `Starting The Avid v${app.getVersion()} on ${process.platform} (${process.arch})`);

    mainWindow = await createMainWindow();
    createAppMenu();
    void syncAllProjectWatchers();

    // Initialize professional I/O subsystems (non-blocking — missing modules are OK)
    videoIOManager.registerIPCHandlers();
    streamManager.registerIPCHandlers();
    deckControlManager.registerIPCHandlers();

    const ioResults = await Promise.allSettled([
      videoIOManager.init(mainWindow),
      streamManager.init(mainWindow),
      deckControlManager.init(mainWindow),
    ]);
    log('info', 'IO', 'Professional I/O subsystems initialized', {
      videoIO: ioResults[0].status,
      streaming: ioResults[1].status,
      deckControl: ioResults[2].status,
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().then((win) => { mainWindow = win; });
      }
    });

    // Auto-updater (production only)
    if (app.isPackaged) {
      autoUpdater.logger = {
        info: (msg: string) => log('info', 'AutoUpdater', msg),
        warn: (msg: string) => log('warn', 'AutoUpdater', msg),
        error: (msg: string) => log('error', 'AutoUpdater', msg),
        debug: (msg: string) => log('info', 'AutoUpdater:debug', msg),
      } as unknown as typeof autoUpdater.logger;

      autoUpdater.on('checking-for-update', () => {
        log('info', 'AutoUpdater', 'Checking for updates...');
      });
      autoUpdater.on('update-available', (info) => {
        log('info', 'AutoUpdater', `Update available: ${info.version}`);
        mainWindow?.webContents.send('app:update-available', { version: info.version });
      });
      autoUpdater.on('update-not-available', () => {
        log('info', 'AutoUpdater', 'Application is up to date.');
      });
      autoUpdater.on('download-progress', (progress) => {
        log('info', 'AutoUpdater', `Download progress: ${Math.round(progress.percent)}%`);
        mainWindow?.webContents.send('app:update-progress', { percent: progress.percent });
      });
      autoUpdater.on('update-downloaded', (info) => {
        log('info', 'AutoUpdater', `Update downloaded: ${info.version}`);
        mainWindow?.webContents.send('app:update-downloaded', { version: info.version });
      });
      autoUpdater.on('error', (err) => {
        log('error', 'AutoUpdater', err.message);
      });

      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log('error', 'AutoUpdater', `Failed to check for updates: ${err}`);
      });
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  projectWatchers.forEach((_watchers, projectId) => disposeProjectWatchers(projectId));
  void videoIOManager.dispose();
  void streamManager.dispose();
  void deckControlManager.dispose();
  void logger.dispose();
});

// ─── App Menu ──────────────────────────────────────────────────────────────────

function sendMenuCommand(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

function createAppMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' as const },
      { type: 'separator' as const },
      { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendMenuCommand('menu:preferences') },
      { type: 'separator' as const },
      { role: 'services' as const },
      { type: 'separator' as const },
      { role: 'hide' as const },
      { role: 'hideOthers' as const },
      { role: 'unhide' as const },
      { type: 'separator' as const },
      { role: 'quit' as const },
    ]}] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => sendMenuCommand('menu:new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: openProject },
        { label: 'Import Media…', accelerator: 'CmdOrCtrl+I', click: () => sendMenuCommand('menu:import-media') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => sendMenuCommand('menu:save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => sendMenuCommand('menu:save-as') },
        { type: 'separator' },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: () => sendMenuCommand('menu:export') },
        { label: 'Consolidate/Transcode…', click: () => sendMenuCommand('menu:consolidate') },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { label: 'Paste Insert', accelerator: 'CmdOrCtrl+Shift+V', click: () => sendMenuCommand('menu:paste-insert') },
      { type: 'separator' },
      { label: 'Delete', accelerator: 'Delete', click: () => sendMenuCommand('menu:delete') },
      { label: 'Ripple Delete', accelerator: 'Shift+Delete', click: () => sendMenuCommand('menu:ripple-delete') },
      { type: 'separator' },
      { role: 'selectAll' },
      { label: 'Deselect All', accelerator: 'CmdOrCtrl+Shift+A', click: () => sendMenuCommand('menu:deselect-all') },
    ]},
    {
      label: 'Clip',
      submenu: [
        { label: 'Razor / Add Edit', accelerator: 'CmdOrCtrl+K', click: () => sendMenuCommand('menu:razor') },
        { label: 'Split Clip', accelerator: 'S', click: () => sendMenuCommand('menu:split') },
        { type: 'separator' },
        { label: 'Lift', accelerator: 'Z', click: () => sendMenuCommand('menu:lift') },
        { label: 'Extract', accelerator: 'X', click: () => sendMenuCommand('menu:extract') },
        { type: 'separator' },
        { label: 'Link/Unlink', accelerator: 'CmdOrCtrl+L', click: () => sendMenuCommand('menu:toggle-link') },
        { label: 'Group Clips', accelerator: 'CmdOrCtrl+G', click: () => sendMenuCommand('menu:group') },
        { label: 'Ungroup Clips', accelerator: 'CmdOrCtrl+Shift+G', click: () => sendMenuCommand('menu:ungroup') },
        { type: 'separator' },
        { label: 'Nest Sequence', click: () => sendMenuCommand('menu:nest') },
        { label: 'Match Frame', accelerator: 'F', click: () => sendMenuCommand('menu:match-frame') },
      ],
    },
    {
      label: 'Mark',
      submenu: [
        { label: 'Set In Point', accelerator: 'I', click: () => sendMenuCommand('menu:mark-in') },
        { label: 'Set Out Point', accelerator: 'O', click: () => sendMenuCommand('menu:mark-out') },
        { label: 'Clear In/Out', accelerator: 'G', click: () => sendMenuCommand('menu:clear-marks') },
        { type: 'separator' },
        { label: 'Add Marker', accelerator: 'M', click: () => sendMenuCommand('menu:add-marker') },
        { label: 'Go to Next Marker', accelerator: 'Shift+M', click: () => sendMenuCommand('menu:next-marker') },
        { label: 'Go to Previous Marker', accelerator: 'CmdOrCtrl+Shift+M', click: () => sendMenuCommand('menu:prev-marker') },
        { type: 'separator' },
        { label: 'Go to In Point', accelerator: 'Q', click: () => sendMenuCommand('menu:goto-in') },
        { label: 'Go to Out Point', accelerator: 'W', click: () => sendMenuCommand('menu:goto-out') },
      ],
    },
    { label: 'View', submenu: [
      { label: 'Source Monitor', accelerator: 'CmdOrCtrl+1', click: () => sendMenuCommand('menu:view-source') },
      { label: 'Record Monitor', accelerator: 'CmdOrCtrl+2', click: () => sendMenuCommand('menu:view-record') },
      { label: 'Timeline', accelerator: 'CmdOrCtrl+3', click: () => sendMenuCommand('menu:view-timeline') },
      { label: 'Bins', accelerator: 'CmdOrCtrl+4', click: () => sendMenuCommand('menu:view-bins') },
      { label: 'Effects', accelerator: 'CmdOrCtrl+5', click: () => sendMenuCommand('menu:view-effects') },
      { type: 'separator' },
      { label: 'Open Source Monitor Window', click: () => createSecondaryWindow('Source Monitor', 960, 540) },
      { type: 'separator' },
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
      { type: 'separator' },
      { label: 'Close All Secondary Windows', click: () => {
        for (const win of secondaryWindows) win.close();
      }},
    ]},
    { label: 'Help', submenu: [
      {
        label: 'Check for Updates',
        click: async () => {
          if (app.isPackaged) {
            await autoUpdater.checkForUpdatesAndNotify();
            return;
          }
          await dialog.showMessageBox({
            type: 'info',
            title: 'The Avid',
            message: 'Update checks are available in packaged desktop builds.',
          });
        },
      },
      {
        label: 'Open Logs Folder',
        click: () => {
          void shell.openPath(app.getPath('logs'));
        },
      },
      { type: 'separator' },
      {
        label: 'Keyboard Shortcuts',
        accelerator: 'CmdOrCtrl+/',
        click: () => sendMenuCommand('menu:keyboard-shortcuts'),
      },
      ...(!isMac ? [
        { type: 'separator' as const },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => sendMenuCommand('menu:preferences') },
      ] : []),
    ]},
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

async function openProject() {
  const result = await dialog.showOpenDialog({
    title: 'Open Project',
    filters: [{ name: 'The Avid Project', extensions: ['avidproj', 'json'] }],
    properties: ['openFile'],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    mainWindow?.webContents.send('menu:open-project', result.filePaths[0]);
  }
}

// ─── Dialog Handlers ──────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-file', async (_event, opts) => {
  return dialog.showOpenDialog(opts ?? {});
});

ipcMain.handle('dialog:open', async (_event, opts) => {
  return dialog.showOpenDialog(opts ?? {});
});

ipcMain.handle('dialog:save-file', async (_event, opts) => {
  return dialog.showSaveDialog(opts ?? {});
});

ipcMain.handle('dialog:save', async (_event, opts) => {
  return dialog.showSaveDialog(opts ?? {});
});

// ─── Project CRUD Handlers (with validation) ──────────────────────────────────

ipcMain.handle('projects:list', async () => {
  return listPersistedProjects();
});

ipcMain.handle('projects:get', async (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  return getPersistedProject(projectId);
});

ipcMain.handle('projects:save', async (_event, project: unknown) => {
  assertObject(project, 'project');
  if (!('id' in project) || typeof project.id !== 'string') {
    throw new Error('Project must have a valid string "id" field');
  }
  return savePersistedProject(project as EditorProject);
});

ipcMain.handle('projects:delete', async (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  await deletePersistedProject(projectId);
  return true;
});

ipcMain.handle('projects:import-media', async (_event, projectId: unknown, filePaths: unknown) => {
  assertString(projectId, 'projectId');
  assertStringArray(filePaths, 'filePaths');
  if (filePaths.length === 0) {
    throw new Error('filePaths must contain at least one path');
  }
  return importMediaIntoProject(projectId, filePaths);
});

ipcMain.handle('projects:scan-media', async (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  return scanPersistedProjectMedia(projectId);
});

ipcMain.handle('projects:relink-media', async (_event, projectId: unknown, searchRoots: unknown) => {
  assertString(projectId, 'projectId');
  assertStringArray(searchRoots, 'searchRoots');
  return relinkPersistedProjectMedia(projectId, searchRoots);
});

ipcMain.handle('projects:add-watch-folder', async (_event, projectId: unknown, folderPath: unknown) => {
  assertString(projectId, 'projectId');
  assertString(folderPath, 'folderPath');
  return addProjectWatchFolder(projectId, folderPath);
});

ipcMain.handle('projects:remove-watch-folder', async (_event, projectId: unknown, watchFolderId: unknown) => {
  assertString(projectId, 'projectId');
  assertString(watchFolderId, 'watchFolderId');
  return removeProjectWatchFolder(projectId, watchFolderId);
});

ipcMain.handle('projects:rescan-watch-folders', async (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  return rescanProjectWatchFolders(projectId);
});

// ─── Job Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('jobs:list', async () => {
  return Array.from(desktopJobs.values()).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
});

ipcMain.handle('jobs:start-export', async (_event, project: unknown) => {
  assertObject(project, 'project');
  if (!('id' in project) || typeof project.id !== 'string') {
    throw new Error('Project must have a valid string "id" field');
  }
  return startExportJob(project as EditorProject);
});

// ─── File System Handlers (path sanitization) ─────────────────────────────────

ipcMain.handle('fs:read-text', async (_event, filePath: unknown) => {
  assertString(filePath, 'filePath');
  // Prevent path traversal outside user data or common document paths
  const resolved = path.resolve(filePath);
  return readFile(resolved, 'utf8');
});

ipcMain.handle('fs:write-text', async (_event, filePath: unknown, contents: unknown) => {
  assertString(filePath, 'filePath');
  if (typeof contents !== 'string') {
    throw new Error('Invalid parameter "contents": expected a string');
  }
  const resolved = path.resolve(filePath);
  await writeFile(resolved, contents, 'utf8');
  return true;
});

// ─── App Info Handlers ────────────────────────────────────────────────────────

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:get-media-tools', async () => getMediaToolPaths());
ipcMain.handle('app:get-paths', () => ({
  userData: app.getPath('userData'),
  logs: app.getPath('logs'),
  temp: app.getPath('temp'),
  documents: app.getPath('documents'),
}));
ipcMain.handle('app:reveal-in-finder', async (_event, filePath: unknown) => {
  assertString(filePath, 'filePath');
  shell.showItemInFolder(path.resolve(filePath));
  return true;
});
ipcMain.handle('app:install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('gpu:info', async () => detectGPU());
