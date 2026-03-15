import React, { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';

// Save status indicator component
function SaveStatusIndicator() {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);

  const dotColor = (() => {
    switch (saveStatus) {
      case 'saved': return 'var(--success)';
      case 'saving': return 'var(--brand)';
      case 'unsaved': return 'var(--warning)';
      case 'error': return 'var(--error)';
      default: return 'var(--text-muted)';
    }
  })();

  const label = (() => {
    switch (saveStatus) {
      case 'saved': return 'Saved';
      case 'saving': return 'Saving...';
      case 'unsaved': return 'Unsaved';
      case 'error': return 'Save error';
      default: return 'Not saved';
    }
  })();

  return (
    <div className="status-item">
      <div className="status-dot" style={{
        background: dotColor,
        animation: saveStatus === 'saving' ? 'pulse 1s infinite' : 'none',
      }} />
      <span>{label}</span>
    </div>
  );
}

export function StatusBar() {
  const tracks = useEditorStore((s) => s.tracks);
  const duration = useEditorStore((s) => s.duration);
  const zoom = useEditorStore((s) => s.zoom);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const projectName = useEditorStore((s) => s.projectName);
  const projectSettings = useEditorStore((s) => s.projectSettings);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const projectId = useEditorStore((s) => s.projectId);
  const saveProject = useEditorStore((s) => s.saveProject);
  const markUnsaved = useEditorStore((s) => s.markUnsaved);

  const tc = new Timecode({ fps: sequenceSettings?.fps || projectSettings?.frameRate || 24, dropFrame: sequenceSettings?.dropFrame });
  const clipCount = tracks.reduce((n, t) => n + t.clips.length, 0);
  const isDesktop = Boolean(window.electronAPI);
  const projectFormatLabel = projectSettings
    ? `${projectSettings.width}\u00D7${projectSettings.height} ${projectSettings.frameRate}fps`
    : '';

  // Auto-save: debounced 30-second save on state changes
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTracksLenRef = useRef(tracks.length);
  const prevClipCountRef = useRef(clipCount);

  useEffect(() => {
    const tracksChanged = tracks.length !== prevTracksLenRef.current;
    const clipCountChanged = clipCount !== prevClipCountRef.current;
    prevTracksLenRef.current = tracks.length;
    prevClipCountRef.current = clipCount;

    if ((tracksChanged || clipCountChanged) && projectId) {
      markUnsaved();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        saveProject();
      }, 30000);
    }

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [tracks.length, clipCount, projectId, saveProject, markUnsaved]);

  return (
    <div className="status-bar">
      {/* Connection / mode */}
      <div className="status-item">
        <div className="status-dot" />
        <span>{isDesktop ? 'Desktop' : 'Connected'}</span>
      </div>

      {/* Project name */}
      <div className="status-item hide-mobile" style={{ color: 'var(--text-tertiary)' }}>
        {projectName}
      </div>

      <div className="divider hide-mobile" />

      {/* Track & clip counts */}
      <div className="status-item">
        <span>{tracks.length}T / {clipCount}C</span>
      </div>

      {/* Duration */}
      <div className="status-item hide-mobile">
        <span>{tc.secondsToTC(duration)}</span>
      </div>

      {/* Playhead TC */}
      <div className="status-item hide-mobile">
        <span>{tc.secondsToTC(playheadTime)}</span>
      </div>

      <div className="status-spacer" />

      {/* Play state */}
      <div className="status-item">
        {isPlaying ? (
          <><div className="status-dot" style={{ background: 'var(--error)', animation: 'pulse 1s infinite' }} /><span>Playing</span></>
        ) : (
          <span>Stopped</span>
        )}
      </div>

      <div className="divider" />

      {/* Save status */}
      <SaveStatusIndicator />

      {/* Desktop extras */}
      {isDesktop && (
        <div className="status-item hide-mobile">
          <span>Local</span>
        </div>
      )}

      {/* Format info */}
      <div className="status-item hide-mobile">
        <span>{projectFormatLabel}</span>
      </div>

      {/* FPS + zoom */}
      <div className="status-item hide-mobile">
        <span>{tc.fps}fps{tc.dropFrame ? ' DF' : ''}</span>
      </div>
      <div className="status-item hide-mobile">
        <span>{Math.round(zoom)}px/s</span>
      </div>
    </div>
  );
}
