import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEditorStore } from '../../store/editor.store';

// ── Mock heavy child components to keep tests focused on layout ─────────────

vi.mock('../../components/SourceMonitor/SourceMonitor', () => ({
  SourceMonitor: () => <div data-testid="source-monitor">SourceMonitor</div>,
}));

vi.mock('../../components/RecordMonitor/RecordMonitor', () => ({
  RecordMonitor: () => <div data-testid="record-monitor">RecordMonitor</div>,
}));

vi.mock('../../components/Monitor/MonitorArea', () => ({
  MonitorArea: () => <div data-testid="monitor-area">MonitorArea</div>,
}));

vi.mock('../../components/Bins/BinPanel', () => ({
  BinPanel: () => <div data-testid="bin-panel">BinPanel</div>,
}));

vi.mock('../../components/TimelinePanel/TimelinePanel', () => ({
  TimelinePanel: () => <div data-testid="timeline-panel">TimelinePanel</div>,
}));

vi.mock('../../components/Editor/InspectorPanel', () => ({
  InspectorPanel: () => <div data-testid="inspector-panel">InspectorPanel</div>,
}));

vi.mock('../../components/Toolbar/Toolbar', () => ({
  Toolbar: () => <div data-testid="toolbar">Toolbar</div>,
}));

vi.mock('../../components/Editor/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">StatusBar</div>,
}));

vi.mock('../../components/ExportPanel/ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel">ExportPanel</div>,
}));

vi.mock('../../components/NewProjectDialog/NewProjectDialog', () => ({
  NewProjectDialog: () => <div data-testid="new-project-dialog" />,
}));

vi.mock('../../components/SequenceDialog/SequenceDialog', () => ({
  SequenceDialog: () => <div data-testid="sequence-dialog" />,
}));

vi.mock('../../components/TitleTool/TitleTool', () => ({
  TitleTool: () => <div data-testid="title-tool" />,
}));

vi.mock('../../components/SubtitleEditor/SubtitleEditor', () => ({
  SubtitleEditor: () => <div data-testid="subtitle-editor" />,
}));

vi.mock('../../components/UserSettings/UserSettingsPanel', () => ({
  UserSettingsPanel: () => <div data-testid="user-settings" />,
}));

vi.mock('../../components/AlphaImportDialog/AlphaImportDialog', () => ({
  AlphaImportDialog: () => <div data-testid="alpha-import-dialog" />,
}));

vi.mock('../../components/TrackerPanel/TrackerPanel', () => ({
  TrackerPanel: () => <div data-testid="tracker-panel" />,
}));

vi.mock('../../components/TrackerPanel/TrackingOverlay', () => ({
  TrackingOverlay: () => <div data-testid="tracking-overlay" />,
}));

vi.mock('../../components/PageNavigation/PageNavigation', () => ({
  PageNavigation: () => <div data-testid="page-navigation" />,
}));

vi.mock('../../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PanelErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../hooks/useGlobalKeyboard', () => ({
  useGlobalKeyboard: vi.fn(),
}));

vi.mock('../../hooks/useKeyboardAction', () => ({
  useKeyboardAction: vi.fn(),
}));

vi.mock('../../engine/EditEngine', () => ({
  editEngine: { undo: vi.fn(), redo: vi.fn() },
}));

// Lazy-loaded pages/components that EditorPage imports
vi.mock('../../pages/MediaPage', () => ({
  MediaPage: () => <div data-testid="media-page" />,
}));

vi.mock('../../pages/CutPage', () => ({
  CutPage: () => <div data-testid="cut-page" />,
}));

vi.mock('../../components/LoadingSpinner', () => ({
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
}));

import { EditorPage } from '../../pages/EditorPage';
import { ComposerPanel } from '../../components/ComposerPanel/ComposerPanel';

const initialState = useEditorStore.getState();

describe('workspace layout and composer panel dual monitor', () => {
  beforeEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
  });

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
  });

  // ── EditorPage layout tests ────────────────────────────────────────────

  it('EditorPage renders workspace with correct grid layout classes', () => {
    useEditorStore.setState({ showInspector: true });

    const { container } = render(
      <MemoryRouter initialEntries={['/editor/test-project']}>
        <EditorPage />
      </MemoryRouter>,
    );

    const workspace = container.querySelector('.workspace');
    expect(workspace).toBeInTheDocument();
    // When showInspector is true, the 'no-inspector' class must NOT be present
    expect(workspace).not.toHaveClass('no-inspector');
  });

  it('applies no-inspector class when showInspector is false', () => {
    useEditorStore.setState({ showInspector: false });

    const { container } = render(
      <MemoryRouter initialEntries={['/editor/test-project']}>
        <EditorPage />
      </MemoryRouter>,
    );

    const workspace = container.querySelector('.workspace');
    expect(workspace).toBeInTheDocument();
    expect(workspace).toHaveClass('no-inspector');
  });

  // ── ComposerPanel layout tests ────────────────────────────────────────

  it('ComposerPanel applies composer-panel-dual class when in source-record mode', () => {
    useEditorStore.setState({ composerLayout: 'source-record' });

    const { container } = render(<ComposerPanel />);

    const monitors = container.querySelector('.composer-panel-monitors');
    expect(monitors).toBeInTheDocument();
    expect(monitors).toHaveClass('composer-panel-dual');
    expect(monitors).not.toHaveClass('composer-panel-single');
  });

  it('ComposerPanel renders both SourceMonitor and RecordMonitor slots in dual mode', () => {
    useEditorStore.setState({ composerLayout: 'source-record', poppedOutMonitor: null });

    render(<ComposerPanel />);

    expect(screen.getByTestId('source-monitor')).toBeInTheDocument();
    expect(screen.getByTestId('record-monitor')).toBeInTheDocument();
  });

  it('ComposerPanel renders single monitor in full-record mode', () => {
    useEditorStore.setState({ composerLayout: 'full-frame' });

    const { container } = render(<ComposerPanel />);

    const monitors = container.querySelector('.composer-panel-monitors');
    expect(monitors).toHaveClass('composer-panel-single');
    expect(monitors).not.toHaveClass('composer-panel-dual');

    // In full-record mode the MonitorArea is rendered instead of separate source/record
    expect(screen.getByTestId('monitor-area')).toBeInTheDocument();
    expect(screen.queryByTestId('source-monitor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-monitor')).not.toBeInTheDocument();
  });
});
