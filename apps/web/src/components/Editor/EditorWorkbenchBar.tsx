import React from 'react';
import { buildProjectFromEditorState, buildProjectPersistenceSnapshot } from '../../lib/editorProjectState';
import type { WorkspacePreset } from '../../App';
import { useCollabStore } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';
import { Timecode } from '../../lib/timecode';
import { PageNavigation, type EditorPage } from '../PageNavigation/PageNavigation';

interface EditorWorkbenchBarProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
  workspace: WorkspacePreset;
  onWorkspaceChange: (workspace: WorkspacePreset) => void;
  presets: Record<WorkspacePreset, { label: string; panels: string[] }>;
}

function getRuntimeLabel(isDesktop: boolean): string {
  return isDesktop ? 'Desktop workstation' : 'Web collaborative';
}

function getMonitorLabel(layout: 'source-record' | 'full-frame'): string {
  return layout === 'source-record' ? 'Source + Record' : 'Record';
}

export function EditorWorkbenchBar({
  activePage,
  onPageChange,
  workspace,
  onWorkspaceChange,
  presets,
}: EditorWorkbenchBarProps) {
  const tracks = useEditorStore((s) => s.tracks);
  const playheadTime = useEditorStore((s) => s.playheadTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const composerLayout = useEditorStore((s) => s.composerLayout);
  const projectSettings = useEditorStore((s) => s.projectSettings);
  const sequenceSettings = useEditorStore((s) => s.sequenceSettings);
  const trimMode = useEditorStore((s) => s.trimMode);
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimSelectionLabel = useEditorStore((s) => s.trimSelectionLabel);
  const trimCounterFrames = useEditorStore((s) => s.trimCounterFrames);

  const isDesktop = Boolean(window.electronAPI);
  const videoTracks = tracks.filter((track) => track.type === 'VIDEO').length;
  const audioTracks = tracks.filter((track) => track.type === 'AUDIO').length;
  const clipCount = tracks.reduce((total, track) => total + track.clips.length, 0);
  const fps = sequenceSettings?.fps || projectSettings?.frameRate || 24;
  const tc = new Timecode({
    fps,
    dropFrame: sequenceSettings?.dropFrame,
  });
  const projectId = useEditorStore((s) => s.projectId);
  const projectName = useEditorStore((s) => s.projectName);
  const saveProject = useEditorStore((s) => s.saveProject);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const versions = useCollabStore((s) => s.versions);
  const saveVersion = useCollabStore((s) => s.saveVersion);
  const formatLabel = projectSettings
    ? `${projectSettings.width}x${projectSettings.height} · ${projectSettings.frameRate}fps`
    : `${fps}fps`;
  const saveStateLabel = saveStatus === 'saving'
    ? 'Saving'
    : saveStatus === 'error'
      ? 'Save error'
      : hasUnsavedChanges
        ? 'Unsaved changes'
        : lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'Saved';

  const handleSave = React.useCallback(() => {
    void saveProject();
  }, [saveProject]);

  const handleCheckpoint = React.useCallback(async () => {
    if (!projectId) {
      return;
    }

    await saveProject();
    const state = useEditorStore.getState();
    if (state.saveStatus === 'error') {
      return;
    }

    const snapshot = buildProjectPersistenceSnapshot(state);
    if (!snapshot) {
      return;
    }

    const checkpointTime = new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    saveVersion(
      `${projectName || 'Project'} ${checkpointTime}`,
      'Manual checkpoint from the editor workbench.',
      buildProjectFromEditorState(snapshot),
    );
  }, [projectId, projectName, saveProject, saveVersion]);

  return (
    <section className="workbench-bar" aria-label="Editorial workbench">
      <div className="workbench-primary">
        <PageNavigation activePage={activePage} onPageChange={onPageChange} />

        {activePage === 'edit' && (
          <>
            <div className="workbench-divider" />
            <div className="workbench-workspaces" role="tablist" aria-label="Editorial workspaces">
              {(Object.entries(presets) as [WorkspacePreset, { label: string; panels: string[] }][]).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={`workbench-chip${workspace === key ? ' active' : ''}`}
                  onClick={() => onWorkspaceChange(key)}
                  aria-pressed={workspace === key}
                  title={preset.label}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="workbench-actions" aria-label="Project save controls">
        <span className={`workbench-save-state${hasUnsavedChanges ? ' dirty' : ''}${saveStatus === 'error' ? ' error' : ''}`}>
          {saveStateLabel}
        </span>
        <button
          type="button"
          className="workbench-action primary"
          onClick={handleSave}
          disabled={!projectId || saveStatus === 'saving'}
        >
          Save
        </button>
        <button
          type="button"
          className="workbench-action"
          onClick={() => { void handleCheckpoint(); }}
          disabled={!projectId || saveStatus === 'saving'}
        >
          Checkpoint
        </button>
      </div>

      <div className="workbench-metrics" aria-label="Editor session details">
        <div className="workbench-metric">
          <span className="workbench-metric-label">Mode</span>
          <span className="workbench-metric-value">{getRuntimeLabel(isDesktop)}</span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Format</span>
          <span className="workbench-metric-value">{formatLabel}</span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Editorial</span>
          <span className="workbench-metric-value">{videoTracks}V / {audioTracks}A · {clipCount} clips</span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Monitor</span>
          <span className="workbench-metric-value">{getMonitorLabel(composerLayout)}</span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Transport</span>
          <span className="workbench-metric-value">{isPlaying ? 'Playing' : 'Parked'} · {tc.secondsToTC(playheadTime)}</span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Trim</span>
          <span className="workbench-metric-value">
            {trimActive ? `${trimMode.toUpperCase()} ${trimSelectionLabel} ${trimCounterFrames > 0 ? '+' : ''}${trimCounterFrames}f` : 'OFF'}
          </span>
        </div>
        <div className="workbench-metric">
          <span className="workbench-metric-label">Versions</span>
          <span className="workbench-metric-value">{versions.length}</span>
        </div>
      </div>
    </section>
  );
}
