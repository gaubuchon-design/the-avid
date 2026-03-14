import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import {
  resolveDesktopUpdateFeedConfig,
  summarizeDesktopUpdateError,
} from './DesktopUpdateSupport';

export type DesktopUpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'up-to-date'
  | 'error';

export interface DesktopUpdateState {
  currentVersion: string;
  channel: string;
  status: DesktopUpdateStatus;
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
  error: string | null;
  checkedAt: string | null;
  restartScheduled: boolean;
  autoInstallOnQuit: boolean;
}

export interface DesktopAutoUpdateServiceOptions {
  getWindow: () => BrowserWindow | null;
  canAutoRestart: () => boolean;
  log: (
    level: 'info' | 'warn' | 'error',
    tag: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  startupDelayMs?: number;
}

const STARTUP_DELAY_MS = 4_000;
const RESTART_DELAY_MS = 2_500;
const UPDATE_TAG = 'AutoUpdater';

function detectReleaseChannel(version: string): string {
  const prerelease = version.split('-', 2)[1];
  if (!prerelease) {
    return 'stable';
  }

  const [channel] = prerelease.split('.', 1);
  return channel || 'stable';
}

export class DesktopAutoUpdateService {
  private readonly channel = detectReleaseChannel(app.getVersion());
  private readonly state: DesktopUpdateState = {
    currentVersion: app.getVersion(),
    channel: this.channel,
    status: 'idle',
    availableVersion: null,
    downloadPercent: null,
    message: null,
    error: null,
    checkedAt: null,
    restartScheduled: false,
    autoInstallOnQuit: true,
  };
  private listenersBound = false;
  private startupCheckScheduled = false;
  private checkPromise: Promise<unknown> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: DesktopAutoUpdateServiceOptions) {}

  start(): void {
    if (this.listenersBound) {
      this.emitState();
      return;
    }

    this.bindListeners();

    if (!app.isPackaged && process.env['DESKTOP_ENABLE_DEV_UPDATER'] !== '1') {
      this.setState({
        status: 'disabled',
        message: 'Automatic updates are only enabled in packaged desktop builds.',
      });
      return;
    }

    if (!app.isPackaged) {
      autoUpdater.forceDevUpdateConfig = true;
    }

    // electron-updater reads app-update.yml, but it does not re-apply requestHeaders
    // from disk onto the runtime updater instance for generic feeds.
    const feedConfig = resolveDesktopUpdateFeedConfig({
      appPath: app.getAppPath(),
      channel: this.channel,
      env: process.env,
      forceDevUpdateConfig: autoUpdater.forceDevUpdateConfig,
      resourcesPath: process.resourcesPath,
    });

    if (feedConfig) {
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: feedConfig.url,
        channel: feedConfig.channel,
        ...(Object.keys(feedConfig.requestHeaders).length > 0
          ? { requestHeaders: feedConfig.requestHeaders }
          : {}),
      });

      this.options.log('info', UPDATE_TAG, 'Configured desktop update feed.', {
        channel: feedConfig.channel,
        requestHeaderCount: Object.keys(feedConfig.requestHeaders).length,
        url: feedConfig.url,
      });
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = this.channel !== 'stable';
    autoUpdater.logger = {
      info: (message: string) => this.options.log('info', UPDATE_TAG, message),
      warn: (message: string) => this.options.log('warn', UPDATE_TAG, message),
      error: (message: string) => this.options.log('error', UPDATE_TAG, message),
      debug: (message: string) => this.options.log('info', `${UPDATE_TAG}:debug`, message),
    } as unknown as typeof autoUpdater.logger;

