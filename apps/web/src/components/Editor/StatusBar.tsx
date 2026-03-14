import React from 'react';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';

export function StatusBar() {
  const { tracks, duration, zoom, playheadTime, isPlaying, projectName, activePanel, projectSettings, sequenceSettings } = useEditorStore();
  // New Avid-parity state (gracefully handle if not yet added to store)
  const editMode = useEditorStore((s) => (s as any).editMode) as string | undefined;
  const syncLockedTrackIds = useEditorStore((s) => (s as any).syncLockedTrackIds) as string[] | undefined;
  const trimMode = useEditorStore((s) => (s as any).trimMode) as { active: boolean; side: string | null } | undefined;

  const tc = new Timecode({ fps: sequenceSettings?.fps || projectSettings?.frameRate || 24, dropFrame: sequenceSettings?.dropFrame });
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const isDesktop = Boolean(window.electronAPI);
  const saveLabel = isDesktop ? 'Local project package' : 'Connected';
  const projectFormatLabel = projectSettings
    ? `${projectSettings.width}x${projectSettings.height} · ${projectSettings.frameRate}fps · ${projectSettings.exportFormat.toUpperCase()}`
    : '';
  const syncLockCount = syncLockedTrackIds?.length ?? 0;
  const isTrimming = trimMode?.active ?? false;

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
      {/* Edit Mode indicator (Avid-style) */}
      {editMode && (
        <div className="status-item" title="Edit mode: controls how clips are inserted into the timeline">
          <span style={{
            fontWeight: 600,
            color: editMode === 'insert' ? 'var(--brand-bright)' : 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {editMode === 'insert' ? 'Insert' : 'Overwrite'}
          </span>
        </div>
      )}
      {/* Sync Lock indicator */}
      {syncLockCount > 0 && (
        <div className="status-item" title={`${syncLockCount} track${syncLockCount > 1 ? 's' : ''} sync-locked`}>
          <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
            SyncLk:{syncLockCount}
          </span>
        </div>
      )}
      {/* Trim Mode indicator */}
      {isTrimming && (
        <div className="status-item">
          <span style={{ color: 'var(--error-text)', fontWeight: 600, animation: 'pulse 1s infinite' }}>
            TRIM {trimMode?.side?.toUpperCase()}
          </span>
        </div>
      )}
      <div className="divider" />
      <div className="status-item">
        <span>{tracks.length} tracks</span>
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
