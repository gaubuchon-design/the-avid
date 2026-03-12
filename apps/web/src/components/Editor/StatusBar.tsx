import React from 'react';
import { useEditorStore } from '../../store/editor.store';
import { usePlayerStore } from '../../store/player.store';
import { Timecode } from '../../lib/timecode';

export function StatusBar() {
  const {
    tracks,
    playheadTime,
    isPlaying,
    projectSettings,
    sequenceSettings,
    lastSavedAt,
    saveStatus,
    hasUnsavedChanges,
    videoMonitorTrackId,
    trimMode,
    trimActive,
    trimSelectionLabel,
    trimCounterFrames,
  } = useEditorStore();
  const activeMonitor = usePlayerStore((s) => s.activeMonitor);
  const tc = new Timecode({ fps: sequenceSettings?.fps || projectSettings?.frameRate || 24, dropFrame: sequenceSettings?.dropFrame });
  const monitorTrackLabel = videoMonitorTrackId
    ? (tracks.find((track) => track.id === videoMonitorTrackId)?.name ?? videoMonitorTrackId)
    : 'AUTO';
  const saveLabel = saveStatus === 'saving'
    ? 'Saving...'
    : saveStatus === 'error'
      ? 'Save error'
      : hasUnsavedChanges
        ? 'Unsaved changes'
        : lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'Editorial project ready';
  const projectFormatLabel = projectSettings
    ? `${projectSettings.width}x${projectSettings.height} · ${projectSettings.frameRate}fps · ${projectSettings.exportFormat.toUpperCase()}`
    : '';

  return (
    <div className="status-bar">
      <div className="status-item">
        <div className={`status-dot${isPlaying ? ' warning' : ''}`} />
        <span>Monitor: {activeMonitor.toUpperCase()} {monitorTrackLabel}</span>
      </div>
      <div className="status-item">
        <span>Playhead: {tc.secondsToTC(playheadTime)}</span>
      </div>
      {trimActive && (
        <div className="status-item">
          <span>Trim: {trimMode.toUpperCase()} {trimSelectionLabel} {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f</span>
        </div>
      )}
      <div className="status-spacer" />
      <div className="status-item">
        <span>{saveLabel}</span>
      </div>
      {projectFormatLabel && (
        <div className="status-item">
          <span>{projectFormatLabel}</span>
        </div>
      )}
    </div>
  );
}
