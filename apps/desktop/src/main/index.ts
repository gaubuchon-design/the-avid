import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Tray,
  TouchBar,
  Notification,
  nativeTheme,
  screen,
  crashReporter,
  protocol,
  powerMonitor,
  systemPreferences,
  nativeImage,
} from 'electron';
import { watch as watchFs } from 'node:fs';
import { mkdir, readdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'path';
import { randomBytes } from 'node:crypto';
import { flattenAssets, PROJECT_SCHEMA_VERSION } from '@mcua/core';
import type { EditorBin, EditorMediaAsset, EditorProject } from '@mcua/core';
import { detectGPU } from './gpu';
import { FileLogger } from './logging/FileLogger';
import { VideoIOManager } from './videoIO/VideoIOManager';
import { DesktopParityPlaybackManager } from './parity/DesktopParityPlaybackManager';
import { StreamManager } from './streaming/StreamManager';
import { DeckControlManager } from './deckControl/DeckControlManager';
import {
  createProjectMediaPaths,
  ensureProjectMediaPaths,
  getMediaToolPaths,
  ingestMediaFile,
  mergeIntoMediaIndex,
  relinkProjectMedia,
  resolveImportSourcePaths,
  scanProjectMedia,
  scanWatchFolderIntoProject,
  sanitizeFileName,
  transcodeExportArtifact,
  writeConformExportPackage,
  writeMediaIndexManifest,
} from './mediaPipeline';
import {
  BackgroundMediaService,
  type BackgroundMediaJob,
  type BackgroundMediaJobResult,
  type BackgroundMediaResourceSnapshot,
} from './BackgroundMediaService';
import { DesktopAutoUpdateService } from './DesktopAutoUpdateService';

// ─── GPU Acceleration Command-Line Flags ──────────────────────────────────────

// Enable hardware acceleration flags before app is ready.
// These must be set synchronously at module load time.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// ─── Supported File Extensions ────────────────────────────────────────────────

const NLE_FILE_EXTENSIONS = ['.avid', '.aaf', '.omf', '.mxf', '.avidproj', '.avidproj.json'] as const;

/** Pre-built Set for O(1) extension lookup instead of O(n) .some(). */
const NLE_EXTENSION_SET: ReadonlySet<string> = new Set(NLE_FILE_EXTENSIONS);

function isSupportedMediaFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  // Check the longest possible extension first (.avidproj.json = 15 chars),
  // then shorter ones. Most files have a 3-4 char extension so the shorter
  // checks will hit first in practice.
  for (const ext of NLE_EXTENSION_SET) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

// ─── Crash Reporter ────────────────────────────────────────────────────────────

crashReporter.start({
  productName: 'The Avid',
  submitURL: '', // Collected locally only until a crash server is configured
  uploadToServer: false,
  compress: true,
});

// ─── IPC Rate Limiter ─────────────────────────────────────────────────────────

/**
 * Simple per-channel sliding window rate limiter.
 * Prevents runaway renderer processes from flooding the main process
 * with IPC calls.
 */
class IPCRateLimiter {
  // Use a circular buffer per channel instead of an array with shift().
  // shift() is O(n) because it re-indexes all elements; a circular buffer
  // tracks head/tail indices for O(1) insert and O(1) eviction.
  private windows = new Map<string, { buf: number[]; head: number; count: number }>();
  private readonly maxCalls: number;
  private readonly windowMs: number;

  constructor(maxCalls = 100, windowMs = 1000) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  /**
   * Returns true if the call is allowed, false if rate-limited.
   */
  check(channel: string): boolean {
    const now = Date.now();
    let ring = this.windows.get(channel);
    if (!ring) {
      ring = { buf: new Array<number>(this.maxCalls + 1), head: 0, count: 0 };
      this.windows.set(channel, ring);
    }

    // Evict timestamps outside the sliding window (O(1) amortized via head advance)
    const cutoff = now - this.windowMs;
    while (ring.count > 0 && ring.buf[ring.head]! < cutoff) {
      ring.head = (ring.head + 1) % ring.buf.length;
      ring.count--;
    }

    if (ring.count >= this.maxCalls) {
      return false;
    }

    // Append timestamp to ring buffer tail
    const tail = (ring.head + ring.count) % ring.buf.length;
    ring.buf[tail] = now;
    ring.count++;
    return true;
  }
}

const ipcRateLimiter = new IPCRateLimiter(120, 1000);

// ─── Auto-Save Infrastructure ─────────────────────────────────────────────────

const AUTO_SAVE_INTERVAL_MS = 60_000; // 1 minute
let autoSaveTimer: ReturnType<typeof setInterval> | null = null;
let dirtyProjectIds = new Set<string>();

function markProjectDirty(projectId: string): void {
  dirtyProjectIds.add(projectId);
}

async function autoSaveAllDirtyProjects(): Promise<void> {
  if (dirtyProjectIds.size === 0) return;

  const ids = [...dirtyProjectIds];
  dirtyProjectIds = new Set<string>();

  for (const projectId of ids) {
    try {
      const project = await getPersistedProject(projectId);
      if (project) {
        await savePersistedProject(project);
        log('info', 'AutoSave', `Auto-saved project "${project.name}"`, { projectId });
      }
    } catch (error) {
      log('error', 'AutoSave', `Failed to auto-save project ${projectId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      // Re-mark as dirty so next tick retries
      dirtyProjectIds.add(projectId);
    }
  }
}

function startAutoSaveTimer(): void {
  if (autoSaveTimer) return;
  autoSaveTimer = setInterval(() => {
    void autoSaveAllDirtyProjects();
  }, AUTO_SAVE_INTERVAL_MS);
}

function stopAutoSaveTimer(): void {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ─── Protocol Handler Registration ────────────────────────────────────────────

// Register avid:// as a privileged scheme before app is ready.
// This must happen synchronously at module load time.
if (process.defaultApp) {
  const entryScript = process.argv[1];
  if (entryScript) {
    app.setAsDefaultProtocolClient('avid', process.execPath, [path.resolve(entryScript)]);
  }
} else {
  app.setAsDefaultProtocolClient('avid');
}

// Queue deep links received before the renderer is ready.
let pendingDeepLink: string | null = null;

// ─── File Association Queue ───────────────────────────────────────────────────

// On macOS, files opened via Finder arrive through the 'open-file' event before
// the renderer is ready. Queue the path so we can forward it once the window is
// available.
let pendingFileOpen: string | null = null;

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

function assertNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid parameter "${name}": expected a finite number`);
  }
}

// ─── File Path Sanitization ──────────────────────────────────────────────────

/**
 * Allowed root directories for file system operations initiated from the renderer.
 * Prevents path traversal attacks that could read/write arbitrary system files.
 */
function getAllowedFSRoots(): string[] {
  return [
    app.getPath('userData'),
    app.getPath('documents'),
    app.getPath('downloads'),
    app.getPath('desktop'),
    app.getPath('temp'),
    app.getPath('home'),
  ];
}

/**
 * Validate that a file path from the renderer is within an allowed root.
 * Resolves the path to prevent directory traversal (e.g., ../../etc/passwd).
 */
function sanitizeFilePath(filePath: string, name: string): string {
  assertString(filePath, name);

  const resolved = path.resolve(filePath);

  // Block null bytes (path traversal via null byte injection)
  if (resolved.includes('\0')) {
    throw new Error(`Invalid parameter "${name}": path contains null bytes`);
  }

  const allowedRoots = getAllowedFSRoots();
  const isAllowed = allowedRoots.some((root) => resolved.startsWith(root));
  if (!isAllowed) {
    throw new Error(
      `Invalid parameter "${name}": path "${resolved}" is outside allowed directories`,
    );
  }

  return resolved;
}

// ─── IPC Error Serialization ─────────────────────────────────────────────────

/**
 * Serialize an error for safe transport across the IPC boundary.
 * Electron strips non-standard Error properties, so we normalize them.
 */
function serializeIPCError(error: unknown): { message: string; code?: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as NodeJS.ErrnoException).code,
      stack: app.isPackaged ? undefined : error.stack,
    };
  }
  return { message: String(error) };
}

