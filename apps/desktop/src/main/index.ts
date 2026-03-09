import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import { autoUpdater } from 'electron-updater';
import { watch as watchFs } from 'node:fs';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'path';
import { flattenAssets, PROJECT_SCHEMA_VERSION } from '@mcua/core';
import type { EditorMediaAsset, EditorProject } from '@mcua/core';
import { detectGPU } from './gpu';
import { VideoIOManager } from './videoIO/VideoIOManager';
import { StreamManager } from './streaming/StreamManager';
import { DeckControlManager } from './deckControl/DeckControlManager';
import { FileLogger } from './logging/FileLogger';
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

// ─── Window Management ─────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
const fileLogger = new FileLogger();
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
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
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

  const errors: string[] = [];
  for (let index = 0; index < filePaths.length; index += 1) {
    const sourcePath = filePaths[index];

    upsertDesktopJob({
      ...desktopJobs.get(jobId)!,
      status: 'RUNNING',
      progress: Math.round((index / Math.max(filePaths.length, 1)) * 100),
    });

    try {
      const asset = await ingestMediaFile(sourcePath, mediaPaths, {
        storageMode: 'COPY',
        generateProxies: true,
        extractWaveforms: true,
      });
      assets.push(asset);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingest failed';
      errors.push(`${path.basename(sourcePath)}: ${message}`);
      fileLogger.write({ level: 'error', event: 'ingest-file-error', sourcePath, error: message });
    }
  }

  if (assets.length > 0) {
    await mergeIntoMediaIndex(projectId, assets, mediaPaths);
  }

  upsertDesktopJob({
    ...desktopJobs.get(jobId)!,
    status: errors.length > 0 && assets.length === 0 ? 'FAILED' : 'COMPLETED',
    progress: 100,
    outputPath: mediaPaths.mediaPath,
    error: errors.length > 0 ? `${errors.length} file(s) failed: ${errors.join('; ')}` : undefined,
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

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  // Dev vs production
  if (!app.isPackaged) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:3000');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  win.on('closed', () => { mainWindow = null; });

  // Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          app.isPackaged
            ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: file:; connect-src 'self' ws://localhost:* http://localhost:*; font-src 'self' data:"
            : "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: blob: http: https:; media-src 'self' blob: file:; connect-src 'self' ws: wss: http: https:; font-src 'self' data:"
        ]
      }
    });
  });

  return win;
}

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _argv, _workingDir) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await fileLogger.init().catch((err) => {
      console.error('[FileLogger] Failed to initialize:', err);
    });
    fileLogger.write({ level: 'info', event: 'app-ready', version: app.getVersion(), platform: process.platform });

    mainWindow = createMainWindow();
    createAppMenu();
    void syncAllProjectWatchers();

    // Initialize professional I/O subsystems (non-blocking — missing modules are OK)
    videoIOManager.registerIPCHandlers();
    streamManager.registerIPCHandlers();
    deckControlManager.registerIPCHandlers();

    await Promise.allSettled([
      videoIOManager.init(mainWindow),
      streamManager.init(mainWindow),
      deckControlManager.init(mainWindow),
    ]);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });

    // Auto-updater (production only)
    if (app.isPackaged) {
      autoUpdater.logger = {
        info: (msg: string) => console.log('[AutoUpdater]', msg),
        warn: (msg: string) => console.warn('[AutoUpdater]', msg),
        error: (msg: string) => console.error('[AutoUpdater]', msg),
        debug: (msg: string) => console.log('[AutoUpdater:debug]', msg),
      } as unknown as typeof autoUpdater.logger;

      autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates...');
      });
      autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
      });
      autoUpdater.on('update-not-available', () => {
        console.log('[AutoUpdater] Application is up to date.');
      });
      autoUpdater.on('download-progress', (progress) => {
        console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`);
      });
      autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded:', info.version);
      });
      autoUpdater.on('error', (err) => {
        console.error('[AutoUpdater] Error:', err.message);
      });

      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.error('[AutoUpdater] Failed to check for updates:', err);
      });
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Collect keys first to avoid mutating the map during iteration
  const projectIds = [...projectWatchers.keys()];
  for (const projectId of projectIds) {
    disposeProjectWatchers(projectId);
  }
  void videoIOManager.dispose();
  void streamManager.dispose();
  void deckControlManager.dispose();
  fileLogger.write({ level: 'info', event: 'app-quit' });
  void fileLogger.dispose();
});

// ─── App Menu ──────────────────────────────────────────────────────────────────

function createAppMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' as const },
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
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new-project') },
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: openProject },
        { label: 'Import Media…', accelerator: 'CmdOrCtrl+I', click: () => mainWindow?.webContents.send('menu:import-media') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
        { label: 'Export…', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('menu:export') },
        { type: 'separator' },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : []),
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

ipcMain.handle('dialog:open-file', async (_event, opts) => {
  const result = await dialog.showOpenDialog(opts);
  return result;
});

ipcMain.handle('dialog:open', async (_event, opts) => {
  const result = await dialog.showOpenDialog(opts);
  return result;
});

ipcMain.handle('dialog:save-file', async (_event, opts) => {
  const result = await dialog.showSaveDialog(opts);
  return result;
});

ipcMain.handle('dialog:save', async (_event, opts) => {
  const result = await dialog.showSaveDialog(opts);
  return result;
});

ipcMain.handle('projects:list', async () => {
  return listPersistedProjects();
});

ipcMain.handle('projects:get', async (_event, projectId: string) => {
  return getPersistedProject(projectId);
});

ipcMain.handle('projects:save', async (_event, project: EditorProject) => {
  return savePersistedProject(project);
});

ipcMain.handle('projects:delete', async (_event, projectId: string) => {
  await deletePersistedProject(projectId);
  return true;
});

ipcMain.handle('projects:import-media', async (_event, projectId: string, filePaths: string[]) => {
  return importMediaIntoProject(projectId, filePaths);
});

ipcMain.handle('projects:scan-media', async (_event, projectId: string) => {
  return scanPersistedProjectMedia(projectId);
});

ipcMain.handle('projects:relink-media', async (_event, projectId: string, searchRoots: string[]) => {
  return relinkPersistedProjectMedia(projectId, searchRoots);
});

ipcMain.handle('projects:add-watch-folder', async (_event, projectId: string, folderPath: string) => {
  return addProjectWatchFolder(projectId, folderPath);
});

ipcMain.handle('projects:remove-watch-folder', async (_event, projectId: string, watchFolderId: string) => {
  return removeProjectWatchFolder(projectId, watchFolderId);
});

ipcMain.handle('projects:rescan-watch-folders', async (_event, projectId: string) => {
  return rescanProjectWatchFolders(projectId);
});

ipcMain.handle('jobs:list', async () => {
  return Array.from(desktopJobs.values()).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
});

ipcMain.handle('jobs:start-export', async (_event, project: EditorProject) => {
  return startExportJob(project);
});

ipcMain.handle('fs:read-text', async (_event, filePath: string) => {
  return readFile(filePath, 'utf8');
});

ipcMain.handle('fs:write-text', async (_event, filePath: string, contents: string) => {
  await writeFile(filePath, contents, 'utf8');
  return true;
});

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:get-media-tools', async () => getMediaToolPaths());
ipcMain.handle('gpu:info', async () => detectGPU());
