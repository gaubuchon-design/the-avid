import React from 'react';
import { useEditorStore } from '../../store/editor.store';

function formatTC(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

export function StatusBar() {
  const { tracks, duration, zoom, playheadTime, isPlaying, projectName, activePanel } = useEditorStore();
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const isDesktop = Boolean(window.electronAPI);
  const saveLabel = isDesktop ? 'Local project package' : 'Connected';
  const projectFormatLabel = '3840x2160 · 24fps · MOV';

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
            <span>Native desktop pipeline</span>
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
        <span>{projectFormatLabel}</span>
      </div>
    </div>
  );
}
