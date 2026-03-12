import React, { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary, PanelErrorBoundary } from '../components/ErrorBoundary';
import { useParams, useSearchParams } from 'react-router-dom';
import { TrimSide, trimEngine } from '../engine/TrimEngine';
import { trackPatchingEngine } from '../engine/TrackPatchingEngine';
import { Toolbar } from '../components/Toolbar/Toolbar';
import { BinPanel } from '../components/Bins/BinPanel';
import { ComposerPanel } from '../components/ComposerPanel/ComposerPanel';
import { TimelinePanel } from '../components/TimelinePanel/TimelinePanel';
import { InspectorPanel } from '../components/Editor/InspectorPanel';
import { ExportPanel } from '../components/ExportPanel/ExportPanel';
import { StatusBar } from '../components/Editor/StatusBar';
import { EditorWorkbenchBar } from '../components/Editor/EditorWorkbenchBar';
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
import { type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import {
  clearInForActiveMonitor,
  clearMarksForActiveMonitor,
  clearOutForActiveMonitor,
  goToInForActiveMonitor,
  goToOutForActiveMonitor,
  markClipForActiveMonitor,
  markInForActiveMonitor,
  markOutForActiveMonitor,
  playForwardForActiveMonitor,
  playReverseForActiveMonitor,
  stopActiveMonitorPlayback,
  togglePlayForActiveMonitor,
} from '../lib/editorMonitorActions';
import { buildProjectPersistenceSnapshot, getProjectPersistenceHash } from '../lib/editorProjectState';
import { isLegacyExportPageParam, resolveEditorPageParam } from '../lib/editorUrlState';
import { subscribeSmartToolStateToStore } from '../lib/smartToolStateBridge';
import { enterTrimModeFromContext } from '../lib/trimEntry';
import { subscribeTrimHistoryToEditEngine } from '../lib/trimHistoryBridge';
import { subscribeTrimStateToStore } from '../lib/trimStateBridge';
import { subscribeTrackPatchingStateToStore } from '../lib/trackPatchingStateBridge';
import { MediaPage } from './MediaPage';

// Playback is driven by PlaybackEngine (RAF-based) via editor.store.ts togglePlay().
// Keyboard dispatch is centralized in useGlobalKeyboard() — called once from EditorPage.

export function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const showExportPanel = useEditorStore((s) => s.showExportPanel);
  const showSettingsPanel = useEditorStore((s) => s.showSettingsPanel);
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
  const [activePage, setActivePage] = useState<PageId>(() => resolveEditorPageParam(searchParams.get('page')));
  // Centralized keyboard dispatch — routes keys based on active monitor
  useGlobalKeyboard();

  // ─── Register core keyboard actions with the KeyboardEngine ──────────
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);
  const goToStart = useEditorStore((s) => s.goToStart);
  const goToEnd = useEditorStore((s) => s.goToEnd);
  const goToNextEditPoint = useEditorStore((s) => s.goToNextEditPoint);
  const goToPrevEditPoint = useEditorStore((s) => s.goToPrevEditPoint);
  const deleteSelectedClips = useEditorStore((s) => s.deleteSelectedClips);
  const liftEdit = useEditorStore((s) => s.liftEdit);
  const extractEdit = useEditorStore((s) => s.extractEdit);
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
  const enterTrimMode = useCallback(() => {
    const state = useEditorStore.getState();
    setActiveTool('trim');
    const target = enterTrimModeFromContext(state, { side: TrimSide.BOTH });
    if (target) {
      useEditorStore.getState().selectTrack(target.anchorTrackId);
      useEditorStore.getState().clearTrimEditPoints();
    }
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
  useKeyboardAction('mark.clip', markClipForActiveMonitor, []);
  useKeyboardAction('mark.clipAlt', markClipForActiveMonitor, []);
  useKeyboardAction('mark.clearBoth', clearMarksForActiveMonitor, []);
  useKeyboardAction('mark.clearIn', clearInForActiveMonitor, []);
  useKeyboardAction('mark.clearOut', clearOutForActiveMonitor, []);
  useKeyboardAction('mark.goToIn', goToInForActiveMonitor, []);
  useKeyboardAction('mark.goToOut', goToOutForActiveMonitor, []);
  useKeyboardAction('edit.spliceIn', insertEdit, [insertEdit]);
  useKeyboardAction('edit.overwrite', overwriteEdit, [overwriteEdit]);
  useKeyboardAction('edit.lift', liftEdit, [liftEdit]);
  useKeyboardAction('edit.extract', extractEdit, [extractEdit]);
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

    if (searchParams.has('workspace')) {
      updateSearchParam('workspace', null);
    }
  }, [activePage, searchParams, updateSearchParam]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

  return (
    <div className="editor-shell" onContextMenu={e => e.preventDefault()}>
      <Toolbar />
      <EditorWorkbenchBar
        activePage={activePage}
        onPageChange={handlePageChange}
      />

      {/* Page-specific content */}
      {activePage === 'media' && (
        <ErrorBoundary resetKeys={[activePage]}>
          <MediaPage />
        </ErrorBoundary>
      )}
      {activePage === 'edit' && (
        <>
          <div className={`workspace${showInspector ? '' : ' no-inspector'}`}>
            <div className="left-panels">
              <PanelErrorBoundary panelName="BinPanel">
                <BinPanel />
              </PanelErrorBoundary>
            </div>
            <div className="canvas-area" style={{ position: 'relative' }}>
              <PanelErrorBoundary panelName="ComposerPanel">
                <ComposerPanel />
              </PanelErrorBoundary>
              {showTracker && (
                <PanelErrorBoundary panelName="TrackingOverlay">
                  <TrackingOverlay width={1920} height={1080} />
                </PanelErrorBoundary>
              )}
            </div>
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
