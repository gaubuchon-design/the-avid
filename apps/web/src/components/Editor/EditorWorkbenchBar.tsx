import React from 'react';
import { useEditorStore } from '../../store/editor.store';
import { PageNavigation, type EditorPage } from '../PageNavigation/PageNavigation';

interface EditorWorkbenchBarProps {
  activePage: EditorPage;
  onPageChange: (page: EditorPage) => void;
}

export function EditorWorkbenchBar({
  activePage,
  onPageChange,
}: EditorWorkbenchBarProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const projectName = useEditorStore((s) => s.projectName);
  const saveProject = useEditorStore((s) => s.saveProject);
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const hasUnsavedChanges = useEditorStore((s) => s.hasUnsavedChanges);
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
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

  return (
    <section className="workbench-bar" aria-label="Editorial workbench">
      <div className="workbench-primary">
        <PageNavigation activePage={activePage} onPageChange={onPageChange} />
        <div className="workbench-divider" />
        <span className="workbench-save-state">{projectName || 'Untitled Project'}</span>
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
      </div>
    </section>
  );
}