    this.setState({
      status: 'idle',
      message: 'Updater initialized.',
      autoInstallOnQuit: autoUpdater.autoInstallOnAppQuit,
    });
  }

  scheduleStartupCheck(): void {
    if (this.startupCheckScheduled || this.state.status === 'disabled') {
      return;
    }

    this.startupCheckScheduled = true;
    const delay = Math.max(0, this.options.startupDelayMs ?? STARTUP_DELAY_MS);
    setTimeout(() => {
      void this.checkForUpdates('startup');
    }, delay);
  }

  async checkForUpdates(reason: 'startup' | 'manual' = 'manual'): Promise<unknown> {
    if (this.state.status === 'disabled') {
      return null;
    }

    if (this.checkPromise) {
      return this.checkPromise;
    }

    const label = reason === 'startup'
      ? 'Checking for updates on startup...'
      : 'Checking for updates...';
    this.setState({
      status: 'checking',
      message: label,
      error: null,
      checkedAt: new Date().toISOString(),
      restartScheduled: false,
    });

    this.checkPromise = autoUpdater.checkForUpdates()
      .catch((error) => {
        this.handleError(error);
        return null;
      })
      .finally(() => {
        this.checkPromise = null;
      });

    return this.checkPromise;
  }

  async downloadUpdate(): Promise<boolean> {
    if (this.state.status === 'disabled') {
      return false;
    }

    if (this.state.status === 'downloading' || this.state.status === 'downloaded') {
      return true;
    }

    try {
      this.setState({
        status: 'downloading',
        message: this.state.availableVersion
          ? `Downloading version ${this.state.availableVersion}...`
          : 'Downloading update...',
      });
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      this.handleError(error);
      return false;
    }
  }

  installUpdate(): void {
    if (this.state.status === 'disabled') {
      return;
    }
    this.scheduleRestartInstall('manual');
  }

  getState(): DesktopUpdateState {
    return { ...this.state };
  }

  emitState(): void {
    const window = this.options.getWindow();
    if (!window || window.isDestroyed()) {
      return;
    }
    window.webContents.send('app:update-state', this.getState());
  }

  private bindListeners(): void {
    this.listenersBound = true;

    autoUpdater.on('checking-for-update', () => {
      this.options.log('info', UPDATE_TAG, 'Checking for updates.');
      this.setState({
        status: 'checking',
        message: 'Checking for updates...',
        checkedAt: new Date().toISOString(),
        error: null,
      });
    });

    autoUpdater.on('update-available', (info) => {
      this.options.log('info', UPDATE_TAG, `Update available: ${info.version}`);
      this.setState({
        status: 'available',
        availableVersion: info.version,
        downloadPercent: 0,
        message: `Downloading version ${info.version}...`,
        error: null,
      });
      this.options.getWindow()?.webContents.send('app:update-available', { version: info.version });
    });

    autoUpdater.on('update-not-available', () => {
      this.options.log('info', UPDATE_TAG, 'Application is up to date.');
      this.setState({
        status: 'up-to-date',
        availableVersion: null,
        downloadPercent: null,
        message: 'The Avid is up to date.',
        error: null,
        restartScheduled: false,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const percent = Number.isFinite(progress.percent) ? progress.percent : 0;
      this.setState({
        status: 'downloading',
        downloadPercent: percent,
        message: this.state.availableVersion
          ? `Downloading version ${this.state.availableVersion}...`
          : 'Downloading update...',
      });
      this.options.getWindow()?.webContents.send('app:update-progress', { percent });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.options.log('info', UPDATE_TAG, `Update downloaded: ${info.version}`);
      this.setState({
        status: 'downloaded',
        availableVersion: info.version,
        downloadPercent: 100,
        message: `Version ${info.version} is ready to install.`,
        error: null,
      });
      this.options.getWindow()?.webContents.send('app:update-downloaded', { version: info.version });

      if (this.options.canAutoRestart()) {
        this.scheduleRestartInstall('auto');
      } else {
        this.setState({
          message: `Version ${info.version} will install when you restart or quit the app.`,
        });
      }
    });

    autoUpdater.on('error', (error) => {
      this.handleError(error);
    });
  }

  private scheduleRestartInstall(reason: 'auto' | 'manual'): void {
    if (this.restartTimer) {
      return;
    }

    const versionLabel = this.state.availableVersion ? ` ${this.state.availableVersion}` : '';
    const message = reason === 'auto'
      ? `Update${versionLabel} downloaded. Restarting to install...`
      : `Installing update${versionLabel} and restarting...`;

    this.setState({
      status: 'downloaded',
      restartScheduled: true,
      message,
      error: null,
    });

    const delay = reason === 'manual' ? 200 : RESTART_DELAY_MS;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.options.log('info', UPDATE_TAG, 'Installing downloaded update and restarting.');
      autoUpdater.quitAndInstall(false, true);
    }, delay);
  }

  private handleError(error: unknown): void {
    const summary = summarizeDesktopUpdateError(error);
    this.options.log('error', UPDATE_TAG, summary.detail, {
      kind: summary.kind,
      statusCode: summary.statusCode ?? undefined,
    });
    this.setState({
      status: 'error',
      error: summary.userMessage,
      message: summary.userMessage,
      restartScheduled: false,
    });
  }

  private setState(patch: Partial<DesktopUpdateState>): void {
    Object.assign(this.state, patch, {
      currentVersion: app.getVersion(),
      channel: this.channel,
      autoInstallOnQuit: autoUpdater.autoInstallOnAppQuit,
    });
    this.emitState();
  }
}
