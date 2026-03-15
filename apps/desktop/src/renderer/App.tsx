import React, { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { hydrateProject } from '@mcua/core';
import {
  DashboardPage,
  EditorPage,
  useEditorStore,
  PlatformProvider,
} from '@mcua/editor';
import type { PlatformCapabilities, MediaJob } from '@mcua/editor';
import { saveProjectToRepository } from '@mcua/editor/lib/projectRepository';

// ─── Desktop Platform Capabilities ──────────────────────────────────────────

function buildDesktopCapabilities(): PlatformCapabilities {
  const api = window.electronAPI;
  return {
    surface: 'desktop',
    hasNativePlayback: true,
    hasHardwareAccess: true,
    fs: api ? {
      readTextFile: (filePath) => api.readTextFile(filePath),
      writeTextFile: async (filePath, content) => { await api.writeTextFile(filePath, content); },
      showOpenDialog: async (options) => {
        const result = await api.openFile({
          title: options?.title,
          filters: options?.filters,
          properties: [
            'openFile',
            ...(options?.multiSelections ? ['multiSelections' as const] : []),
            ...(options?.directory ? ['openDirectory' as const] : []),
          ],
        });
        return result.canceled ? [] : result.filePaths;
      },
      showSaveDialog: async (options) => {
        const result = await api.saveFile({
          title: options?.title,
          defaultPath: options?.defaultPath,
          filters: options?.filters,
        });
        return result.canceled ? null : (result.filePath ?? null);
      },
    } : undefined,
    media: api ? {
      ingestFiles: async (filePaths) => {
        const assets = await api.importMedia('', filePaths);
        return assets.length > 0 ? assets[0]!.id : '';
      },
      listJobs: async () => {
        const jobs = await api.listDesktopJobs();
        return jobs.map((j): MediaJob => ({
          id: j.id,
          status: j.status === 'QUEUED' ? 'queued'
            : j.status === 'RUNNING' ? 'running'
            : j.status === 'COMPLETED' ? 'completed'
            : 'failed',
          progress: j.progress,
          label: j.label,
          error: j.error,
        }));
      },
      cancelJob: async () => { /* desktop jobs not cancellable via this path yet */ },
      onJobUpdate: (cb) => api.onDesktopJobUpdate((job) => {
        cb({
          id: job.id,
          status: job.status === 'QUEUED' ? 'queued'
            : job.status === 'RUNNING' ? 'running'
            : job.status === 'COMPLETED' ? 'completed'
            : 'failed',
          progress: job.progress,
          label: job.label,
          error: job.error,
        });
      }),
    } : undefined,
    app: api ? {
      checkForUpdates: async () => { await api.app.checkForUpdates(); },
      installUpdate: () => api.app.installUpdate(),
      getVersion: () => api.app.platform ?? '0.0.0',
    } : undefined,
  };
}

// ─── Error Boundary ─────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#101013',
          color: '#efeff2',
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ color: '#9d9da7', marginBottom: 24, maxWidth: 480 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = '/';
            }}
            style={{
              backgroundColor: '#81818d',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Return to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Update Banner ──────────────────────────────────────────────────────────────

interface DesktopUpdateBannerState {
  currentVersion: string;
  channel: string;
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  availableVersion: string | null;
  downloadPercent: number | null;
  message: string | null;
  error: string | null;
  checkedAt: string | null;
  restartScheduled: boolean;
  autoInstallOnQuit: boolean;
}

function UpdateBanner() {
  const [updateState, setUpdateState] = useState<DesktopUpdateBannerState | null>(null);
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    void window.electronAPI.app.getUpdateState().then((info) => {
      setUpdateState(info);
    });

    const disposeState = window.electronAPI.onUpdateState((info) => {
      setUpdateState(info);
      if (info.status !== 'error' && info.status !== 'downloaded') {
        setDismissedToken(null);
      }
    });

    return () => {
      disposeState();
    };
  }, []);

  if (!updateState) return null;

  if (updateState.status === 'disabled' || updateState.status === 'idle' || updateState.status === 'up-to-date') {
    return null;
  }

  const dismissToken = updateState.status === 'error'
    ? updateState.error
    : updateState.status === 'downloaded' && !updateState.restartScheduled
      ? updateState.availableVersion
      : null;
  if (dismissToken && dismissToken === dismissedToken) {
    return null;
  }

  const targetVersion = updateState.availableVersion ?? updateState.currentVersion;
  let label = updateState.message ?? `Version ${targetVersion}`;

  if (updateState.status === 'checking') {
    label = 'Checking for updates...';
  }
  if (updateState.status === 'available' || updateState.status === 'downloading') {
    label = `Downloading update ${targetVersion}${updateState.downloadPercent !== null ? ` (${Math.round(updateState.downloadPercent)}%)` : '...'}`;
  }
  if (updateState.status === 'downloaded') {
    label = updateState.restartScheduled
      ? `Installing update ${targetVersion} and restarting...`
      : `Update ${targetVersion} ready to install`;
  }
  if (updateState.status === 'error') {
    label = updateState.error ?? 'Automatic update check failed.';
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      backgroundColor: '#232329',
      border: '1px solid #50505a',
      borderRadius: 12,
      padding: '14px 16px',
      color: '#efeff2',
      fontSize: 13,
      zIndex: 9999,
      width: 'min(420px, calc(100vw - 24px))',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      flexWrap: 'wrap',
      boxShadow: '0 18px 48px rgba(0, 0, 0, 0.28)',
    }}>
      <div style={{
        flex: '1 1 220px',
        minWidth: 0,
        lineHeight: 1.45,
        whiteSpace: 'normal',
        wordBreak: 'break-word',
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
        flex: '0 1 auto',
        flexWrap: 'wrap',
        marginLeft: 'auto',
      }}>
        {updateState.status === 'downloaded' ? (
          <>
            {!updateState.restartScheduled ? (
              <>
                <button
                  onClick={() => window.electronAPI?.app.installUpdate()}
                  style={{
                    backgroundColor: '#81818d',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Restart Now
                </button>
                <button
                  onClick={() => setDismissedToken(updateState.availableVersion ?? 'downloaded')}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#9d9da7',
                    border: 'none',
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Later
                </button>
              </>
            ) : null}
          </>
        ) : updateState.status === 'error' ? (
          <>
            <button
              onClick={() => {
                setDismissedToken(null);
                void window.electronAPI?.app.checkForUpdates();
              }}
              style={{
                backgroundColor: '#81818d',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Retry
            </button>
            <button
              onClick={() => setDismissedToken(updateState.error ?? 'error')}
              style={{
                backgroundColor: 'transparent',
                color: '#9d9da7',
                border: 'none',
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            {updateState.status === 'checking' ? null : (
              <button
                onClick={() => void window.electronAPI?.app.checkForUpdates()}
                style={{
                  backgroundColor: 'transparent',
                  color: '#9d9da7',
                  border: 'none',
                  fontSize: 12,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Check Again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const navigate = useNavigate();
  const handleOpenProject = useCallback(async (filePath: string) => {
    try {
      const serialized = await window.electronAPI?.readTextFile(filePath);
      if (!serialized) {
        return;
      }
      const project = await saveProjectToRepository(hydrateProject(JSON.parse(serialized)));
      navigate(`/editor/${project.id}`);
    } catch (error) {
      console.error('Failed to open project file', error);
    }
  }, [navigate]);

  const handleDeepLink = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'avid:') return;

      const projectId = parsed.searchParams.get('project');
      if (parsed.hostname === 'open' && projectId) {
        navigate(`/editor/${encodeURIComponent(projectId)}`);
        return;
      }

      if (parsed.hostname === 'new') {
        navigate('/editor/new');
        return;
      }

      console.warn('[DeepLink] Unrecognized deep link:', url);
    } catch (error) {
      console.error('[DeepLink] Failed to parse deep link:', error);
    }
  }, [navigate]);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const disposeNewProject = window.electronAPI.onNewProject(() => navigate('/editor/new'));
    const disposeOpenProject = window.electronAPI.onOpenProject(handleOpenProject);
    const disposeDeepLink = window.electronAPI.onDeepLink(handleDeepLink);

    return () => {
      disposeNewProject();
      disposeOpenProject();
      disposeDeepLink();
    };
  }, [navigate, handleOpenProject, handleDeepLink]);

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    void window.electronAPI.listDesktopJobs().then((jobs) => {
      useEditorStore.setState({ desktopJobs: jobs as never });
    }).catch((error) => {
      console.warn('[DesktopJobs] Failed to list desktop jobs:', error);
    });

    return window.electronAPI.onDesktopJobUpdate((job) => {
      useEditorStore.setState((state) => {
        const existing = state.desktopJobs.findIndex((j) => j.id === job.id);
        const updated = [...state.desktopJobs];
        if (existing >= 0) {
          updated[existing] = job as never;
        } else {
          updated.push(job as never);
        }
        return { desktopJobs: updated };
      });
    });
  }, []);

  return (
    <PlatformProvider capabilities={buildDesktopCapabilities()}>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/editor/:projectId" element={<EditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpdateBanner />
      </ErrorBoundary>
    </PlatformProvider>
  );
}
