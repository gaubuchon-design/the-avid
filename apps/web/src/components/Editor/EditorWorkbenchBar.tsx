import React from 'react';
import { buildProjectFromEditorState, buildProjectPersistenceSnapshot } from '../../lib/editorProjectState';
import type { WorkspacePreset } from '../../App';
import { useCollabStore } from '../../store/collab.store';
import { useEditorStore } from '../../store/editor.store';
import { PageNavigation, type EditorPage } from '../PageNavigation/PageNavigation';

interface EditorWorkbenchBarProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
  workspace: WorkspacePreset;
  onWorkspaceChange: (workspace: WorkspacePreset) => void;
  presets: Record<WorkspacePreset, { label: string; panels: string[] }>;
}

export function EditorWorkbenchBar({
  activePage,
  onPageChange,
  workspace,
  onWorkspaceChange,
  presets,
}: EditorWorkbenchBarProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const projectName = useEditorStore((s) => s.projectName);
  const saveProject = useEditorStore((s) => s.saveProject);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const saveVersion = useCollabStore((s) => s.saveVersion);
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
    </section>
  );
}