/**
 * Wrap an IPC handler with rate limiting and error serialization.
 */
function registerSafeHandler(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!ipcRateLimiter.check(channel)) {
      throw new Error(`Rate limit exceeded for channel "${channel}"`);
    }
    try {
      return await handler(event, ...args);
    } catch (error) {
      const serialized = serializeIPCError(error);
      throw new Error(serialized.message);
    }
  });
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
let tray: Tray | null = null;
let isQuitting = false;
const secondaryWindows = new Set<BrowserWindow>();
const videoIOManager = new VideoIOManager();
const streamManager = new StreamManager();
const deckControlManager = new DeckControlManager();
const parityPlaybackManager = new DesktopParityPlaybackManager({
  getProjectPackagePath,
  ensureProjectPackageDir,
  outputBindings: {
    startPlayback: async (config) => {
      const result = await videoIOManager.startPlayback(config);
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to start playback on ${config.deviceId}`);
      }
    },
    stopPlayback: async (deviceId) => {
      const result = await videoIOManager.stopPlayback(deviceId);
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to stop playback on ${deviceId}`);
      }
    },
    sendFrame: async (deviceId, frameData) => {
      const result = await videoIOManager.sendFrame(deviceId, frameData);
      if (!result.ok) {
        throw new Error(result.error ?? `Failed to send frame to ${deviceId}`);
      }
    },
  },
});
const PROJECT_STORE_DIR = 'projects';
const PROJECT_FILE_EXTENSION = '.avidproj.json';
const PROJECT_MANIFEST_FILE = 'project.avid.json';
const RECENT_PROJECTS_FILE = 'recent-projects.json';
const MAX_RECENT_PROJECTS = 10;
const HW_ACCEL_SETTINGS_FILE = 'hw-accel-settings.json';
const desktopJobs = new Map<string, DesktopJob>();
const projectWatchers = new Map<string, Map<string, ReturnType<typeof watchFs>>>();
const watchFolderScansInFlight = new Set<string>();
const autoUpdateService = new DesktopAutoUpdateService({
  getWindow: () => mainWindow,
  canAutoRestart: () => dirtyProjectIds.size === 0 && !hasActiveDesktopJobs(),
  log,
});

// ─── Hardware Acceleration Settings ──────────────────────────────────────────

