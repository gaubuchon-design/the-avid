import React, { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary, PanelErrorBoundary } from '../components/ErrorBoundary';
import { useParams, useSearchParams } from 'react-router-dom';
import { trimEngine } from '../engine/TrimEngine';
import { keyboardEngine } from '../engine/KeyboardEngine';
import { multicamEngine } from '../engine/MulticamEngine';
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
import { usePlayerStore } from '../store/player.store';
import { useGlobalKeyboard } from '../hooks/useGlobalKeyboard';
import { useTrimLoopPlayback } from '../hooks/useTrimLoopPlayback';
import { UserSettingsPanel } from '../components/UserSettings/UserSettingsPanel';
import { useKeyboardAction } from '../hooks/useKeyboardAction';
import { editEngine } from '../engine/EditEngine';
import { AlphaImportDialog } from '../components/AlphaImportDialog/AlphaImportDialog';
import { TrackerPanel } from '../components/TrackerPanel/TrackerPanel';
import { TrackingOverlay } from '../components/TrackerPanel/TrackingOverlay';
import { type EditorPage as PageId } from '../components/PageNavigation/PageNavigation';
import {
  activateRecordMonitor,
  activateSourceMonitor,
  clearInForActiveMonitor,
  clearMarksForActiveMonitor,
  clearOutForActiveMonitor,
  goToEndForActiveMonitor,
  goToInForActiveMonitor,
  goToStartForActiveMonitor,
  goToOutForActiveMonitor,
  matchFrameAtPlayhead,
  markClipForActiveMonitor,
  markInForActiveMonitor,
  markOutForActiveMonitor,
  playForwardForActiveMonitor,
  playReverseForActiveMonitor,
  stepFramesForActiveMonitor,
  stopActiveMonitorPlayback,
  toggleMonitorFocus,
  togglePlayForActiveMonitor,
} from '../lib/editorMonitorActions';
import { buildProjectPersistenceSnapshot, getProjectPersistenceHash } from '../lib/editorProjectState';
import { isLegacyExportPageParam, resolveEditorPageParam } from '../lib/editorUrlState';
import { subscribeSmartToolStateToStore } from '../lib/smartToolStateBridge';
import { subscribeTrimHistoryToEditEngine } from '../lib/trimHistoryBridge';
import { subscribeTrimStateToStore } from '../lib/trimStateBridge';
import { subscribeTrackPatchingStateToStore } from '../lib/trackPatchingStateBridge';
import { requestTrimWorkspace } from '../lib/trimWorkspace';
import { MediaPage } from './MediaPage';
import { PanelResizeHandle } from '../components/Layout/PanelResizeHandle';
import {
  clampEditorLayoutForViewport,
  getEditorLayoutViewportBounds,
  readStoredEditorLayout,
  type EditorLayoutState,
} from '../lib/editorLayout';

