import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorBoundary, PanelErrorBoundary } from '../components/ErrorBoundary';
import { useParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { ComposerPanel } from '../components/ComposerPanel/ComposerPanel';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
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
import { PageNavigation, type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import { MediaPage } from './MediaPage';
import { CutPage } from './CutPage';

// Lazy-load new pages and deliver components for share panel
const VFXPage = lazy(() => import('./VFXPage').then(m => ({ default: m.VFXPage })));
const ProToolsPage = lazy(() => import('./ProToolsPage').then(m => ({ default: m.ProToolsPage })));
const RenderPanel = lazy(() => import('../components/RenderPanel/RenderPanel').then(m => ({ default: m.RenderPanel })));

// Deliver components for Share panel
const TemplatePanel = lazy(() => import('../components/Deliver/TemplatePanel').then(m => ({ default: m.TemplatePanel })));
const FormatSettingsPanel = lazy(() => import('../components/Deliver/FormatSettingsPanel').then(m => ({ default: m.FormatSettingsPanel })));
const RenderQueuePanel = lazy(() => import('../components/Deliver/RenderQueuePanel').then(m => ({ default: m.RenderQueuePanel })));

// Lazy-loaded utility panels
const MultiCamPanel = lazy(() => import('../components/MultiCamPanel/MultiCamPanel').then(m => ({ default: m.MultiCamPanel })));

// Playback is driven by PlaybackEngine (RAF-based) via editor.store.ts togglePlay().
// Keyboard dispatch is centralized in useGlobalKeyboard() — called once from EditorPage.

// ─── Share / Deliver Panel ──────────────────────────────────────────────────

function SharePanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'quick' | 'deliver' | 'publish'>('quick');

  return (
    <div
      className="share-overlay"
      role="dialog"
      aria-label="Share and Deliver"
      tabIndex={0}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
      }}
    >
      <div
        style={{
          width: '85%', maxWidth: 1100,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          animation: 'slideInRight 200ms ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-default)',
          background: 'var(--bg-raised)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span style={{
              fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
              textTransform: 'uppercase', color: 'var(--text-primary)',
            }}>
              Share & Deliver
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close share panel"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', lineHeight: 1, padding: '4px 8px',
            }}
            title="Close (Esc)"
          >&#x2715;</button>
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border-default)',
          flexShrink: 0,
        }} role="tablist" aria-label="Share panel tabs">
          {[
            { id: 'quick' as const, label: 'Quick Export' },
            { id: 'deliver' as const, label: 'Deliver' },
            { id: 'publish' as const, label: 'Publish' },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 0',
                fontSize: 11, fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase',
                border: 'none', cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--bg-hover)' : 'transparent',
                color: activeTab === tab.id ? 'var(--brand-bright)' : 'var(--text-muted)',
                borderBottom: activeTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent',
                transition: 'all 150ms',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {activeTab === 'quick' && <QuickExportTab />}
          {activeTab === 'deliver' && (
            <Suspense fallback={<LoadingSpinner />}>
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: '100%' }}>
                <TemplatePanel />
                <FormatSettingsPanel />
                <div style={{
                  width: 280, flexShrink: 0,
                  borderLeft: '1px solid var(--border-default)',
                  overflow: 'auto',
                }}>
                  <RenderQueuePanel />
                </div>
              </div>
            </Suspense>
          )}
          {activeTab === 'publish' && <PublishTab />}
        </div>
      </div>
    </div>
  );
}

