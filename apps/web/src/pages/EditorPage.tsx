import React, { useEffect, useState, Suspense, lazy } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { useParams, useSearchParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { MonitorArea } from '../components/Monitor/MonitorArea';
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
import { type WorkspacePreset, workspacePresets } from '../App';
import { PageNavigation, type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import { MediaPage } from './MediaPage';
import { CutPage } from './CutPage';
import { ColorPage } from './ColorPage';
import { DeliverPage } from './DeliverPage';

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
        <Suspense fallback={<LoadingSpinner />}>
          <RundownPanel />
          <StoryScriptPanel />
        </Suspense>
      );
    case 'sports':
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <SportsPanel />
        </Suspense>
      );
    case 'creator':
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <CreatorPanel />
          <AccessibilityPanel />
        </Suspense>
      );
    case 'marketing':
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <BrandPanel />
        </Suspense>
      );
    default:
      return null;
  }
}

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const { showAIPanel, showExportPanel, showTranscriptPanel, toggleExportPanel, loadProject, showInspector, showNewProjectDialog, showSequenceDialog, showTitleTool, showSubtitleEditor } = useEditorStore();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspacePreset>(
    (searchParams.get('workspace') as WorkspacePreset) || 'filmtv'
  );
  const [showMultiCam, setShowMultiCam] = useState(false);
  const [activePage, setActivePage] = useState<PageId>('edit');
  // Centralized keyboard dispatch — routes keys based on active monitor
  useGlobalKeyboard();

  useEffect(() => {
    if (projectId && projectId !== 'new') loadProject(projectId);
  }, [projectId]);

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
      // Shift+1-5 to switch pages (Resolve-style)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const pageMap: Record<string, PageId> = { '!': 'media', '@': 'cut', '#': 'edit', '$': 'color', '%': 'deliver' };
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
      {activePage === 'media' && <MediaPage />}
      {activePage === 'cut' && <CutPage />}
      {activePage === 'color' && <ColorPage />}
      {activePage === 'deliver' && <DeliverPage />}

      {activePage === 'edit' && (
        isSportsWorkspace ? (
          <Suspense fallback={<LoadingSpinner />}>
            <SportsWorkspace />
          </Suspense>
        ) : (
          <>
            <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
              <div className="left-panels">
                <BinPanel />
                {showTranscriptPanel && <TranscriptPanel />}
              </div>
              <div className="canvas-area" style={{ position: 'relative' }}>
                {showMultiCam ? (
                  <Suspense fallback={<LoadingSpinner />}>
                    <MultiCamPanel />
                  </Suspense>
                ) : (
                  <ComposerPanel />
                )}
                {showAIPanel && <AIPanel />}
              </div>
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
              {showInspector && <InspectorPanel />}
            </div>
            <TimelinePanel />
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
              style={{
                position: 'absolute', top: 10, right: 12, zIndex: 10,
                background: 'transparent', border: 'none',
                color: 'var(--text-tertiary)', fontSize: 18,
                cursor: 'pointer', lineHeight: 1,
              }}
              title="Close (Esc)"
            >✕</button>
            <ExportPanel />
          </div>
        </div>
      )}

      {/* New dialogs & panels */}
      {showNewProjectDialog && <NewProjectDialog />}
      {showSequenceDialog && <SequenceDialog />}
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
