import React from 'react';
import { useEditorStore } from '../../store/editor.store';
import { PageNavigation, type EditorPage } from '../PageNavigation/PageNavigation';
import {
  markInForActiveMonitor,
  markOutForActiveMonitor,
  matchFrameAtPlayhead,
} from '../../lib/editorMonitorActions';
import type { EditTool } from '../../store/editor.store';

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
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);
  const liftEdit = useEditorStore((s) => s.liftEdit);
  const extractEdit = useEditorStore((s) => s.extractEdit);
  const hasUnsavedChanges = saveStatus === 'unsaved';
  const trimActive = useEditorStore((s) => s.trimActive);
  const trimMode = useEditorStore((s) => s.trimMode);
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

  const toolButtons: Array<{ id: EditTool; label: string }> = [
    { id: 'select', label: 'Select' },
    { id: 'trim', label: 'Trim' },
    { id: 'razor', label: 'Blade' },
    { id: 'slip', label: 'Slip' },
    { id: 'slide', label: 'Slide' },
  ];

  const actionButtons = [
    { label: 'Mark In', onClick: markInForActiveMonitor },
    { label: 'Mark Out', onClick: markOutForActiveMonitor },
    { label: 'Match', onClick: matchFrameAtPlayhead },
    { label: 'Insert', onClick: insertEdit },
    { label: 'Overwrite', onClick: overwriteEdit },
    { label: 'Lift', onClick: liftEdit },
    { label: 'Extract', onClick: extractEdit },
  ];

  return (
    <section className="workbench-bar" aria-label="Editorial workbench">
      <div className="workbench-primary">
        <PageNavigation activePage={activePage} onPageChange={onPageChange} />
        <div className="workbench-divider" />
        <span className="workbench-project-pill">{projectName || 'Untitled Project'}</span>
        {activePage === 'edit' && (
          <>
            <div className="workbench-divider" />
            <div className="workbench-toolbelt" aria-label="Editorial tools">
              {toolButtons.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`workbench-tool${activeTool === tool.id ? ' active' : ''}`}
                  onClick={() => setActiveTool(tool.id)}
                  aria-pressed={activeTool === tool.id}
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <div className="workbench-divider" />
            <div className="workbench-edit-actions" aria-label="Editorial actions">
              {actionButtons.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="workbench-edit-action"
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="workbench-actions" aria-label="Project save controls">
        {activePage === 'edit' && (
          <span className={`workbench-mode-pill${trimActive ? ' active' : ''}`}>
            {trimActive ? `Trim ${trimMode.toUpperCase()}` : `${activeTool.toUpperCase()} Tool`}
          </span>
        )}
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