interface HWAccelSettings {
  enabled: boolean;
  preferHardwareDecode: boolean;
  preferHardwareEncode: boolean;
  forceGPU: 'auto' | 'nvidia' | 'amd' | 'intel' | 'apple' | 'software';
}

const defaultHWAccelSettings: HWAccelSettings = {
  enabled: true,
  preferHardwareDecode: true,
  preferHardwareEncode: true,
  forceGPU: 'auto',
};

async function loadHWAccelSettings(): Promise<HWAccelSettings> {
  try {
    const raw = await readFile(
      path.join(app.getPath('userData'), HW_ACCEL_SETTINGS_FILE),
      'utf8',
    );
    return { ...defaultHWAccelSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultHWAccelSettings };
  }
}

async function saveHWAccelSettings(settings: HWAccelSettings): Promise<void> {
  await writeFile(
    path.join(app.getPath('userData'), HW_ACCEL_SETTINGS_FILE),
    JSON.stringify(settings, null, 2),
    'utf8',
  );
}

// ─── Recent Projects ─────────────────────────────────────────────────────────

interface RecentProject {
  id: string;
  name: string;
  filePath: string;
  openedAt: string;
}

async function loadRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await readFile(
      path.join(app.getPath('userData'), RECENT_PROJECTS_FILE),
      'utf8',
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRecentProjects(recents: RecentProject[]): Promise<void> {
  await writeFile(
    path.join(app.getPath('userData'), RECENT_PROJECTS_FILE),
    JSON.stringify(recents, null, 2),
    'utf8',
  );
}

async function addRecentProject(project: EditorProject): Promise<void> {
  const recents = await loadRecentProjects();
  const entry: RecentProject = {
    id: project.id,
    name: project.name,
    filePath: getProjectManifestPath(project.id),
    openedAt: new Date().toISOString(),
  };

  // Remove existing entry for same project if present
  const filtered = recents.filter((r) => r.id !== project.id);
  filtered.unshift(entry);

  const trimmed = filtered.slice(0, MAX_RECENT_PROJECTS);
  await saveRecentProjects(trimmed);

  // Update the native "Recent Documents" on macOS/Windows
  if (process.platform === 'darwin' || process.platform === 'win32') {
    app.addRecentDocument(entry.filePath);
  }
}

async function clearRecentProjects(): Promise<void> {
  await saveRecentProjects([]);
  app.clearRecentDocuments();
}

// ─── Native Notifications ────────────────────────────────────────────────────

function showNativeNotification(
  title: string,
  body: string,
  options?: { silent?: boolean; urgency?: 'normal' | 'critical' | 'low' },
): void {
  if (!Notification.isSupported()) return;

  const notification = new Notification({
    title,
    body,
    silent: options?.silent ?? false,
    urgency: options?.urgency ?? 'normal',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : undefined,
  });

  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  notification.show();
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createSystemTray(): void {
  // On macOS, use a 16x16 template image for the menu bar
  const trayIconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, '../../resources/tray-icon.png');

  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(trayIconPath);
    if (process.platform === 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      trayIcon.setTemplateImage(true);
    }
  } catch {
    // If no tray icon file exists, create a minimal one
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('The Avid');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show The Avid',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'New Project',
      click: () => sendMenuCommand('menu:new-project'),
    },
    {
      label: 'Open Project...',
      click: () => openProject(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

type DesktopJob = BackgroundMediaJob;

// ─── Taskbar Progress ─────────────────────────────────────────────────────────

/**
 * Update the OS taskbar/dock progress indicator based on active jobs.
 * On macOS this shows progress in the dock badge, on Windows it shows
 * in the taskbar button.
 */
function updateTaskbarProgress(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const activeJobs = Array.from(desktopJobs.values()).filter(
    (j) => j.status === 'RUNNING' || j.status === 'QUEUED',
  );

  if (activeJobs.length === 0) {
    mainWindow.setProgressBar(-1); // Remove progress indicator
    return;
  }

  // Average progress across all active jobs
  const totalProgress = activeJobs.reduce((sum, j) => sum + j.progress, 0);
  const averageProgress = totalProgress / (activeJobs.length * 100);
  mainWindow.setProgressBar(Math.min(1, Math.max(0, averageProgress)));
}

function hasActiveDesktopJobs(): boolean {
  return Array.from(desktopJobs.values()).some(
    (job) => job.status === 'RUNNING' || job.status === 'QUEUED',
  );
}

function collectBackgroundMediaResources(): BackgroundMediaResourceSnapshot {
  const cpuCount = Math.max(1, os.cpus().length);
  const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));
  const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024));
  const loadAverage = os.loadavg()[0] ?? 0;

  return {
    cpuCount,
    totalMemoryMB,
    freeMemoryMB,
    loadAverage,
  };
}

// ─── Touch Bar (macOS) ───────────────────────────────────────────────────────