function QuickExportTab() {
  const presets = [
    { id: 'h264-web', name: 'H.264 Web Optimized', desc: 'MP4 1080p, 8Mbps, AAC 256k', icon: 'WEB' },
    { id: 'h264-master', name: 'H.264 Master', desc: 'MP4 4K, 50Mbps, AAC 320k', icon: 'HD' },
    { id: 'prores-422', name: 'ProRes 422 HQ', desc: 'MOV, ProRes 422 HQ, PCM', icon: 'PRO' },
    { id: 'prores-4444', name: 'ProRes 4444', desc: 'MOV, ProRes 4444 + Alpha, PCM', icon: '4K' },
    { id: 'dnxhd-36', name: 'DNxHD 36', desc: 'MXF, DNxHD 36 Mbps', icon: 'DNX' },
    { id: 'youtube', name: 'YouTube Upload', desc: 'H.264, 1080p60, AAC 384k', icon: 'YT' },
    { id: 'instagram', name: 'Instagram Reels', desc: 'H.264, 1080x1920, 30fps', icon: 'IG' },
    { id: 'audio-only', name: 'Audio Mixdown', desc: 'WAV 48kHz/24-bit, Stereo', icon: 'WAV' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
      }}>
        Export Presets
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-default)',
              borderRadius: 6, cursor: 'pointer',
              transition: 'all 150ms', textAlign: 'left',
            }}
            onMouseOver={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--brand)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover)';
            }}
            onMouseOut={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-void)';
            }}
            aria-label={`Export as ${preset.name}`}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 6,
              background: 'var(--brand-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: 'var(--brand-bright)',
              letterSpacing: '0.05em', flexShrink: 0,
            }}>
              {preset.icon}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                {preset.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {preset.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PublishTab() {
  const destinations = [
    { id: 'youtube', name: 'YouTube', status: 'connected', icon: 'YT', color: '#ff0000' },
    { id: 'vimeo', name: 'Vimeo', status: 'connected', icon: 'VM', color: '#1ab7ea' },
    { id: 'frame', name: 'Frame.io', status: 'connected', icon: 'FR', color: '#7c5cfc' },
    { id: 'dropbox', name: 'Dropbox', status: 'disconnected', icon: 'DB', color: '#0061ff' },
    { id: 'gdrive', name: 'Google Drive', status: 'disconnected', icon: 'GD', color: '#34a853' },
    { id: 'nexis', name: 'Avid NEXIS', status: 'connected', icon: 'NX', color: '#5b6af5' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12,
      }}>
        Publish Destinations
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {destinations.map((dest) => (
          <div
            key={dest.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'var(--bg-void)',
              border: '1px solid var(--border-default)',
              borderRadius: 6,
            }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 6,
              background: `${dest.color}22`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: dest.color,
              flexShrink: 0,
            }}>
              {dest.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
                {dest.name}
              </div>
              <div style={{
                fontSize: 9, fontWeight: 600,
                color: dest.status === 'connected' ? 'var(--success)' : 'var(--text-muted)',
              }}>
                {dest.status === 'connected' ? 'Connected' : 'Not connected'}
              </div>
            </div>
            <button style={{
              padding: '4px 8px', fontSize: 9, fontWeight: 600,
              border: '1px solid var(--border-default)', borderRadius: 3,
              background: dest.status === 'connected' ? 'var(--brand)' : 'transparent',
              color: dest.status === 'connected' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}>
              {dest.status === 'connected' ? 'Publish' : 'Connect'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main EditorPage ────────────────────────────────────────────────────────

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const showExportPanel = useEditorStore((s) => s.showExportPanel);
  const showSharePanel = useEditorStore((s) => s.showSharePanel);
  const showSettingsPanel = useEditorStore((s) => s.showSettingsPanel);
  const showInspector = useEditorStore((s) => s.showInspector);
  const showNewProjectDialog = useEditorStore((s) => s.showNewProjectDialog);
  const showSequenceDialog = useEditorStore((s) => s.showSequenceDialog);
  const showTitleTool = useEditorStore((s) => s.showTitleTool);
  const showSubtitleEditor = useEditorStore((s) => s.showSubtitleEditor);
  const showAlphaImportDialog = useEditorStore((s) => s.showAlphaImportDialog);
  const toggleExportPanel = useEditorStore((s) => s.toggleExportPanel);
  const toggleSharePanel = useEditorStore((s) => s.toggleSharePanel);
  const toggleSettingsPanel = useEditorStore((s) => s.toggleSettingsPanel);
  const loadProject = useEditorStore((s) => s.loadProject);

  const [showTracker, setShowTracker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showMultiCam, setShowMultiCam] = useState(false);
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

  // Command palette, multicam, tracker, and page switching shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      // Multicam toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        setShowMultiCam(prev => !prev);
      }
      // Title Tool toggle (Ctrl/Cmd+T)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        useEditorStore.getState().toggleTitleTool();
      }
      // Tracker toggle (Ctrl/Cmd+Shift+T)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        setShowTracker(prev => !prev);
      }
      // Shift+1-6 to switch pages (Resolve-style)
      if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const pageMap: Record<string, PageId> = {
          '!': 'media',
          '@': 'cut',
          '#': 'edit',
          '$': 'vfx',
          '%': 'protools',
          '^': 'color',
        };
        const page = pageMap[e.key];
        if (page) { e.preventDefault(); setActivePage(page); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Whether we are on the edit page (needs workspace + timeline rows)
  const isEditPage = activePage === 'edit';

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />

      {/* Non-edit pages: wrapped in page-content-area to span grid rows 3-4 */}
      {activePage === 'media' && (
        <div className="page-content-area">
          <ErrorBoundary resetKeys={[activePage]}>
            <MediaPage />
          </ErrorBoundary>
        </div>
      )}
      {activePage === 'cut' && (
        <div className="page-content-area">
          <ErrorBoundary resetKeys={[activePage]}>
            <CutPage />
          </ErrorBoundary>
        </div>
      )}
      {activePage === 'color' && (
        <div className="page-content-area">
          <ErrorBoundary resetKeys={[activePage]}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Color Page</div>
          </ErrorBoundary>
        </div>
      )}
      {activePage === 'vfx' && (
        <div className="page-content-area">
          <ErrorBoundary resetKeys={[activePage]}>
            <Suspense fallback={<LoadingSpinner />}>
              <VFXPage />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}
      {activePage === 'protools' && (
        <div className="page-content-area">
          <ErrorBoundary resetKeys={[activePage]}>
            <Suspense fallback={<LoadingSpinner />}>
              <ProToolsPage />
            </Suspense>
          </ErrorBoundary>
        </div>
      )}

      {/* Edit page: workspace (row 3) + timeline (row 4) */}
      {isEditPage && (
        <>
          <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
            <div className="left-panels">
              <PanelErrorBoundary panelName="BinPanel">
                <BinPanel />
              </PanelErrorBoundary>
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
            </div>
            {/* Planar tracker side panel */}
            {showTracker && (
              <PanelErrorBoundary panelName="TrackerPanel">
                <TrackerPanel />
              </PanelErrorBoundary>
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
        </>
      )}

      <PageNavigation activePage={activePage} onPageChange={setActivePage} />
      <StatusBar />

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

      {/* Share / Deliver slide-out panel */}
      {showSharePanel && (
        <SharePanel onClose={toggleSharePanel} />
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
          position: 'fixed', top: 'var(--toolbar-h)', right: showInspector ? 'calc(var(--inspector-w) + 60px)' : 0,
          bottom: 'calc(var(--statusbar-h) + 28px)',
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
          position: 'fixed', top: 'var(--toolbar-h)', right: showInspector ? 'calc(var(--inspector-w) + 60px)' : 0,
          bottom: 'calc(var(--statusbar-h) + 28px)',
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
