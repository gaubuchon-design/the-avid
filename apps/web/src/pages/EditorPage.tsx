import React, { useEffect, useRef, useState, useCallback, Suspense, lazy } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorBoundary, PanelErrorBoundary } from '../components/ErrorBoundary';
import { useParams, useSearchParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { ComposerPanel } from '../components/ComposerPanel/ComposerPanel';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
import { AIPanel } from '../components/AIPanel/AIPanel';
import { TranscriptPanel } from '../components/TranscriptPanel/TranscriptPanel';
import { CommandPalette } from '../components/AIPanel/CommandPalette';
import { ExportPanel } from '../components/ExportPanel/ExportPanel';
import { StatusBar } from '../components/Editor/StatusBar';
import { NewProjectDialog } from '../components/NewProjectDialog/NewProjectDialog';
import { SequenceDialog } from '../components/SequenceDialog/SequenceDialog';
import { TitleTool } from '../components/TitleTool/TitleTool';
import { SubtitleEditor } from '../components/SubtitleEditor/SubtitleEditor';
import { useEditorStore } from '../store/editor.store';
import { useGlobalKeyboard } from '../hooks/useGlobalKeyboard';
import { UserSettingsPanel } from '../components/UserSettings/UserSettingsPanel';
import { useKeyboardAction } from '../hooks/useKeyboardAction';
import { editEngine } from '../engine/EditEngine';
import { AlphaImportDialog } from '../components/AlphaImportDialog/AlphaImportDialog';
import { TrackerPanel } from '../components/TrackerPanel/TrackerPanel';
import { TrackingOverlay } from '../components/TrackerPanel/TrackingOverlay';
import { type WorkspacePreset, workspacePresets } from '../App';
import { PageNavigation, type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import { MediaPage } from './MediaPage';
import { CutPage } from './CutPage';
import { ColorPage } from './ColorPage';
import { DeliverPage } from './DeliverPage';

// DaVinci Resolve parity pages (lazy-loaded)
const FusionPage = lazy(() => import('./FusionPage').then(m => ({ default: m.FusionPage })));
const FairlightPage = lazy(() => import('./FairlightPage').then(m => ({ default: m.FairlightPage })));

const VALID_WORKSPACES: ReadonlySet<string> = new Set<WorkspacePreset>(['filmtv', 'news', 'sports', 'creator', 'marketing']);

// Lazy-loaded vertical panels
// NOTE: These lazy imports are intentionally separate from the ones in App.tsx.
// App.tsx uses its lazy references for the route-level panel registry, while
// EditorPage uses its own so each code-split boundary resolves independently.
const RundownPanel = lazy(() => import('../components/RundownPanel/RundownPanel').then(m => ({ default: m.RundownPanel })));
const StoryScriptPanel = lazy(() => import('../components/StoryScriptPanel/StoryScriptPanel').then(m => ({ default: m.StoryScriptPanel })));
const SportsPanel = lazy(() => import('../components/SportsPanel/SportsPanel').then(m => ({ default: m.SportsPanel })));
const CreatorPanel = lazy(() => import('../components/CreatorPanel/CreatorPanel').then(m => ({ default: m.CreatorPanel })));
const BrandPanel = lazy(() => import('../components/BrandPanel/BrandPanel').then(m => ({ default: m.BrandPanel })));
const MultiCamPanel = lazy(() => import('../components/MultiCamPanel/MultiCamPanel').then(m => ({ default: m.MultiCamPanel })));
const AccessibilityPanel = lazy(() => import('../components/AccessibilityPanel/AccessibilityPanel').then(m => ({ default: m.AccessibilityPanel })));
const SportsWorkspace = lazy(() => import('../components/SportsWorkspace/SportsWorkspace').then(m => ({ default: m.SportsWorkspace })));
const MarkersPanel = lazy(() => import('../components/MarkersPanel/MarkersPanel').then(m => ({ default: m.MarkersPanel })));
const TransitionsPanel = lazy(() => import('../components/TransitionsPanel/TransitionsPanel').then(m => ({ default: m.TransitionsPanel })));
const KeyframeEditor = lazy(() => import('../components/KeyframeEditor/KeyframeEditor').then(m => ({ default: m.KeyframeEditor })));
const SequenceBin = lazy(() => import('../components/SequenceBin/SequenceBin').then(m => ({ default: m.SequenceBin })));
const TimelineSearch = lazy(() => import('../components/TimelineSearch/TimelineSearch').then(m => ({ default: m.TimelineSearch })));

// Playback is driven by PlaybackEngine (RAF-based) via editor.store.ts togglePlay().
// Keyboard dispatch is centralized in useGlobalKeyboard() — called once from EditorPage.

// ─── Workspace Preset Selector ──────────────────────────────────────────────

function WorkspaceSelector({
  workspace,
  switchWorkspace,
  presets,
}: {
  workspace: WorkspacePreset;
  switchWorkspace: (key: WorkspacePreset) => void;
  presets: Record<WorkspacePreset, { label: string; panels: string[] }>;
}) {
  if (!presets) return null;
  return (
    <div className="workspace-selector">
      {(Object.entries(presets) as [WorkspacePreset, { label: string; panels: string[] }][]).map(([key, preset]) => (
        <button
          key={key}
          className={`ws-tab ${workspace === key ? 'ws-tab-active' : ''}`}
          onClick={() => switchWorkspace(key)}
          title={preset.label}
          aria-pressed={workspace === key}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

// ─── Vertical Side Panel ────────────────────────────────────────────────────

function VerticalSidePanel({ workspace }: { workspace: WorkspacePreset }) {
  switch (workspace) {
    case 'news':
      return (
        <PanelErrorBoundary panelName="News Vertical Panel">
          <Suspense fallback={<LoadingSpinner />}>
            <PanelErrorBoundary panelName="RundownPanel">
              <RundownPanel />
            </PanelErrorBoundary>
            <PanelErrorBoundary panelName="StoryScriptPanel">
              <StoryScriptPanel />
            </PanelErrorBoundary>
          </Suspense>
        </PanelErrorBoundary>
      );
    case 'sports':
      return (
        <PanelErrorBoundary panelName="Sports Panel">
          <Suspense fallback={<LoadingSpinner />}>
            <SportsPanel />
          </Suspense>
        </PanelErrorBoundary>
      );
    case 'creator':
      return (
        <PanelErrorBoundary panelName="Creator Vertical Panel">
          <Suspense fallback={<LoadingSpinner />}>
            <PanelErrorBoundary panelName="CreatorPanel">
              <CreatorPanel />
            </PanelErrorBoundary>
            <PanelErrorBoundary panelName="AccessibilityPanel">
              <AccessibilityPanel />
            </PanelErrorBoundary>
          </Suspense>
        </PanelErrorBoundary>
      );
    case 'marketing':
      return (
        <PanelErrorBoundary panelName="Brand Panel">
          <Suspense fallback={<LoadingSpinner />}>
            <BrandPanel />
          </Suspense>
        </PanelErrorBoundary>
      );
    default:
      return null;
  }
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const showAIPanel = useEditorStore((s) => s.showAIPanel);
  const showExportPanel = useEditorStore((s) => s.showExportPanel);
  const showSettingsPanel = useEditorStore((s) => s.showSettingsPanel);
  const showTranscriptPanel = useEditorStore((s) => s.showTranscriptPanel);
  const showInspector = useEditorStore((s) => s.showInspector);
  const showNewProjectDialog = useEditorStore((s) => s.showNewProjectDialog);
  const showSequenceDialog = useEditorStore((s) => s.showSequenceDialog);
  const showTitleTool = useEditorStore((s) => s.showTitleTool);
  const showSubtitleEditor = useEditorStore((s) => s.showSubtitleEditor);
  const showAlphaImportDialog = useEditorStore((s) => s.showAlphaImportDialog);
  const showSequenceBin = useEditorStore((s) => s.showSequenceBin);
  const toggleExportPanel = useEditorStore((s) => s.toggleExportPanel);
  const toggleSettingsPanel = useEditorStore((s) => s.toggleSettingsPanel);
  const toggleSequenceBin = useEditorStore((s) => s.toggleSequenceBin);
  const loadProject = useEditorStore((s) => s.loadProject);

  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);

  const [showTracker, setShowTracker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspacePreset>(() => {
    const param = searchParams.get('workspace');
    return param && VALID_WORKSPACES.has(param) ? (param as WorkspacePreset) : 'filmtv';
  });
  const [showMultiCam, setShowMultiCam] = useState(false);
  const [showMarkersPanel, setShowMarkersPanel] = useState(false);
  const [showTransitionsPanel, setShowTransitionsPanel] = useState(false);
  const [showTimelineSearch, setShowTimelineSearch] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('edit');
  // Centralized keyboard dispatch — routes keys based on active monitor
  useGlobalKeyboard();

  // ─── Register core keyboard actions with the KeyboardEngine ──────────
  const togglePlay = useEditorStore((s) => s.togglePlay);
  const setInToPlayhead = useEditorStore((s) => s.setInToPlayhead);
  const setOutToPlayhead = useEditorStore((s) => s.setOutToPlayhead);
  const clearInOut = useEditorStore((s) => s.clearInOut);
  const goToStart = useEditorStore((s) => s.goToStart);
  const goToEnd = useEditorStore((s) => s.goToEnd);
  const deleteSelectedClips = useEditorStore((s) => s.deleteSelectedClips);

  // Read from store directly to avoid stale closures in frame-stepping callbacks
  const stepForward = useCallback(() => {
    const { playheadTime, duration, setPlayhead } = useEditorStore.getState();
    const safeDuration = Number.isFinite(duration) ? duration : 0;
    const safeTime = Number.isFinite(playheadTime) ? playheadTime : 0;
    setPlayhead(Math.min(safeTime + 1 / 24, safeDuration));
  }, []);
  const stepBackward = useCallback(() => {
    const { playheadTime, setPlayhead } = useEditorStore.getState();
    const safeTime = Number.isFinite(playheadTime) ? playheadTime : 0;
    setPlayhead(Math.max(safeTime - 1 / 24, 0));
  }, []);

  useKeyboardAction('transport.playForward', togglePlay, [togglePlay]);
  useKeyboardAction('transport.playReverse', togglePlay, [togglePlay]);
  useKeyboardAction('transport.stop', () => useEditorStore.getState().isPlaying && togglePlay(), [togglePlay]);
  useKeyboardAction('transport.playToggle', togglePlay, [togglePlay]);
  useKeyboardAction('transport.stepForward', stepForward, [stepForward]);
  useKeyboardAction('transport.stepBackward', stepBackward, [stepBackward]);
  useKeyboardAction('transport.goToStart', goToStart, [goToStart]);
  useKeyboardAction('transport.goToEnd', goToEnd, [goToEnd]);
  useKeyboardAction('mark.in', setInToPlayhead, [setInToPlayhead]);
  useKeyboardAction('mark.out', setOutToPlayhead, [setOutToPlayhead]);
  useKeyboardAction('mark.clearBoth', clearInOut, [clearInOut]);
  useKeyboardAction('edit.undo', () => editEngine.undo(), []);
  useKeyboardAction('edit.redo', () => editEngine.redo(), []);
  useKeyboardAction('edit.delete', deleteSelectedClips, [deleteSelectedClips]);
  useKeyboardAction('view.fullScreen', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    if (projectId && projectId !== 'new') loadProject(projectId);
  }, [projectId, loadProject]);

  // ⌘K / Ctrl+K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // ⌘M / Ctrl+M to toggle multicam
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        setShowMultiCam(prev => !prev);
      }
      // ⌘T / Ctrl+T to toggle planar tracker panel
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        setShowTracker(prev => !prev);
      }
      // ⌘Shift+B / Ctrl+Shift+B to toggle Sequence Bin
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleSequenceBin();
      }
      // ⌘F / Ctrl+F to toggle Find in Timeline
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'f') {
        e.preventDefault();
        setShowTimelineSearch(prev => !prev);
      }
      // Shift+1-7 to switch pages (Resolve-style)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const pageMap: Record<string, PageId> = { '!': 'media', '@': 'cut', '#': 'edit', '$': 'fusion', '%': 'color', '^': 'fairlight', '&': 'deliver' };
        const page = pageMap[e.key];
        if (page) { e.preventDefault(); setActivePage(page); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const hasVerticalPanel = workspace !== 'filmtv' && workspace !== 'sports';
  const isSportsWorkspace = workspace === 'sports';

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      {activePage === 'edit' && (
        <WorkspaceSelector workspace={workspace} switchWorkspace={setWorkspace} presets={workspacePresets} />
      )}

      {/* Page-specific content */}
      {activePage === 'media' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <MediaPage />
        </ErrorBoundary>
      )}
      {activePage === 'cut' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <CutPage />
        </ErrorBoundary>
      )}
      {activePage === 'fusion' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <Suspense fallback={<LoadingSpinner />}>
            <FusionPage />
          </Suspense>
        </ErrorBoundary>
      )}
      {activePage === 'color' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <div style={{ gridRow: '2 / 5', overflow: 'hidden' }}><ColorPage /></div>
        </ErrorBoundary>
      )}
      {activePage === 'fairlight' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <Suspense fallback={<LoadingSpinner />}>
            <FairlightPage />
          </Suspense>
        </ErrorBoundary>
      )}
      {activePage === 'deliver' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <DeliverPage />
        </ErrorBoundary>
      )}

      {activePage === 'edit' && (
        isSportsWorkspace ? (
          <Suspense fallback={<LoadingSpinner />}>
            <SportsWorkspace />
          </Suspense>
        ) : (
          <>
            {/* Panel toggle bar for Markers and Transitions */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 12px',
              backgroundColor: 'var(--bg-raised)',
              borderBottom: '1px solid var(--border-default)',
              fontSize: 11,
              flexShrink: 0,
            }}>
              <button
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: showMarkersPanel ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                  backgroundColor: showMarkersPanel ? 'var(--brand)' : 'var(--bg-raised)',
                  color: showMarkersPanel ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => setShowMarkersPanel(prev => !prev)}
                title={showMarkersPanel ? 'Hide Markers Panel' : 'Show Markers Panel'}
                aria-pressed={showMarkersPanel}
              >
                Markers
              </button>
              <button
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: showTransitionsPanel ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                  backgroundColor: showTransitionsPanel ? 'var(--brand)' : 'var(--bg-raised)',
                  color: showTransitionsPanel ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => setShowTransitionsPanel(prev => !prev)}
                title={showTransitionsPanel ? 'Hide Transitions Panel' : 'Show Transitions Panel'}
                aria-pressed={showTransitionsPanel}
              >
                Transitions
              </button>
              <button
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: showSequenceBin ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                  backgroundColor: showSequenceBin ? 'var(--brand)' : 'var(--bg-raised)',
                  color: showSequenceBin ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={toggleSequenceBin}
                title={showSequenceBin ? 'Hide Sequence Bin (Ctrl+Shift+B)' : 'Show Sequence Bin (Ctrl+Shift+B)'}
                aria-pressed={showSequenceBin}
              >
                Sequences
              </button>
              <button
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: showTimelineSearch ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                  backgroundColor: showTimelineSearch ? 'var(--brand)' : 'var(--bg-raised)',
                  color: showTimelineSearch ? '#fff' : 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
                onClick={() => setShowTimelineSearch(prev => !prev)}
                title={showTimelineSearch ? 'Hide Find (Ctrl+F)' : 'Find in Timeline (Ctrl+F)'}
                aria-pressed={showTimelineSearch}
              >
                Find
              </button>
            </div>
            <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
              <div className="left-panels">
                {showSequenceBin && (
                  <PanelErrorBoundary panelName="SequenceBin">
                    <Suspense fallback={<LoadingSpinner />}>
                      <SequenceBin />
                    </Suspense>
                  </PanelErrorBoundary>
                )}
                <PanelErrorBoundary panelName="BinPanel">
                  <BinPanel />
                </PanelErrorBoundary>
                {showTranscriptPanel && (
                  <PanelErrorBoundary panelName="TranscriptPanel">
                    <TranscriptPanel />
                  </PanelErrorBoundary>
                )}
              </div>
              <div className="canvas-area" style={{ position: 'relative' }}>
                <PanelErrorBoundary panelName="ComposerPanel">
                  {showMultiCam ? (
                    <Suspense fallback={<LoadingSpinner />}>
                      <MultiCamPanel />
                    </Suspense>
                  ) : (
                    <ComposerPanel />
                  )}
                </PanelErrorBoundary>
                {/* Tracking ROI overlay on top of monitor canvas */}
                {showTracker && (
                  <PanelErrorBoundary panelName="TrackingOverlay">
                    <TrackingOverlay width={1920} height={1080} />
                  </PanelErrorBoundary>
                )}
                {showAIPanel && (
                  <PanelErrorBoundary panelName="AIPanel">
                    <AIPanel />
                  </PanelErrorBoundary>
                )}
              </div>
              {/* Planar tracker side panel */}
              {showTracker && (
                <PanelErrorBoundary panelName="TrackerPanel">
                  <TrackerPanel />
                </PanelErrorBoundary>
              )}
              {/* Markers side panel */}
              {showMarkersPanel && (
                <PanelErrorBoundary panelName="MarkersPanel">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div style={{ width: 480, height: '100%', flexShrink: 0 }}>
                      <MarkersPanel />
                    </div>
                  </Suspense>
                </PanelErrorBoundary>
              )}
              {/* Transitions side panel */}
              {showTransitionsPanel && (
                <PanelErrorBoundary panelName="TransitionsPanel">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div style={{ width: 340, height: '100%', flexShrink: 0 }}>
                      <TransitionsPanel />
                    </div>
                  </Suspense>
                </PanelErrorBoundary>
              )}
              {showTimelineSearch && (
                <PanelErrorBoundary panelName="TimelineSearch">
                  <Suspense fallback={<LoadingSpinner />}>
                    <div style={{ width: 280, height: '100%', flexShrink: 0 }}>
                      <TimelineSearch />
                    </div>
                  </Suspense>
                </PanelErrorBoundary>
              )}
              {hasVerticalPanel && (
                <div className="vertical-panel" style={{
                  width: 340,
                  overflowY: 'auto',
                  borderLeft: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  <VerticalSidePanel workspace={workspace} />
                </div>
              )}
              {showInspector && (
                <PanelErrorBoundary panelName="InspectorPanel">
                  <InspectorPanel />
                </PanelErrorBoundary>
              )}
            </div>
            <PanelErrorBoundary panelName="TimelinePanel">
              <TimelinePanel />
            </PanelErrorBoundary>
            {selectedClipIds.length === 1 && (
              <PanelErrorBoundary panelName="KeyframeEditor">
                <Suspense fallback={<LoadingSpinner />}>
                  <KeyframeEditor />
                </Suspense>
              </PanelErrorBoundary>
            )}
          </>
        )
      )}

      <PageNavigation activePage={activePage} onPageChange={setActivePage} />
      <StatusBar />

      {/* Command Palette (⌘K) */}
      {showCommandPalette && (
        <CommandPalette onClose={() => setShowCommandPalette(false)} />
      )}

      {showExportPanel && (
        <div
          className="export-overlay"
          role="dialog"
          aria-label="Export Panel"
          tabIndex={0}
          onClick={(e) => { if (e.target === e.currentTarget) toggleExportPanel(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') toggleExportPanel(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '90%', maxWidth: 680, height: '85vh', maxHeight: 720,
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden', position: 'relative',
            boxShadow: 'var(--shadow-lg)',
          }}>
            <button
              onClick={toggleExportPanel}
              aria-label="Close export panel"
              style={{
                position: 'absolute', top: 10, right: 12, zIndex: 10,
                background: 'transparent', border: 'none',
                color: 'var(--text-tertiary)', fontSize: 18,
                cursor: 'pointer', lineHeight: 1,
              }}
              title="Close (Esc)"
            >&#x2715;</button>
            <ExportPanel />
          </div>
        </div>
      )}

      {/* User Settings modal */}
      {showSettingsPanel && (
        <UserSettingsPanel onClose={toggleSettingsPanel} />
      )}

      {/* New dialogs & panels */}
      {showNewProjectDialog && <NewProjectDialog />}
      {showSequenceDialog && <SequenceDialog />}

      {/* Alpha channel import dialog (shown when alpha detected on media ingest) */}
      {showAlphaImportDialog && <AlphaImportDialog />}
      {showTitleTool && (
        <div style={{
          position: 'fixed', top: 40, right: showInspector ? 340 : 0, bottom: 40,
          width: 360, zIndex: 900,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          overflow: 'auto',
        }}>
          <TitleTool />
        </div>
      )}
      {showSubtitleEditor && (
        <div style={{
          position: 'fixed', top: 40, right: showInspector ? 340 : 0, bottom: 40,
          width: 380, zIndex: 900,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          overflow: 'auto',
        }}>
          <SubtitleEditor />
        </div>
      )}
    </div>
  );
}