function createTouchBar(): TouchBar {
  const { TouchBarButton, TouchBarSpacer } = TouchBar;

  const playButton = new TouchBarButton({
    label: '\u25B6',
    click: () => sendMenuCommand('menu:mark-in'),
  });

  const stopButton = new TouchBarButton({
    label: '\u25A0',
    click: () => sendMenuCommand('menu:mark-out'),
  });

  const razorButton = new TouchBarButton({
    label: '\u2702 Razor',
    click: () => sendMenuCommand('menu:razor'),
  });

  const markerButton = new TouchBarButton({
    label: '\u2691 Marker',
    click: () => sendMenuCommand('menu:add-marker'),
  });

  const saveButton = new TouchBarButton({
    label: '\u2B07 Save',
    click: () => sendMenuCommand('menu:save'),
  });

  return new TouchBar({
    items: [
      playButton,
      stopButton,
      new TouchBarSpacer({ size: 'small' }),
      razorButton,
      markerButton,
      new TouchBarSpacer({ size: 'flexible' }),
      saveButton,
    ],
  });
}

function createId(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

function findBinByIdMutable(bins: EditorBin[], binId: string): EditorBin | null {
  for (const bin of bins) {
    if (bin.id === binId) {
      return bin;
    }

    const nested = findBinByIdMutable(bin.children, binId);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function ensureDesktopImportBin(project: EditorProject, binId?: string): EditorBin {
  if (binId) {
    const existing = findBinByIdMutable(project.bins, binId);
    if (existing) {
      return existing;
    }
  }

  const firstBin = project.bins[0];
  if (firstBin) {
    return firstBin;
  }

  const bin: EditorBin = {
    id: createId('bin'),
    name: 'Imported Media',
    color: '#4f63f5',
    parentId: undefined,
    children: [],
    assets: [],
    isOpen: true,
  };
  project.bins.unshift(bin);
  return bin;
}

function appendImportedAssetsToBin(bin: EditorBin, assets: EditorMediaAsset[]): void {
  const existingIds = new Set(bin.assets.map((asset) => asset.id));
  for (const asset of assets) {
    if (!existingIds.has(asset.id)) {
      bin.assets.unshift(asset);
      existingIds.add(asset.id);
    }
  }
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
    return JSON.parse(serialized) as unknown as EditorProject;
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
  await parityPlaybackManager.syncProject(nextProject);
  await syncProjectWatchers(nextProject);
  void addRecentProject(nextProject);
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

  // Update OS taskbar/dock progress indicator
  updateTaskbarProgress();

  return nextJob;
}

const backgroundMediaService = new BackgroundMediaService({
  collectResources: collectBackgroundMediaResources,
  upsertJob: (job) => upsertDesktopJob(job as DesktopJob),
  maxConcurrentJobs: 3,
});

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
  try {
    await backgroundMediaService.enqueue({
      id: jobId,
      kind: 'INDEX',
      projectId,
      label: `${reason === 'manual' ? 'Rescanning' : 'Watching'} ${watchFolder.name}`,
      detail: `Scanning ${watchFolder.path}`,
      minimumFreeMemoryMB: 1024,
      runLocal: async (context): Promise<BackgroundMediaJobResult> => {
        context.reportProgress(12, 'Collecting watch-folder delta');
        const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));
        const { project: updatedProject, summary } = await scanWatchFolderIntoProject(project, watchFolder, mediaPaths);
        context.reportProgress(72, 'Persisting updated media index');
        await savePersistedProject(updatedProject);
        return {
          outputPath: watchFolder.path,
          detail: summary.importedCount > 0
            ? `Imported ${summary.importedCount} new asset(s)`
            : 'Media index is already current',
        };
      },
    }).completion;
  } catch (error) {
    log('warn', 'WatchFolderScan', 'Background watch-folder scan failed', {
      projectId,
      watchFolderId,
      error: error instanceof Error ? error.message : String(error),
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

async function importMediaIntoProject(
  projectId: string,
  filePaths: string[],
  binId?: string,
): Promise<EditorMediaAsset[]> {
  const project = await getPersistedProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  await ensureProjectPackageDir(projectId);
  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(projectId));
  const resolvedPaths = await resolveImportSourcePaths(filePaths);
  if (resolvedPaths.length === 0) {
    throw new Error('No importable files were found in the dropped selection');
  }
  const targetBin = ensureDesktopImportBin(project, binId);

  const jobId = createId('job');
  const { completion } = backgroundMediaService.enqueue<{
    assets: EditorMediaAsset[];
    outputPath?: string;
    detail?: string;
  }>({
    id: jobId,
    kind: 'INGEST',
    projectId,
    label: `Ingesting, indexing, and organizing ${resolvedPaths.length} file${resolvedPaths.length === 1 ? '' : 's'}`,
    detail: `Preparing ${resolvedPaths.length} source file${resolvedPaths.length === 1 ? '' : 's'}`,
    minimumFreeMemoryMB: 1536,
    runLocal: async (context) => {
      const assets: EditorMediaAsset[] = [];
      const errors: string[] = [];

      for (let index = 0; index < resolvedPaths.length; index += 1) {
        const sourcePath = resolvedPaths[index]!;
        context.reportProgress(
          Math.round((index / Math.max(resolvedPaths.length, 1)) * 100),
          `Ingesting ${path.basename(sourcePath)}`,
        );

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
          logger.write({ level: 'error', event: 'ingest-file-error', sourcePath, error: message });
        }
      }

      if (assets.length > 0) {
        appendImportedAssetsToBin(targetBin, assets);
        context.reportProgress(86, 'Saving project media index');
        await savePersistedProject(project);
      }

      if (assets.length === 0 && errors.length > 0) {
        throw new Error(`${errors.length} file(s) failed: ${errors.join('; ')}`);
      }

      return {
        assets,
        outputPath: mediaPaths.mediaPath,
        detail: errors.length > 0
          ? `${errors.length} file(s) failed: ${errors.join('; ')}`
          : `Imported ${assets.length} asset(s)`,
      };
    },
  });

  const result = await completion;
  return result.assets;
}

async function startExportJob(project: EditorProject): Promise<DesktopJob> {
  await ensureProjectPackageDir(project.id);
  const mediaPaths = createProjectMediaPaths(getProjectPackagePath(project.id));

  const jobId = createId('job');
  const queued = backgroundMediaService.enqueue({
    id: jobId,
    kind: 'EXPORT',
    projectId: project.id,
    label: `Exporting ${project.name}`,
    detail: 'Preparing conform package',
    minimumFreeMemoryMB: 2048,
    runLocal: async (context): Promise<BackgroundMediaJobResult> => {
      context.reportProgress(12, 'Writing media index manifest');
      await writeMediaIndexManifest(project.id, flattenAssets(project.bins), mediaPaths);

      context.reportProgress(40, 'Packaging sequence metadata');
      await new Promise((resolve) => setTimeout(resolve, 120));

      context.reportProgress(68, 'Conforming editorial package');
      const exportPath = await writeConformExportPackage(
        project,
        mediaPaths,
        sanitizeFileName(project.name.toLowerCase()),
      );

      context.reportProgress(96, 'Finalizing export package');
      return {
        outputPath: exportPath,
        detail: `Export package written for ${project.name}`,
      };
    },
  });

  void queued.completion.then(() => {
    showNativeNotification(
      'Export Complete',
      `"${project.name}" has been exported successfully.`,
    );
  }).catch((error) => {
    showNativeNotification(
      'Export Failed',
      `Failed to export "${project.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      { urgency: 'critical' },
    );
  });

  return queued.job as DesktopJob;
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
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:3000');
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

  // Prompt for unsaved changes before closing (unless force-quitting)
  win.on('close', (event) => {
    if (!isQuitting) {
      // On macOS, hide the window instead of closing it (standard behavior)
      if (process.platform === 'darwin') {
        event.preventDefault();
        win.hide();
        return;
      }
    }
    // Save window state one final time before actually closing
    void saveWindowState(win);
  });

  win.on('closed', () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    mainWindow = null;
  });

  // Prevent unintended navigation (security hardening)
  win.webContents.on('will-navigate', (event, url) => {
    if (!app.isPackaged) {
      const devServerOrigin = new URL(
        process.env['ELECTRON_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:3000',
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

  // Touch Bar (macOS)
  if (process.platform === 'darwin') {
    win.setTouchBar(createTouchBar());
  }

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
    const devUrl = process.env['ELECTRON_RENDERER_URL'] ?? process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:3000';
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
  const handleDeepLink = (url: string): void => {
    log('info', 'DeepLink', 'Received deep link', { url });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:deep-link', url);
    } else {
      pendingDeepLink = url;
    }
  };

  const handleFileOpen = (filePath: string): void => {
    log('info', 'FileOpen', 'Received file open request', { filePath });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:open-project', filePath);
    } else {
      pendingFileOpen = filePath;
    }
  };

  app.on('second-instance', (_event, argv, _workingDir) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle deep link (avid://) from second instance on Windows/Linux
    const deepLinkArg = argv.find((arg) => arg.startsWith('avid://'));
    if (deepLinkArg) {
      handleDeepLink(deepLinkArg);
      return;
    }

    // Handle file open from OS (double-click on supported file while app is running)
    const fileArg = argv.find((arg) => isSupportedMediaFile(arg));
    if (fileArg) {
      handleFileOpen(fileArg);
    }
  });

  // macOS: deep link via open-url (avid://...)
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // macOS: file association via Finder double-click
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (isSupportedMediaFile(filePath)) {
      handleFileOpen(filePath);
    }
  });

  // ─── GPU Process Crash Recovery ────────────────────────────────────────────

  app.on('child-process-gone', (_event, details) => {
    if (details.type === 'GPU') {
      log('error', 'GPU', 'GPU process crashed', {
        reason: details.reason,
        exitCode: details.exitCode,
        name: details.name,
      });

      // The GPU process will auto-restart for the first crash. If it keeps
      // crashing (reason === 'launch-failed'), inform the user.
      if (details.reason === 'launch-failed' && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'GPU Acceleration Unavailable',
          message: 'The GPU process failed to start. The editor will continue with software rendering, which may affect playback performance.',
          buttons: ['OK'],
        });
      }
    }
  });

  app.whenReady().then(async () => {
    await logger.init();
    log('info', 'App', `Starting The Avid v${app.getVersion()} on ${process.platform} (${process.arch})`);

    // Register avid:// protocol to handle local file serving if needed
    protocol.handle('avid', (request) => {
      // avid://open?project=<id> style links are handled via IPC, not file serving.
      // Return an empty response to avoid ERR_UNKNOWN_URL_SCHEME.
      log('info', 'Protocol', 'Protocol request received', { url: request.url });
      return new Response('', { status: 204 });
    });

    mainWindow = await createMainWindow();
    createAppMenu();
    void syncAllProjectWatchers();

    // Deliver any deep link or file open that arrived before the window was ready
    mainWindow.webContents.once('did-finish-load', () => {
      if (pendingDeepLink) {
        mainWindow?.webContents.send('app:deep-link', pendingDeepLink);
        pendingDeepLink = null;
      }
      if (pendingFileOpen) {
        mainWindow?.webContents.send('menu:open-project', pendingFileOpen);
        pendingFileOpen = null;
      }
      autoUpdateService.emitState();
    });

    // Create system tray
    createSystemTray();

    // Start auto-save timer for dirty projects
    startAutoSaveTimer();

    // Initialize professional I/O subsystems (non-blocking — missing modules are OK)
    videoIOManager.registerIPCHandlers();
    parityPlaybackManager.registerIPCHandlers();
    streamManager.registerIPCHandlers();
    deckControlManager.registerIPCHandlers();

    const ioResults = await Promise.allSettled([
      videoIOManager.init(mainWindow),
      streamManager.init(mainWindow),
      deckControlManager.init(mainWindow),
    ]);
    log('info', 'IO', 'Professional I/O subsystems initialized', {
      videoIO: ioResults[0]!.status,
      streaming: ioResults[1]!.status,
      deckControl: ioResults[2]!.status,
    });

    // Power monitor — pause background work when system sleeps
    powerMonitor.on('suspend', () => {
      log('info', 'Power', 'System entering sleep — pausing background tasks');
    });
    powerMonitor.on('resume', () => {
      log('info', 'Power', 'System resumed — resuming background tasks');
      // Re-sync watch folders after wake (files may have changed while sleeping)
      void syncAllProjectWatchers();
    });
    powerMonitor.on('shutdown', () => {
      log('info', 'Power', 'System shutting down');
      isQuitting = true;
    });

    // Dark mode change notification to renderer
    nativeTheme.on('updated', () => {
      mainWindow?.webContents.send('app:theme-changed', {
        shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
        themeSource: nativeTheme.themeSource,
      });
    });

    app.on('activate', () => {
      // On macOS, re-show the hidden window on dock click
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      } else if (BrowserWindow.getAllWindows().length === 0) {
        void createMainWindow().then((win) => { mainWindow = win; });
      }
    });

    autoUpdateService.start();
    autoUpdateService.scheduleStartupCheck();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;

  // Stop auto-save timer and flush any dirty projects one final time
  stopAutoSaveTimer();
  void autoSaveAllDirtyProjects();

  // Collect keys first to avoid mutating the map during iteration
  const projectIds = [...projectWatchers.keys()];
  for (const projectId of projectIds) {
    disposeProjectWatchers(projectId);
  }
  void videoIOManager.dispose();
  void streamManager.dispose();
  void deckControlManager.dispose();
  log('info', 'App', 'Application quitting');
  void logger.dispose();

  // Clean up system tray
  if (tray) {
    tray.destroy();
    tray = null;
  }
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
        {
          label: 'Open Recent',
          role: 'recentDocuments' as const,
          submenu: [
            {
              label: 'Clear Recent',
              role: 'clearRecentDocuments' as const,
              click: () => void clearRecentProjects(),
            },
          ],
        },
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
            await autoUpdateService.checkForUpdates('manual');
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
  if (!('id' in project) || typeof project['id'] !== 'string') {
    throw new Error('Project must have a valid string "id" field');
  }
  return savePersistedProject(project as unknown as EditorProject);
});

ipcMain.handle('projects:delete', async (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  await deletePersistedProject(projectId);
  return true;
});

ipcMain.handle('projects:import-media', async (_event, projectId: unknown, filePaths: unknown, binId: unknown) => {
  assertString(projectId, 'projectId');
  assertStringArray(filePaths, 'filePaths');
  if (binId !== undefined) {
    assertString(binId, 'binId');
  }
  if (filePaths.length === 0) {
    throw new Error('filePaths must contain at least one path');
  }
  return importMediaIntoProject(projectId, filePaths, binId as string | undefined);
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

// ─── RAW Codec Status ─────────────────────────────────────────────────────────

ipcMain.handle('codecs:raw-status', async () => {
  const { getRawCodecStatus } = await import('./rawCodecRegistry');
  return getRawCodecStatus();
});

// ─── Job Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('jobs:list', async () => {
  return Array.from(desktopJobs.values()).sort((left, right) => {
    return right.updatedAt.localeCompare(left.updatedAt);
  });
});

ipcMain.handle('jobs:start-export', async (_event, project: unknown) => {
  assertObject(project, 'project');
  if (!('id' in project) || typeof project['id'] !== 'string') {
    throw new Error('Project must have a valid string "id" field');
  }
  return startExportJob(project as unknown as EditorProject);
});

ipcMain.handle('jobs:transcode-export-artifact', async (_event, payload: unknown) => {
  assertObject(payload, 'payload');

  const {
    jobId,
    sourceArtifact,
    sourceContainer,
    targetContainer,
    targetVideoCodec,
    targetAudioCodec,
    fps,
    width,
    height,
  } = payload as Record<string, unknown>;

  assertString(jobId, 'jobId');
  if (!(sourceArtifact instanceof Uint8Array)) {
    throw new Error('Invalid parameter "sourceArtifact": expected Uint8Array');
  }
  assertString(sourceContainer, 'sourceContainer');
  assertString(targetContainer, 'targetContainer');
  if (targetVideoCodec !== undefined && typeof targetVideoCodec !== 'string') {
    throw new Error('Invalid parameter "targetVideoCodec": expected string');
  }
  if (targetAudioCodec !== undefined && typeof targetAudioCodec !== 'string') {
    throw new Error('Invalid parameter "targetAudioCodec": expected string');
  }
  if (fps !== undefined && typeof fps !== 'number') {
    throw new Error('Invalid parameter "fps": expected number');
  }
  if (width !== undefined && typeof width !== 'number') {
    throw new Error('Invalid parameter "width": expected number');
  }
  if (height !== undefined && typeof height !== 'number') {
    throw new Error('Invalid parameter "height": expected number');
  }

  const outputDirectory = path.join(app.getPath('documents'), 'The Avid', 'exports', 'handoff');
  return backgroundMediaService.enqueue({
    id: `${jobId}-transcode`,
    kind: 'TRANSCODE',
    projectId: 'export-handoff',
    label: `Transcoding export handoff ${jobId}`,
    detail: `${sourceContainer.toUpperCase()} -> ${targetContainer.toUpperCase()}`,
    minimumFreeMemoryMB: 2048,
    runLocal: async (context) => {
      context.reportProgress(10, 'Preparing transcoder handoff');
      const result = await transcodeExportArtifact({
        jobId,
        sourceArtifact,
        sourceContainer,
        targetContainer,
        targetVideoCodec,
        targetAudioCodec,
        fps,
        width,
        height,
      }, outputDirectory);
      context.reportProgress(96, 'Writing output artifact');
      return {
        ...result,
        outputPath: result.outputPath,
        detail: `${result.outputContainer.toUpperCase()} handoff ready`,
      };
    },
  }).completion;
});

// ─── File System Handlers (path sanitization) ─────────────────────────────────

registerSafeHandler('fs:read-text', async (_event, filePath: unknown) => {
  const resolved = sanitizeFilePath(filePath as string, 'filePath');
  return readFile(resolved, 'utf8');
});

registerSafeHandler('fs:write-text', async (_event, filePath: unknown, contents: unknown) => {
  const resolved = sanitizeFilePath(filePath as string, 'filePath');
  if (typeof contents !== 'string') {
    throw new Error('Invalid parameter "contents": expected a string');
  }
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
ipcMain.handle('app:download-update', async () => {
  return autoUpdateService.downloadUpdate();
});
ipcMain.handle('app:check-for-updates', async () => {
  return autoUpdateService.checkForUpdates('manual');
});
ipcMain.handle('app:get-update-state', () => {
  return autoUpdateService.getState();
});
ipcMain.handle('app:install-update', () => {
  autoUpdateService.installUpdate();
});

ipcMain.handle('gpu:info', async () => detectGPU());

// ─── Recent Projects Handlers ──────────────────────────────────────────────

ipcMain.handle('projects:recent', async () => {
  return loadRecentProjects();
});

ipcMain.handle('projects:add-recent', async (_event, project: unknown) => {
  assertObject(project, 'project');
  if (!('id' in project) || typeof project['id'] !== 'string') {
    throw new Error('Project must have a valid string "id" field');
  }
  await addRecentProject(project as unknown as EditorProject);
  return true;
});

ipcMain.handle('projects:clear-recent', async () => {
  await clearRecentProjects();
  return true;
});

// ─── Hardware Acceleration Settings Handlers ───────────────────────────────

ipcMain.handle('hw-accel:get-settings', async () => {
  return loadHWAccelSettings();
});

ipcMain.handle('hw-accel:save-settings', async (_event, settings: unknown) => {
  assertObject(settings, 'settings');
  const validated: HWAccelSettings = {
    enabled: typeof settings['enabled'] === 'boolean' ? settings['enabled'] : defaultHWAccelSettings.enabled,
    preferHardwareDecode: typeof settings['preferHardwareDecode'] === 'boolean' ? settings['preferHardwareDecode'] : defaultHWAccelSettings.preferHardwareDecode,
    preferHardwareEncode: typeof settings['preferHardwareEncode'] === 'boolean' ? settings['preferHardwareEncode'] : defaultHWAccelSettings.preferHardwareEncode,
    forceGPU: typeof settings['forceGPU'] === 'string'
      && ['auto', 'nvidia', 'amd', 'intel', 'apple', 'software'].includes(settings['forceGPU'])
      ? settings['forceGPU'] as HWAccelSettings['forceGPU']
      : defaultHWAccelSettings.forceGPU,
  };
  await saveHWAccelSettings(validated);
  return validated;
});

// ─── Native Notification Handler ───────────────────────────────────────────

ipcMain.handle('app:notify', async (_event, opts: unknown) => {
  assertObject(opts, 'opts');
  const title = typeof opts['title'] === 'string' ? opts['title'] : 'The Avid';
  const body = typeof opts['body'] === 'string' ? opts['body'] : '';
  showNativeNotification(title, body);
  return true;
});

// ─── Theme / Dark Mode Handlers ────────────────────────────────────────────

ipcMain.handle('app:get-theme', () => ({
  shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
  themeSource: nativeTheme.themeSource,
}));

ipcMain.handle('app:set-theme', (_event, themeSource: unknown) => {
  if (themeSource === 'dark' || themeSource === 'light' || themeSource === 'system') {
    nativeTheme.themeSource = themeSource;
    return true;
  }
  return false;
});

// ─── Window Control Handlers ───────────────────────────────────────────────

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
  return true;
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
  return true;
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('window:is-fullscreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle('window:set-title', (_event, title: unknown) => {
  if (typeof title === 'string' && mainWindow) {
    mainWindow.setTitle(title);
    return true;
  }
  return false;
});

// ─── Unsaved Changes Confirmation ──────────────────────────────────────────

ipcMain.handle('app:confirm-discard', async (_event, projectName: unknown) => {
  if (!mainWindow) return 'discard';
  const name = typeof projectName === 'string' ? projectName : 'Untitled';
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'warning',
    title: 'Unsaved Changes',
    message: `"${name}" has unsaved changes. Do you want to save before closing?`,
    buttons: ['Save', 'Discard', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  return result === 0 ? 'save' : result === 1 ? 'discard' : 'cancel';
});

// ─── Drag & Drop File Import ───────────────────────────────────────────────

ipcMain.handle('app:get-dropped-file-info', async (_event, filePaths: unknown) => {
  assertStringArray(filePaths, 'filePaths');
  const results: Array<{ path: string; name: string; size: number; isDirectory: boolean }> = [];
  const { stat: statFn } = await import('node:fs/promises');
  for (const filePath of filePaths) {
    try {
      const info = await statFn(filePath);
      results.push({
        path: filePath,
        name: path.basename(filePath),
        size: info.size,
        isDirectory: info.isDirectory(),
      });
    } catch {
      // Skip inaccessible files
    }
  }
  return results;
});

// ─── System Info ───────────────────────────────────────────────────────────

ipcMain.handle('app:system-info', () => ({
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions['electron'],
  chromeVersion: process.versions['chrome'],
  nodeVersion: process.versions['node'],
  appVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  cpus: os.cpus().length,
  totalMemory: os.totalmem(),
  freeMemory: os.freemem(),
  hostname: os.hostname(),
}));

// ─── Dirty Project Tracking IPC ──────────────────────────────────────────────

registerSafeHandler('projects:mark-dirty', (_event, projectId: unknown) => {
  assertString(projectId, 'projectId');
  markProjectDirty(projectId);
  return true;
});

registerSafeHandler('projects:auto-save-status', () => {
  return {
    dirtyCount: dirtyProjectIds.size,
    dirtyIds: [...dirtyProjectIds],
    intervalMs: AUTO_SAVE_INTERVAL_MS,
  };
});

// ─── Render Dispatch IPC ─────────────────────────────────────────────────────

registerSafeHandler('render:get-gpu-accel-args', async (_event, codec: unknown) => {
  if (typeof codec !== 'string' || !['h264', 'hevc', 'prores'].includes(codec)) {
    throw new Error('Invalid codec — expected "h264", "hevc", or "prores"');
  }
  const gpu = await detectGPU();
  const { getHWAccelFFmpegArgs } = await import('./gpu');
  return {
    gpu,
    ffmpegArgs: getHWAccelFFmpegArgs(gpu, codec as 'h264' | 'hevc' | 'prores'),
  };
});

registerSafeHandler('render:get-decode-args', async () => {
  const gpu = await detectGPU();
  const { getHWAccelDecodeArgs } = await import('./gpu');
  return {
    gpu,
    ffmpegArgs: getHWAccelDecodeArgs(gpu),
  };
});

// ─── Hardware Info IPC ────────────────────────────────────────────────────────

registerSafeHandler('hw:get-system-resources', () => {
  const cpus = os.cpus();
  const firstCpu = cpus[0];
  return {
    cpuModel: firstCpu?.model ?? 'Unknown',
    cpuCount: cpus.length,
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    freeMemoryMB: Math.round(os.freemem() / (1024 * 1024)),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    uptime: os.uptime(),
  };
});

registerSafeHandler('hw:get-displays', () => {
  const displays = screen.getAllDisplays();
  return displays.map((d) => ({
    id: d.id,
    label: d.label,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    rotation: d.rotation,
    internal: d.internal,
    colorSpace: d.colorSpace,
    size: d.size,
  }));
});

// ─── Window Drag & Drop File Filter ──────────────────────────────────────────

registerSafeHandler('app:filter-droppable-files', (_event, filePaths: unknown) => {
  assertStringArray(filePaths, 'filePaths');

  const MEDIA_EXTENSIONS = new Set([
    '.mp4', '.mov', '.mxf', '.avi', '.mkv', '.webm',
    '.mp3', '.wav', '.aiff', '.aif', '.flac', '.ogg', '.m4a', '.aac',
    '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif', '.webp', '.exr', '.dpx',
    '.avid', '.aaf', '.omf', '.edl', '.xml', '.fcpxml', '.avidproj',
    '.srt', '.vtt', '.ass', '.ssa',
  ]);

  return filePaths.filter((fp) => {
    const ext = path.extname(fp).toLowerCase();
    return MEDIA_EXTENSIONS.has(ext);
  });
});
