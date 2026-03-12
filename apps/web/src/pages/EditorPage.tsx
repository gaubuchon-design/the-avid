import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorBoundary, PanelErrorBoundary } from '../components/ErrorBoundary';
import { useParams, useSearchParams } from 'react-router-dom';
import { TrimSide, trimEngine } from '../engine/TrimEngine';
import { trackPatchingEngine } from '../engine/TrackPatchingEngine';
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
import { EditorWorkbenchBar } from '../components/Editor/EditorWorkbenchBar';
import { NewProjectDialog } from '../components/NewProjectDialog/NewProjectDialog';
import { SequenceDialog } from '../components/SequenceDialog/SequenceDialog';
import { TitleTool } from '../components/TitleTool/TitleTool';
import { SubtitleEditor } from '../components/SubtitleEditor/SubtitleEditor';
import { useEditorStore } from '../store/editor.store';
import { useGlobalKeyboard } from '../hooks/useGlobalKeyboard';
import { useEditorCollabLifecycle } from '../hooks/useEditorCollabLifecycle';
import { useEditorCollabPresenceSync } from '../hooks/useEditorCollabPresenceSync';
import { UserSettingsPanel } from '../components/UserSettings/UserSettingsPanel';
import { useKeyboardAction } from '../hooks/useKeyboardAction';
import { editEngine } from '../engine/EditEngine';
import { AlphaImportDialog } from '../components/AlphaImportDialog/AlphaImportDialog';
import { TrackerPanel } from '../components/TrackerPanel/TrackerPanel';
import { TrackingOverlay } from '../components/TrackerPanel/TrackingOverlay';
import { type WorkspacePreset, workspacePresets } from '../App';
import { type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import {
  markInForActiveMonitor,
  markOutForActiveMonitor,
  playForwardForActiveMonitor,
  playReverseForActiveMonitor,
  stopActiveMonitorPlayback,
  togglePlayForActiveMonitor,
} from '../lib/editorMonitorActions';
import { buildProjectPersistenceSnapshot, getProjectPersistenceHash } from '../lib/editorProjectState';
import { isLegacyExportPageParam, resolveEditorPageParam, resolveWorkspaceParam } from '../lib/editorUrlState';
import { subscribeSmartToolStateToStore } from '../lib/smartToolStateBridge';
import { subscribeTrimHistoryToEditEngine } from '../lib/trimHistoryBridge';
import { subscribeTrimStateToStore } from '../lib/trimStateBridge';
import { subscribeTrackPatchingStateToStore } from '../lib/trackPatchingStateBridge';
import { MediaPage } from './MediaPage';

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
  useEditorCollabLifecycle(projectId);
  useEditorCollabPresenceSync(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
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
  const toggleExportPanel = useEditorStore((s) => s.toggleExportPanel);
  const toggleSettingsPanel = useEditorStore((s) => s.toggleSettingsPanel);
  const loadProject = useEditorStore((s) => s.loadProject);
  const saveProject = useEditorStore((s) => s.saveProject);
  const tracks = useEditorStore((s) => s.tracks);

  const [showTracker, setShowTracker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspacePreset>(() => resolveWorkspaceParam(searchParams.get('workspace')));
  const [showMultiCam, setShowMultiCam] = useState(false);
  const [activePage, setActivePage] = useState<PageId>(() => resolveEditorPageParam(searchParams.get('page')));
  // Centralized keyboard dispatch — routes keys based on active monitor
  useGlobalKeyboard();

  // ─── Register core keyboard actions with the KeyboardEngine ──────────
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);
  const setInPoint = useEditorStore((s) => s.setInPoint);
  const setOutPoint = useEditorStore((s) => s.setOutPoint);
  const clearInOut = useEditorStore((s) => s.clearInOut);
  const goToStart = useEditorStore((s) => s.goToStart);
  const goToEnd = useEditorStore((s) => s.goToEnd);
  const goToNextEditPoint = useEditorStore((s) => s.goToNextEditPoint);
  const goToPrevEditPoint = useEditorStore((s) => s.goToPrevEditPoint);
  const deleteSelectedClips = useEditorStore((s) => s.deleteSelectedClips);
  const liftSelection = useEditorStore((s) => s.liftSelection);
  const extractSelection = useEditorStore((s) => s.extractSelection);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const toggleSmartToolLiftOverwrite = useEditorStore((s) => s.toggleSmartToolLiftOverwrite);
  const toggleSmartToolExtractSplice = useEditorStore((s) => s.toggleSmartToolExtractSplice);
  const toggleSmartToolOverwriteTrim = useEditorStore((s) => s.toggleSmartToolOverwriteTrim);
  const toggleSmartToolRippleTrim = useEditorStore((s) => s.toggleSmartToolRippleTrim);

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
  const markClipAtPlayhead = useCallback(() => {
    const state = useEditorStore.getState();
    const targetedTracks = state.tracks.filter((track) => state.enabledTrackIds.includes(track.id));
    const candidateTracks = state.selectedTrackId
      ? [state.tracks.find((track) => track.id === state.selectedTrackId)].filter(Boolean)
      : (targetedTracks.length > 0 ? targetedTracks : state.tracks);

    for (const track of candidateTracks) {
      const clip = track?.clips.find((item) => item.startTime <= state.playheadTime && item.endTime >= state.playheadTime);
      if (!clip) {
        continue;
      }
      state.setInPoint(clip.startTime);
      state.setOutPoint(clip.endTime);
      return;
    }
  }, []);
  const clearIn = useCallback(() => setInPoint(null), [setInPoint]);
  const clearOut = useCallback(() => setOutPoint(null), [setOutPoint]);
  const goToIn = useCallback(() => {
    const { inPoint, setPlayhead } = useEditorStore.getState();
    if (inPoint !== null) {
      setPlayhead(inPoint);
    }
  }, []);
  const goToOut = useCallback(() => {
    const { outPoint, setPlayhead } = useEditorStore.getState();
    if (outPoint !== null) {
      setPlayhead(outPoint);
    }
  }, []);
  const enterTrimMode = useCallback(() => {
    const state = useEditorStore.getState();
    const targetedTrackIds = state.enabledTrackIds.length > 0
      ? state.enabledTrackIds
      : state.tracks.filter((track) => !track.locked).map((track) => track.id);
    const activeTrackIds = state.selectedTrackId ? [state.selectedTrackId] : targetedTrackIds;

    setActiveTool('trim');
    trimEngine.enterTrimMode(activeTrackIds, state.playheadTime, TrimSide.BOTH);
  }, [setActiveTool]);
  const selectTrimASide = useCallback(() => {
    trimEngine.selectASide();
  }, []);
  const selectTrimBSide = useCallback(() => {
    trimEngine.selectBSide();
  }, []);
  const selectTrimBothSides = useCallback(() => {
    trimEngine.selectBothSides();
  }, []);
  const trimByFrames = useCallback((frames: number) => {
    const state = useEditorStore.getState();
    const frameRate = state.sequenceSettings?.fps || state.projectSettings.frameRate || 24;
    trimEngine.trimByFrames(frames, frameRate);
  }, []);
  const trimLeftOneFrame = useCallback(() => trimByFrames(-1), [trimByFrames]);
  const trimRightOneFrame = useCallback(() => trimByFrames(1), [trimByFrames]);
  const trimLeftTenFrames = useCallback(() => trimByFrames(-10), [trimByFrames]);
  const trimRightTenFrames = useCallback(() => trimByFrames(10), [trimByFrames]);

  useKeyboardAction('transport.playForward', playForwardForActiveMonitor, []);
  useKeyboardAction('transport.playReverse', playReverseForActiveMonitor, []);
  useKeyboardAction('transport.stop', stopActiveMonitorPlayback, []);
  useKeyboardAction('transport.playStop', togglePlayForActiveMonitor, []);
  useKeyboardAction('transport.playToggle', togglePlayForActiveMonitor, []);
  useKeyboardAction('transport.stepForward', stepForward, [stepForward]);
  useKeyboardAction('transport.stepBack', stepBackward, [stepBackward]);
  useKeyboardAction('transport.stepBackward', stepBackward, [stepBackward]);
  useKeyboardAction('transport.goToStart', goToStart, [goToStart]);
  useKeyboardAction('transport.goToEnd', goToEnd, [goToEnd]);
  useKeyboardAction('mark.in', markInForActiveMonitor, []);
  useKeyboardAction('mark.out', markOutForActiveMonitor, []);
  useKeyboardAction('mark.clip', markClipAtPlayhead, [markClipAtPlayhead]);
  useKeyboardAction('mark.clipAlt', markClipAtPlayhead, [markClipAtPlayhead]);
  useKeyboardAction('mark.clearBoth', clearInOut, [clearInOut]);
  useKeyboardAction('mark.clearIn', clearIn, [clearIn]);
  useKeyboardAction('mark.clearOut', clearOut, [clearOut]);
  useKeyboardAction('mark.goToIn', goToIn, [goToIn]);
  useKeyboardAction('mark.goToOut', goToOut, [goToOut]);
  useKeyboardAction('edit.spliceIn', insertEdit, [insertEdit]);
  useKeyboardAction('edit.overwrite', overwriteEdit, [overwriteEdit]);
  useKeyboardAction('edit.lift', liftSelection, [liftSelection]);
  useKeyboardAction('edit.extract', extractSelection, [extractSelection]);
  useKeyboardAction('edit.undo', () => editEngine.undo(), []);
  useKeyboardAction('edit.redo', () => editEngine.redo(), []);
  useKeyboardAction('edit.delete', deleteSelectedClips, [deleteSelectedClips]);
  useKeyboardAction('file.save', () => {
    void saveProject();
  }, [saveProject]);
  useKeyboardAction('trim.enterMode', enterTrimMode, [enterTrimMode]);
  useKeyboardAction('trim.selectASide', selectTrimASide, [selectTrimASide]);
  useKeyboardAction('trim.selectBSide', selectTrimBSide, [selectTrimBSide]);
  useKeyboardAction('trim.selectBoth', selectTrimBothSides, [selectTrimBothSides]);
  useKeyboardAction('trim.left1', trimLeftOneFrame, [trimLeftOneFrame]);
  useKeyboardAction('trim.right1', trimRightOneFrame, [trimRightOneFrame]);
  useKeyboardAction('trim.left10', trimLeftTenFrames, [trimLeftTenFrames]);
  useKeyboardAction('trim.right10', trimRightTenFrames, [trimRightTenFrames]);
  useKeyboardAction('nav.prevEdit', goToPrevEditPoint, [goToPrevEditPoint]);
  useKeyboardAction('nav.nextEdit', goToNextEditPoint, [goToNextEditPoint]);
  useKeyboardAction('smartTool.toggleLiftOverwrite', toggleSmartToolLiftOverwrite, [toggleSmartToolLiftOverwrite]);
  useKeyboardAction('smartTool.toggleExtractSplice', toggleSmartToolExtractSplice, [toggleSmartToolExtractSplice]);
  useKeyboardAction('smartTool.toggleOverwriteTrim', toggleSmartToolOverwriteTrim, [toggleSmartToolOverwriteTrim]);
  useKeyboardAction('smartTool.toggleRippleTrim', toggleSmartToolRippleTrim, [toggleSmartToolRippleTrim]);
  useKeyboardAction('view.fullScreen', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    if (projectId && projectId !== 'new') {
      void loadProject(projectId);
    }
  }, [projectId, loadProject]);

  useEffect(() => {
    let autosaveTimeout: number | null = null;

    const scheduleAutosave = (state: ReturnType<typeof useEditorStore.getState>) => {
      const snapshot = buildProjectPersistenceSnapshot(state);
      if (!snapshot || state.saveStatus === 'saving') {
        return;
      }

      const nextHash = getProjectPersistenceHash(snapshot);
      const isDirty = nextHash !== state.persistedProjectHash;
      if (state.hasUnsavedChanges !== isDirty) {
        useEditorStore.setState({ hasUnsavedChanges: isDirty });
      }

      if (!isDirty) {
        return;
      }

      if (autosaveTimeout !== null) {
        window.clearTimeout(autosaveTimeout);
      }

      autosaveTimeout = window.setTimeout(() => {
        void useEditorStore.getState().saveProject();
      }, 800);
    };

    const unsubscribe = useEditorStore.subscribe((state) => {
      scheduleAutosave(state);
    });

    return () => {
      unsubscribe();
      if (autosaveTimeout !== null) {
        window.clearTimeout(autosaveTimeout);
      }
    };
  }, []);

  useEffect(() => {
    if (tracks.length > 0 && trackPatchingEngine.getEnabledRecordTracks().length === 0) {
      for (const track of tracks) {
        if (!track.locked) {
          trackPatchingEngine.enableRecordTrack(track.id);
        }
      }
    }

    const monitoredTrackId = trackPatchingEngine.getVideoMonitorTrack();
    const visibleVideoTracks = tracks
      .filter((track) => (track.type === 'VIDEO' || track.type === 'GRAPHIC') && !track.muted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const fallbackVideoTrack = visibleVideoTracks[0]
      ?? tracks
        .filter((track) => track.type === 'VIDEO' || track.type === 'GRAPHIC')
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];

    const monitoredVideoTrack = tracks.find(
      (track) =>
        track.id === monitoredTrackId
        && (track.type === 'VIDEO' || track.type === 'GRAPHIC'),
    );

    if (fallbackVideoTrack && (!monitoredVideoTrack || monitoredVideoTrack.muted)) {
      trackPatchingEngine.setVideoMonitorTrack(fallbackVideoTrack.id);
    }

    return subscribeTrackPatchingStateToStore();
  }, [tracks]);

  useEffect(() => {
    return subscribeTrimStateToStore();
  }, []);

  useEffect(() => {
    return subscribeTrimHistoryToEditEngine();
  }, []);

  useEffect(() => {
    return subscribeSmartToolStateToStore();
  }, []);

  const updateSearchParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const handleWorkspaceChange = useCallback((nextWorkspace: WorkspacePreset) => {
    setWorkspace(nextWorkspace);
    updateSearchParam('workspace', nextWorkspace === 'filmtv' ? null : nextWorkspace);
  }, [updateSearchParam]);

  const handlePageChange = useCallback((nextPage: PageId) => {
    setActivePage(nextPage);
    updateSearchParam('page', nextPage === 'edit' ? null : nextPage);
  }, [updateSearchParam]);

  useEffect(() => {
    const rawPageParam = searchParams.get('page');
    const nextPage = resolveEditorPageParam(rawPageParam);
    if (nextPage !== activePage) {
      setActivePage(nextPage);
    }

    if (rawPageParam && rawPageParam !== nextPage) {
      updateSearchParam('page', nextPage === 'edit' ? null : nextPage);
    }

    if (isLegacyExportPageParam(rawPageParam) && !useEditorStore.getState().showExportPanel) {
      useEditorStore.setState({ showExportPanel: true });
    }

    const nextWorkspace = resolveWorkspaceParam(searchParams.get('workspace'));
    if (nextWorkspace !== workspace) {
      setWorkspace(nextWorkspace);
    }
  }, [activePage, searchParams, updateSearchParam, workspace]);

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
      // Shift+1-2 to switch between media and edit
      if (e.shiftKey && !e.metaKey && !e.ctrlKey) {
        const pageMap: Record<string, PageId> = { '!': 'media', '@': 'edit' };
        const page = pageMap[e.key];
        if (page) { e.preventDefault(); handlePageChange(page); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handlePageChange]);

  const hasVerticalPanel = workspace !== 'filmtv' && workspace !== 'sports';
  const isSportsWorkspace = workspace === 'sports';

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      <EditorWorkbenchBar
        activePage={activePage}
        onPageChange={handlePageChange}
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        presets={workspacePresets}
      />

      {/* Page-specific content */}
      {activePage === 'media' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <MediaPage />
        </ErrorBoundary>
      )}
      {activePage === 'edit' && (
        isSportsWorkspace ? (
          <Suspense fallback={<LoadingSpinner />}>
            <SportsWorkspace />
          </Suspense>
        ) : (
          <>
            <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
              <div className="left-panels">
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
          </>
        )
      )}

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
