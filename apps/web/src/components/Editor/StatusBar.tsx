import React from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function StatusBar() {
  const { tracks, duration, zoom, playheadTime, isPlaying, projectName, projectSettings, saveStatus, lastSavedAt, desktopJobs, activePanel } = useEditorStore();
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const isDesktop = Boolean(window.electronAPI);
  const activeDesktopJob = desktopJobs.find((job) => job.status === 'RUNNING' || job.status === 'QUEUED');
  const latestDesktopJob = activeDesktopJob ?? desktopJobs[0];
  const saveLabel = saveStatus === 'saving'
    ? 'Autosaving'
    : saveStatus === 'error'
    ? 'Save failed'
    : lastSavedAt
    ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Unsaved';
  const desktopJobLabel = !latestDesktopJob
    ? 'Offline-ready'
    : latestDesktopJob.status === 'FAILED'
    ? `${latestDesktopJob.kind} failed`
    : latestDesktopJob.status === 'COMPLETED'
    ? `${latestDesktopJob.kind === 'INGEST' ? 'Ingest ready' : 'Export ready'}`
    : `${latestDesktopJob.kind === 'INGEST' ? 'Ingesting media' : 'Exporting package'} ${latestDesktopJob.progress}%`;

  return (
    <div className="status-bar">
      <div className="status-item">
        <div className="status-dot" />
        <span>{isDesktop ? 'Local desktop mode' : 'Connected'}</span>
      </div>
      <div className="status-item" style={{ color: 'var(--text-tertiary)' }}>
        {projectName}
      </div>
      <div className="divider" />
      <div className="status-item">
        <span>{tracks.length} tracks</span>
      </div>
      <div className="status-item">
        <span>Workspace: {activePanel}</span>
      </div>
      <div className="status-item">
        <span>{clipCount} clips</span>
      </div>
      <div className="status-item">
        <span>Duration: {formatTC(duration)}</span>
      </div>
      <div className="status-item">
        <span>Playhead: {formatTC(playheadTime)}</span>
      </div>
      <div className="status-spacer" />
      <div className="status-item">
        {isPlaying ? (
          <><div className="status-dot" style={{ background: 'var(--error)', animation: 'pulse 1s infinite' }} /><span>Playing</span></>
        ) : (
          <span>Stopped</span>
        )}
      </div>
      <div className="divider" />
      <div className="status-item">
        <span>{saveLabel}</span>
      </div>
      {isDesktop && (
        <>
          <div className="status-item">
            <span>{desktopJobLabel}</span>
          </div>
          <div className="status-item">
            <span>Project package</span>
          </div>
        </>
      )}
      <div className="status-item">
        <span>Zoom: {Math.round(zoom)}px/s</span>
      </div>
      <div className="status-item">
        <span>{projectSettings.width}x{projectSettings.height} · {projectSettings.frameRate}fps · {projectSettings.exportFormat.toUpperCase()}</span>
      </div>
    </div>
  );
}
