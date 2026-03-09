import React, { useEffect, useState, useCallback, type ReactNode } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { hydrateProject } from '@mcua/core';
import { DashboardPage } from '../../../web/src/pages/DashboardPage';
import { EditorPage } from '../../../web/src/pages/EditorPage';
import { saveProjectToRepository } from '../../../web/src/lib/projectRepository';

// ─── Error Boundary ─────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#0f172a',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ color: '#94a3b8', marginBottom: 24, maxWidth: 480 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = '/';
            }}
            style={{
              backgroundColor: '#6366f1',
              color: '#fff',
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

function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; downloaded: boolean } | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    const disposeAvailable = window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo({ version: info.version, downloaded: false });
    });
    const disposeProgress = window.electronAPI.onUpdateProgress((info) => {
      setDownloadProgress(info.percent);
    });
    const disposeDownloaded = window.electronAPI.onUpdateDownloaded((info) => {
      setUpdateInfo({ version: info.version, downloaded: true });
      setDownloadProgress(null);
    });

    return () => {
      disposeAvailable();
      disposeProgress();
      disposeDownloaded();
    };
  }, []);

  if (!updateInfo) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      backgroundColor: '#312e81',
      border: '1px solid #6366f1',
      borderRadius: 8,
      padding: '12px 16px',
      color: '#e0e7ff',
      fontSize: 13,
      zIndex: 9999,
      maxWidth: 320,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {updateInfo.downloaded ? (
        <>
          <span>Update {updateInfo.version} ready</span>
          <button
            onClick={() => window.electronAPI?.app.installUpdate()}
            style={{
              backgroundColor: '#6366f1',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Restart to Update
          </button>
        </>
      ) : (
        <span>
          Downloading update {updateInfo.version}
          {downloadProgress !== null ? ` (${Math.round(downloadProgress)}%)` : '...'}
        </span>
      )}
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

  useEffect(() => {
    if (!window.electronAPI) {
      return;
    }

    const disposeNewProject = window.electronAPI.onNewProject(() => navigate('/editor/new'));
    const disposeOpenProject = window.electronAPI.onOpenProject(handleOpenProject);

    return () => {
      disposeNewProject();
      disposeOpenProject();
    };
  }, [navigate, handleOpenProject]);

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/editor/:projectId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <UpdateBanner />
    </ErrorBoundary>
  );
}