function areViewportDimensionsEqual(
  left: { width: number; height: number },
  right: { width: number; height: number },
) {
  return left.width === right.width && left.height === right.height;
}

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
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));
  const [layout, setLayout] = useState<EditorLayoutState>(() => (
    readStoredEditorLayout(typeof window === 'undefined' ? null : window.localStorage)
  ));
  // Centralized keyboard dispatch — routes keys based on active monitor
  useGlobalKeyboard();
  useTrimLoopPlayback();

  // ─── Register core keyboard actions with the KeyboardEngine ──────────
  const insertEdit = useEditorStore((s) => s.insertEdit);
  const overwriteEdit = useEditorStore((s) => s.overwriteEdit);
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
  const toggleTrimViewMode = useEditorStore((s) => s.toggleTrimViewMode);

  // Read from store directly to avoid stale closures in frame-stepping callbacks
  const stepForward = useCallback(() => {
    if (trimEngine.getState().active || useEditorStore.getState().trimActive) {
      const state = useEditorStore.getState();
      const frameRate = state.sequenceSettings?.fps || state.projectSettings.frameRate || 24;
      trimEngine.trimByFrames(1, frameRate);
      return;
    }

    stepFramesForActiveMonitor(1);
  }, []);
  const stepBackward = useCallback(() => {
    if (trimEngine.getState().active || useEditorStore.getState().trimActive) {
      const state = useEditorStore.getState();
      const frameRate = state.sequenceSettings?.fps || state.projectSettings.frameRate || 24;
      trimEngine.trimByFrames(-1, frameRate);
      return;
    }

    stepFramesForActiveMonitor(-1);
  }, []);
  const enterTrimMode = useCallback(() => {
    requestTrimWorkspace();
  }, []);
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
  const startTrimTransport = useCallback((direction: -1 | 1, requestedSpeed?: number) => {
    const state = useEditorStore.getState();
    if (!state.trimActive) {
      const request = requestTrimWorkspace();
      if (request.outcome === 'noop') {
        return false;
      }
    }

    const speed = Math.max(
      0.25,
      Math.min(8, requestedSpeed ?? (Math.abs(keyboardEngine.getJKLSpeed()) || 1)),
    );
    useEditorStore.getState().setTrimLoopPlaybackDirection(direction);
    useEditorStore.getState().setTrimLoopPlaybackRate(speed);
    useEditorStore.getState().setTrimLoopPlaybackActive(true);
    return true;
  }, []);
  const stopTrimTransport = useCallback(() => {
    if (trimEngine.getState().active || useEditorStore.getState().trimActive) {
      useEditorStore.getState().setTrimLoopPlaybackActive(false);
      return;
    }

    stopActiveMonitorPlayback();
  }, []);
  const toggleTrimAwarePlayback = useCallback(() => {
    const state = useEditorStore.getState();
    if (trimEngine.getState().active || state.trimActive) {
      if (state.trimLoopPlaybackActive) {
        state.setTrimLoopPlaybackActive(false);
        return;
      }

      startTrimTransport(1, 1);
      return;
    }

    togglePlayForActiveMonitor();
  }, [startTrimTransport]);
  const playTrimForward = useCallback(() => {
    if (trimEngine.getState().active || useEditorStore.getState().trimActive) {
      void startTrimTransport(1);
      return;
    }

    playForwardForActiveMonitor();
  }, [startTrimTransport]);
  const playTrimReverse = useCallback(() => {
    if (trimEngine.getState().active || useEditorStore.getState().trimActive) {
      void startTrimTransport(-1);
      return;
    }

    playReverseForActiveMonitor();
  }, [startTrimTransport]);
  const playTrimLoop = useCallback(() => {
    const state = useEditorStore.getState();
    if (state.trimLoopPlaybackActive) {
      state.setTrimLoopPlaybackActive(false);
      return;
    }

    startTrimTransport(1, 1);
  }, [startTrimTransport]);
  const recallPreviousTrimConfiguration = useCallback(() => {
    const nextState = trimEngine.recallPreviousConfiguration();
    if (nextState.active && nextState.rollers.length > 0) {
      useEditorStore.getState().setActiveTool('trim');
      useEditorStore.getState().selectTrack(nextState.rollers[0]!.trackId);
    }
  }, []);
  const toggleMulticamMode = useCallback(() => {
    if (multicamEngine.isActive()) {
      multicamEngine.exitMulticamMode();
      return;
    }

    const state = useEditorStore.getState();
    const candidateAssets = state.activeBinAssets.filter((asset) => asset.type === 'VIDEO' || asset.type === 'AUDIO');
    if (candidateAssets.length < 2) {
      return;
    }

    const group = multicamEngine.createGroup(
      `${state.projectName || 'Current Bin'} MultiCam`,
      candidateAssets.map((asset) => asset.id),
      'timecode',
    );
    multicamEngine.enterMulticamMode(group.id);
    activateSourceMonitor();
  }, []);
  const cutToMulticamAngle = useCallback((angleIndex: number) => {
    if (!multicamEngine.isActive()) {
      return;
    }

    const isLiveSwitching = useEditorStore.getState().isPlaying || multicamEngine.getState().isRecording;
    if (isLiveSwitching) {
      multicamEngine.cutToAngle(angleIndex);
    } else {
      multicamEngine.setActiveAngle(angleIndex);
    }

    activateSourceMonitor();
  }, []);

  useKeyboardAction('transport.playForward', playTrimForward, [playTrimForward]);
  useKeyboardAction('transport.playReverse', playTrimReverse, [playTrimReverse]);
  useKeyboardAction('transport.stop', stopTrimTransport, [stopTrimTransport]);
  useKeyboardAction('transport.playStop', toggleTrimAwarePlayback, [toggleTrimAwarePlayback]);
  useKeyboardAction('transport.playToggle', toggleTrimAwarePlayback, [toggleTrimAwarePlayback]);
  useKeyboardAction('transport.stepForward', stepForward, [stepForward]);
  useKeyboardAction('transport.stepBack', stepBackward, [stepBackward]);
  useKeyboardAction('transport.stepBackward', stepBackward, [stepBackward]);
  useKeyboardAction('transport.goToStart', goToStartForActiveMonitor, []);
  useKeyboardAction('transport.goToEnd', goToEndForActiveMonitor, []);
  useKeyboardAction('transport.playLoop', playTrimLoop, [playTrimLoop]);
  useKeyboardAction('mark.in', markInForActiveMonitor, []);
  useKeyboardAction('mark.out', markOutForActiveMonitor, []);
  useKeyboardAction('mark.clip', markClipForActiveMonitor, []);
  useKeyboardAction('mark.clipAlt', markClipForActiveMonitor, []);
  useKeyboardAction('mark.clearBoth', clearMarksForActiveMonitor, []);
  useKeyboardAction('mark.clearIn', clearInForActiveMonitor, []);
  useKeyboardAction('mark.clearOut', clearOutForActiveMonitor, []);
  useKeyboardAction('mark.goToIn', goToInForActiveMonitor, []);
  useKeyboardAction('mark.goToOut', goToOutForActiveMonitor, []);
  useKeyboardAction('monitor.matchFrame', () => {
    if (usePlayerStore.getState().activeMonitor !== 'source') {
      matchFrameAtPlayhead();
    }
  }, []);
  useKeyboardAction('monitor.toggleSourceRecord', toggleMonitorFocus, []);
  useKeyboardAction('monitor.activateSource', activateSourceMonitor, []);
  useKeyboardAction('monitor.activateRecord', activateRecordMonitor, []);
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
  useKeyboardAction('trim.recallPrevious', recallPreviousTrimConfiguration, [recallPreviousTrimConfiguration]);
  useKeyboardAction('trim.toggleViewMode', toggleTrimViewMode, [toggleTrimViewMode]);
  useKeyboardAction('nav.prevEdit', goToPrevEditPoint, [goToPrevEditPoint]);
  useKeyboardAction('nav.nextEdit', goToNextEditPoint, [goToNextEditPoint]);
  useKeyboardAction('file.multicameraMode', toggleMulticamMode, [toggleMulticamMode]);
  useKeyboardAction('multicam.cut1', () => cutToMulticamAngle(0), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut2', () => cutToMulticamAngle(1), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut3', () => cutToMulticamAngle(2), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut4', () => cutToMulticamAngle(3), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut5', () => cutToMulticamAngle(4), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut6', () => cutToMulticamAngle(5), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut7', () => cutToMulticamAngle(6), [cutToMulticamAngle]);
  useKeyboardAction('multicam.cut8', () => cutToMulticamAngle(7), [cutToMulticamAngle]);
  useKeyboardAction('smartTool.toggleLiftOverwrite', toggleSmartToolLiftOverwrite, [toggleSmartToolLiftOverwrite]);
  useKeyboardAction('smartTool.toggleExtractSplice', toggleSmartToolExtractSplice, [toggleSmartToolExtractSplice]);
  useKeyboardAction('smartTool.toggleOverwriteTrim', toggleSmartToolOverwriteTrim, [toggleSmartToolOverwriteTrim]);
  useKeyboardAction('smartTool.toggleRippleTrim', toggleSmartToolRippleTrim, [toggleSmartToolRippleTrim]);
  useKeyboardAction('view.fullScreen', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  }, []);

  useEffect(() => {
    multicamEngine.reset();
    useEditorStore.getState().setMulticamActive(false);
    useEditorStore.getState().setMulticamGroupId(null);

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

  useEffect(() => {
    const syncViewport = () => {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport((current) => (
        areViewportDimensionsEqual(current, nextViewport) ? current : nextViewport
      ));
    };

    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const effectiveLayout = clampEditorLayoutForViewport(layout, viewport.width, viewport.height);
  const viewportBounds = getEditorLayoutViewportBounds(viewport.width, viewport.height);
  const maxBinWidth = viewportBounds.maxBinWidth;
  const maxTrackerWidth = viewportBounds.maxTrackerWidth;
  const maxInspectorWidth = viewportBounds.maxInspectorWidth;
  const maxTimelineHeight = viewportBounds.maxTimelineHeight;
  const isStackedWorkspace = viewport.width < 1040;
  const isShortViewport = viewport.height < 820;
  const dockTracker = showTracker && viewport.width >= 1520;
  const overlayTracker = showTracker && !dockTracker;
  const dockInspector = showInspector && viewport.width >= 1320;
  const overlayInspector = showInspector && !dockInspector;
  const overlayWidthCap = Math.max(
    260,
    Math.min(400, Math.floor(viewport.width * (viewport.width < 1320 ? 0.42 : 0.36))),
  );
  const overlayTrackerWidth = Math.min(effectiveLayout.trackerWidth, overlayWidthCap);
  const overlayInspectorWidth = Math.min(effectiveLayout.inspectorWidth, overlayWidthCap);
  const stackedBinHeight = Math.max(
    168,
    Math.min(320, Math.floor(viewport.height * (isShortViewport ? 0.24 : 0.28))),
  );
  const workspaceColumns = [
    `${effectiveLayout.binWidth}px`,
    'var(--panel-divider-w)',
    'minmax(0, 1fr)',
    ...(dockTracker ? ['var(--panel-divider-w)', `${effectiveLayout.trackerWidth}px`] : []),
    ...(dockInspector ? ['var(--panel-divider-w)', `${effectiveLayout.inspectorWidth}px`] : []),
  ].join(' ');
  const editorShellStyle = {
    '--timeline-h': `${effectiveLayout.timelineHeight}px`,
  } as React.CSSProperties;
  const inspectorInsetWidth = dockInspector
    ? effectiveLayout.inspectorWidth
    : overlayInspector && !isStackedWorkspace
      ? overlayInspectorWidth
      : 0;
  const auxiliaryPanelRightInset = showInspector ? inspectorInsetWidth + 16 : 16;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('the-avid.editor-layout.v1', JSON.stringify(effectiveLayout));
  }, [effectiveLayout]);

  return (
    <div className="editor-shell" style={editorShellStyle} onContextMenu={e => e.preventDefault()}>
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
          <div
            className={`workspace${overlayTracker || overlayInspector ? ' workspace-has-overlay' : ''}${isStackedWorkspace ? ' workspace-stacked' : ''}`}
            style={isStackedWorkspace
              ? {
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  gridTemplateRows: `${stackedBinHeight}px minmax(0, 1fr)`,
                }
              : { gridTemplateColumns: workspaceColumns }}
          >
            <div className="left-panels workspace-panel">
              <PanelErrorBoundary panelName="BinPanel">
                <BinPanel />
              </PanelErrorBoundary>
            </div>
            {!isStackedWorkspace ? (
              <PanelResizeHandle
                axis="horizontal"
                ariaLabel="Resize media bin"
                value={effectiveLayout.binWidth}
                min={viewportBounds.minBinWidth}
                max={maxBinWidth}
                className="workspace-resize-handle resize-handle-h"
                onChange={(next) => setLayout((current) => ({ ...current, binWidth: next }))}
              />
            ) : null}
            <div className="canvas-area workspace-panel" style={{ position: 'relative' }}>
              <PanelErrorBoundary panelName="ComposerPanel">
                <ComposerPanel
                  dualMonitorSplit={effectiveLayout.dualMonitorSplit}
                  onDualMonitorSplitChange={(next) => setLayout((current) => ({ ...current, dualMonitorSplit: next }))}
                />
              </PanelErrorBoundary>
              {showTracker && (
                <PanelErrorBoundary panelName="TrackingOverlay">
                  <TrackingOverlay width={1920} height={1080} />
                </PanelErrorBoundary>
              )}
            </div>
            {dockTracker && (
              <>
                <PanelResizeHandle
                  axis="horizontal"
                  ariaLabel="Resize tracker panel"
                  value={effectiveLayout.trackerWidth}
                  min={viewportBounds.minTrackerWidth}
                  max={maxTrackerWidth}
                  invert
                  className="workspace-resize-handle resize-handle-h"
                  onChange={(next) => setLayout((current) => ({ ...current, trackerWidth: next }))}
                />
                <div className="workspace-panel tracker-panel-shell">
                  <PanelErrorBoundary panelName="TrackerPanel">
                    <TrackerPanel />
                  </PanelErrorBoundary>
                </div>
              </>
            )}
            {dockInspector && (
              <>
                <PanelResizeHandle
                  axis="horizontal"
                  ariaLabel="Resize inspector panel"
                  value={effectiveLayout.inspectorWidth}
                  min={viewportBounds.minInspectorWidth}
                  max={maxInspectorWidth}
                  invert
                  className="workspace-resize-handle resize-handle-h"
                  onChange={(next) => setLayout((current) => ({ ...current, inspectorWidth: next }))}
                />
                <div className="workspace-panel inspector-panel-shell">
                  <PanelErrorBoundary panelName="InspectorPanel">
                    <InspectorPanel />
                  </PanelErrorBoundary>
                </div>
              </>
            )}
            {(overlayTracker || overlayInspector) && (
              <div
                className={`workspace-overlay-rail${isStackedWorkspace ? ' workspace-overlay-rail-stacked' : ''}`}
                aria-label="Secondary editor panels"
              >
                {overlayTracker && (
                  <div
                    className={`workspace-overlay-panel${isStackedWorkspace ? ' workspace-overlay-panel-stacked' : ''}`}
                    style={isStackedWorkspace
                      ? undefined
                      : { gridTemplateColumns: `var(--panel-divider-w) ${overlayTrackerWidth}px` }}
                  >
                    {!isStackedWorkspace ? (
                      <PanelResizeHandle
                        axis="horizontal"
                        ariaLabel="Resize tracker panel"
                        value={effectiveLayout.trackerWidth}
                        min={viewportBounds.minTrackerWidth}
                        max={maxTrackerWidth}
                        invert
                        className="workspace-resize-handle resize-handle-h"
                        onChange={(next) => setLayout((current) => ({ ...current, trackerWidth: next }))}
                      />
                    ) : null}
                    <div className="workspace-panel tracker-panel-shell workspace-overlay-surface">
                      <PanelErrorBoundary panelName="TrackerPanel">
                        <TrackerPanel />
                      </PanelErrorBoundary>
                    </div>
                  </div>
                )}
                {overlayInspector && (
                  <div
                    className={`workspace-overlay-panel${isStackedWorkspace ? ' workspace-overlay-panel-stacked' : ''}`}
                    style={isStackedWorkspace
                      ? undefined
                      : { gridTemplateColumns: `var(--panel-divider-w) ${overlayInspectorWidth}px` }}
                  >
                    {!isStackedWorkspace ? (
                      <PanelResizeHandle
                        axis="horizontal"
                        ariaLabel="Resize inspector panel"
                        value={effectiveLayout.inspectorWidth}
                        min={viewportBounds.minInspectorWidth}
                        max={maxInspectorWidth}
                        invert
                        className="workspace-resize-handle resize-handle-h"
                        onChange={(next) => setLayout((current) => ({ ...current, inspectorWidth: next }))}
                      />
                    ) : null}
                    <div className="workspace-panel inspector-panel-shell workspace-overlay-surface">
                      <PanelErrorBoundary panelName="InspectorPanel">
                        <InspectorPanel />
                      </PanelErrorBoundary>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="timeline-shell">
            <PanelResizeHandle
              axis="vertical"
              ariaLabel="Resize timeline"
              value={effectiveLayout.timelineHeight}
              min={viewportBounds.minTimelineHeight}
              max={maxTimelineHeight}
              invert
              className="timeline-resize-handle resize-handle-v"
              onChange={(next) => setLayout((current) => ({ ...current, timelineHeight: next }))}
            />
            <PanelErrorBoundary panelName="TimelinePanel">
              <TimelinePanel />
            </PanelErrorBoundary>
          </div>
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
            padding: 16,
          }}
        >
          <div style={{
            width: 'min(680px, 100%)', maxWidth: 680, height: 'min(85vh, 720px)', maxHeight: 720,
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
          position: 'fixed', top: 24, right: auxiliaryPanelRightInset, bottom: 24,
          width: 'min(360px, calc(100vw - 32px))', zIndex: 900,
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          overflow: 'auto',
        }}>
          <TitleTool />
        </div>
      )}
      {showSubtitleEditor && (
        <div style={{
          position: 'fixed', top: 24, right: auxiliaryPanelRightInset, bottom: 24,
          width: 'min(380px, calc(100vw - 32px))', zIndex: 900,
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
