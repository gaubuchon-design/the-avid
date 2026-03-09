import React from 'react';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';

export function StatusBar() {
  const { tracks, duration, zoom, playheadTime, isPlaying, projectName, activePanel, projectSettings, sequenceSettings } = useEditorStore();
  const tc = new Timecode({ fps: sequenceSettings?.fps || projectSettings?.frameRate || 24, dropFrame: sequenceSettings?.dropFrame });
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const isDesktop = Boolean(window.electronAPI);
  const saveLabel = isDesktop ? 'Local project package' : 'Connected';
  const projectFormatLabel = projectSettings
    ? `${projectSettings.width}x${projectSettings.height} · ${projectSettings.frameRate}fps · ${projectSettings.exportFormat.toUpperCase()}`
    : '';

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
        <span>Duration: {tc.secondsToTC(duration)}</span>
      </div>
      <div className="status-item">
        <span>Playhead: {tc.secondsToTC(playheadTime)}</span>
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
      <div className="status-item">
        <span>{tc.fps}fps{tc.dropFrame ? ' DF' : ' NDF'}</span>
      </div>
    </div>
  );
}
