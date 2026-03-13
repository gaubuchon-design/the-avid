import React, { useRef, useEffect, useCallback, memo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { AddTrackCommand, RemoveTrackCommand } from '../../engine/commands';
import type { Track, TrackType, TimelineViewMode, EditTool } from '../../store/editor.store';
import { editEngine } from '../../engine/EditEngine';
import { trimEngine } from '../../engine/TrimEngine';
import { enterTrimModeFromContext } from '../../lib/trimEntry';
import { TrackHeaders } from './TrackHeaders';
import { TrackPatchPanel } from './TrackPatchPanel';
import { Ruler } from './Ruler';
import { TimelineCanvas } from './TimelineCanvas';
import { ClipView } from './ClipView';
import { Playhead } from './Playhead';

function formatTimelineTimecode(seconds: number, fps = 24): string {
  const roundedFps = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(seconds * roundedFps));
  const hours = Math.floor(totalFrames / (roundedFps * 3600));
  const minutes = Math.floor((totalFrames % (roundedFps * 3600)) / (roundedFps * 60));
  const secs = Math.floor((totalFrames % (roundedFps * 60)) / roundedFps);
  const frames = totalFrames % roundedFps;

  return [
    hours,
    minutes,
    secs,
    frames,
  ].map((value) => String(value).padStart(2, '0')).join(':');
}

// ─── TrackLane ───────────────────────────────────────────────────────────────

interface TrackLaneProps {
  track: Track;
  zoom: number;
  totalWidth: number;
}

const TrackLane = memo(function TrackLane({
  track,
  zoom,
  totalWidth,
}: TrackLaneProps) {
  const clearSelection = useEditorStore((s) => s.clearSelection);
  return (
    <div
      className="track-lane"
      style={{ height: 'var(--track-h)', width: totalWidth }}
      data-track-id={track.id}
      role="row"
      aria-label={`Track ${track.name}`}
      onClick={(e) => {
        // Only clear selection when clicking the lane itself, not a child clip
        if ((e.target as HTMLElement).closest('.clip')) return;
        clearSelection();
      }}
    >
      {track.clips.map((clip) => (
        <ClipView
          key={clip.id}
          clip={clip}
          zoom={zoom}
          trackId={track.id}
          trackColor={track.color}
        />
      ))}
    </div>
  );
});

// Keyboard shortcuts are now handled centrally by useGlobalKeyboard() in EditorPage.
// This empty hook remains as a placeholder so the component structure stays clean.
function useKeyboardShortcuts() {
  // No-op — all keyboard dispatch is in hooks/useGlobalKeyboard.ts
}

// ─── TimelinePanel ───────────────────────────────────────────────────────────

export function TimelinePanel() {
  // Track ID generator -- persists across renders without causing re-renders
  const nextTrackNumRef = useRef(100);
  const makeTrackId = useCallback((): string => {
    return `t_${Date.now()}_${nextTrackNumRef.current++}`;
  }, []);
  const {
    tracks,
    markers,
    playheadTime,
    setPlayhead,
    zoom,
    setZoom,
    scrollLeft,
    setScrollLeft,
    duration,
    isPlaying,
    togglePlay,
    timelineViewMode,
    setTimelineViewMode,
    activeTool,
    setActiveTool,
    trimActive,
    trimMode,
    trimSelectionLabel,
    trimCounterFrames,
    selectedTrimEditPoints,
    selectedClipIds,
    splitClip,
    showIndex,
    toggleIndex,
    setInPoint,
    setOutPoint,
    inPoint,
    outPoint,
    smartToolLiftOverwrite,
    smartToolExtractSplice,
    smartToolOverwriteTrim,
    smartToolRippleTrim,
    toggleSmartToolLiftOverwrite,
    toggleSmartToolExtractSplice,
    toggleSmartToolOverwriteTrim,
    toggleSmartToolRippleTrim,
    setTrimEditPointSide,
    clearTrimEditPoints,
  } = useEditorStore();
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const frameDuration = 1 / (fps || 24);
  const trimSelectionSummary = React.useMemo(() => {
    if (selectedTrimEditPoints.length === 0) {
      return null;
    }

    const anchorEditPointTime = selectedTrimEditPoints[selectedTrimEditPoints.length - 1]!.editPointTime;
    const sides = new Set(selectedTrimEditPoints.map((selection) => selection.side));
    const distinctEditPointTimes = selectedTrimEditPoints.reduce<number[]>((times, selection) => {
      if (times.some((time) => Math.abs(time - selection.editPointTime) <= frameDuration)) {
        return times;
      }

      times.push(selection.editPointTime);
      return times;
    }, []);
    const selectionLabel = sides.size > 1
      ? 'ASYM'
      : sides.has('A_SIDE')
        ? 'A'
        : sides.has('B_SIDE')
          ? 'B'
          : 'AB';

    return {
      count: selectedTrimEditPoints.length,
      anchorEditPointTime,
      distinctEditPointCount: distinctEditPointTimes.length,
      hasMultipleEditPoints: distinctEditPointTimes.length > 1,
      selectionLabel,
    };
  }, [frameDuration, selectedTrimEditPoints]);

  const contentRef = useRef<HTMLDivElement>(null);
  const totalWidth = Math.max(duration * zoom + 200, 800);

  useKeyboardShortcuts();

  // Playback advancement is handled by the store's togglePlay action

  // Sync vertical scroll between headers and content
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      setScrollLeft(target.scrollLeft);
      const headers = document.querySelector('.track-headers');
      if (headers) headers.scrollTop = target.scrollTop;
    },
    [setScrollLeft],
  );

  // Ctrl+Scroll -> zoom
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 0.87;
        setZoom(zoom * factor);
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, setZoom]);

  // Add track handler
  const handleAddTrack = useCallback(() => {
    const videoCount = tracks.filter((t) => t.type === 'VIDEO').length;
    const newTrack: Track = {
      id: makeTrackId(),
      name: `V${videoCount + 1}`,
      type: 'VIDEO' as TrackType,
      sortOrder: tracks.length,
      muted: false,
      locked: false,
      solo: false,
      volume: 1,
      clips: [],
      color: '#5b6af5',
    };
    editEngine.execute(new AddTrackCommand(newTrack));
  }, [tracks, makeTrackId]);

  // Remove selected track
  const handleRemoveTrack = useCallback(() => {
    const { selectedTrackId } = useEditorStore.getState();
    if (selectedTrackId && tracks.length > 1) {
      editEngine.execute(new RemoveTrackCommand(selectedTrackId));
    }
  }, [tracks]);

  const handleEnterTrim = useCallback(() => {
    const state = useEditorStore.getState();
    const target = enterTrimModeFromContext(state);
    if (!target) {
      return;
    }

    useEditorStore.getState().setActiveTool('trim');
    useEditorStore.getState().selectTrack(target.anchorTrackId);
    useEditorStore.getState().clearTrimEditPoints();
  }, []);

  const handleExitTrim = useCallback(() => {
    trimEngine.exitTrimMode();
  }, []);

  const handleTrimNudge = useCallback((frames: number) => {
    const state = useEditorStore.getState();
    const activeFps = state.sequenceSettings.fps || 24;
    trimEngine.trimByFrames(frames, activeFps);
  }, []);

  const handleSelectTrimASide = useCallback(() => {
    trimEngine.selectASide();
  }, []);

  const handleSelectTrimBSide = useCallback(() => {
    trimEngine.selectBSide();
  }, []);

  const handleSelectTrimBothSides = useCallback(() => {
    trimEngine.selectBothSides();
  }, []);

  const handleSelectTrimCutASide = useCallback(() => {
    setTrimEditPointSide('A_SIDE');
  }, [setTrimEditPointSide]);

  const handleSelectTrimCutBSide = useCallback(() => {
    setTrimEditPointSide('B_SIDE');
  }, [setTrimEditPointSide]);

  const handleSelectTrimCutBothSides = useCallback(() => {
    setTrimEditPointSide('BOTH');
  }, [setTrimEditPointSide]);

  return (
    <div className="timeline-panel" role="region" aria-label="Timeline Editor">
      {/* Toolbar -- Figma layout: Index | View modes | Scissors | Transport | Mark | Zoom */}
      <div className="timeline-toolbar" role="toolbar" aria-label="Timeline Controls">
        <div className="timeline-toolbar-section tl-tool-cluster" role="group" aria-label="Edit tools">
          {([
            { id: 'select' as EditTool, label: 'Sel', title: 'Selection Tool (A)' },
            { id: 'trim' as EditTool, label: 'Trim', title: 'Trim Tool (U)' },
            { id: 'razor' as EditTool, label: 'Cut', title: 'Razor Tool (C)' },
            { id: 'slip' as EditTool, label: 'Slip', title: 'Slip Tool (Y)' },
            { id: 'slide' as EditTool, label: 'Slide', title: 'Slide Tool' },
          ]).map((tool) => (
            <button
              key={tool.id}
              className={`tl-btn tl-btn-labeled tl-tool-btn${activeTool === tool.id ? ' active' : ''}`}
              title={tool.title}
              aria-label={tool.title}
              aria-pressed={activeTool === tool.id}
              onClick={() => setActiveTool(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>

        <div className="tl-divider" role="separator" />

        <div className="timeline-toolbar-section tl-trim-deck" role="group" aria-label="Trim controls">
          <button
            className={`tl-btn tl-btn-labeled tl-trim-entry${trimActive ? ' active' : ''}`}
            title={trimSelectionSummary
              ? `Enter trim from ${trimSelectionSummary.count} selected cut${trimSelectionSummary.count > 1 ? 's' : ''}${trimSelectionSummary.hasMultipleEditPoints ? ` across ${trimSelectionSummary.distinctEditPointCount} edit points` : ''}`
              : 'Enter Trim Mode'}
            aria-label={trimActive
              ? 'Trim mode is active'
              : trimSelectionSummary
                ? 'Enter trim mode from the selected cut points'
                : 'Enter trim mode at the selected cut'}
            aria-pressed={trimActive}
            onClick={handleEnterTrim}
          >
            {trimActive
              ? `${trimMode.toUpperCase()} ${trimSelectionLabel}`
              : trimSelectionSummary
                ? `${trimSelectionSummary.count} CUT${trimSelectionSummary.count > 1 ? 'S' : ''}`
                : 'Trim'}
          </button>

          {(trimActive || trimSelectionSummary) && (
            <>
              <button
                className={`tl-btn tl-btn-labeled${(trimActive ? trimSelectionLabel : trimSelectionSummary?.selectionLabel) === 'A' ? ' active' : ''}`}
                title="Select A-side trim"
                aria-label="Select A-side trim"
                onClick={trimActive ? handleSelectTrimASide : handleSelectTrimCutASide}
              >
                A
              </button>
              <button
                className={`tl-btn tl-btn-labeled${(trimActive ? trimSelectionLabel : trimSelectionSummary?.selectionLabel) === 'AB' ? ' active' : ''}`}
                title="Select both trim sides"
                aria-label="Select both trim sides"
                onClick={trimActive ? handleSelectTrimBothSides : handleSelectTrimCutBothSides}
              >
                AB
              </button>
              <button
                className={`tl-btn tl-btn-labeled${(trimActive ? trimSelectionLabel : trimSelectionSummary?.selectionLabel) === 'B' ? ' active' : ''}`}
                title="Select B-side trim"
                aria-label="Select B-side trim"
                onClick={trimActive ? handleSelectTrimBSide : handleSelectTrimCutBSide}
              >
                B
              </button>
              {trimActive ? (
                <>
                  <button className="tl-btn tl-btn-labeled" title="Trim left ten frames" aria-label="Trim left ten frames" onClick={() => handleTrimNudge(-10)}>-10</button>
                  <button className="tl-btn tl-btn-labeled" title="Trim left one frame" aria-label="Trim left one frame" onClick={() => handleTrimNudge(-1)}>-1</button>
                  <button className="tl-btn tl-btn-labeled" title="Trim right one frame" aria-label="Trim right one frame" onClick={() => handleTrimNudge(1)}>+1</button>
                  <button className="tl-btn tl-btn-labeled" title="Trim right ten frames" aria-label="Trim right ten frames" onClick={() => handleTrimNudge(10)}>+10</button>
                  <span className="timeline-toolbar-pill" aria-live="polite">
                    {trimCounterFrames > 0 ? '+' : ''}{trimCounterFrames}f
                  </span>
                  <button className="tl-btn tl-btn-labeled" title="Exit trim mode" aria-label="Exit trim mode" onClick={handleExitTrim}>Exit</button>
                </>
              ) : trimSelectionSummary ? (
                <>
                  {trimSelectionSummary.selectionLabel === 'ASYM' && (
                    <span className="timeline-toolbar-pill" aria-live="polite">
                      ASYM
                    </span>
                  )}
                  {trimSelectionSummary.hasMultipleEditPoints && (
                    <span className="timeline-toolbar-pill" aria-live="polite">
                      {trimSelectionSummary.distinctEditPointCount} PTS
                    </span>
                  )}
                  <span className="timeline-toolbar-pill timeline-toolbar-pill-emphasis" aria-live="polite">
                    {formatTimelineTimecode(trimSelectionSummary.anchorEditPointTime, fps)}
                  </span>
                  <button
                    className="tl-btn tl-btn-labeled"
                    title="Clear selected cut points"
                    aria-label="Clear selected cut points"
                    onClick={clearTrimEditPoints}
                  >
                    Clear
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="tl-divider" role="separator" />

        <div className="timeline-toolbar-section" role="group" aria-label="Timeline editing tools">
          <button
            className={`tl-btn tl-btn-labeled${showIndex ? ' active' : ''}`}
            title="Index"
            aria-label="Toggle Index Panel"
            aria-pressed={showIndex}
            onClick={toggleIndex}
          >
            Index
          </button>
          <button
            className="tl-btn"
            title="Split Clip (S)"
            aria-label="Split selected clip at playhead"
            onClick={() => {
              if (selectedClipIds.length > 0) splitClip(selectedClipIds[0]!, playheadTime);
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          </button>
          <button className="tl-btn" title="Add Track" aria-label="Add video track" onClick={handleAddTrack}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button className="tl-btn" title="Remove Track" aria-label="Remove selected track" onClick={handleRemoveTrack}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            className={`tl-btn tl-btn-labeled${smartToolLiftOverwrite ? ' active' : ''}`}
            title="Toggle Lift/Overwrite Segment (Shift+A)"
            aria-label="Toggle lift or overwrite segment mode"
            aria-pressed={smartToolLiftOverwrite}
            onClick={toggleSmartToolLiftOverwrite}
          >
            OW
          </button>
          <button
            className={`tl-btn tl-btn-labeled${smartToolExtractSplice ? ' active' : ''}`}
            title="Toggle Extract/Splice-In Segment (Shift+S)"
            aria-label="Toggle extract or splice segment mode"
            aria-pressed={smartToolExtractSplice}
            onClick={toggleSmartToolExtractSplice}
          >
            SP
          </button>
          <button
            className={`tl-btn tl-btn-labeled${smartToolOverwriteTrim ? ' active' : ''}`}
            title="Toggle Overwrite Trim (Shift+D)"
            aria-label="Toggle overwrite trim mode"
            aria-pressed={smartToolOverwriteTrim}
            onClick={toggleSmartToolOverwriteTrim}
          >
            OT
          </button>
          <button
            className={`tl-btn tl-btn-labeled${smartToolRippleTrim ? ' active' : ''}`}
            title="Toggle Ripple Trim (Shift+F)"
            aria-label="Toggle ripple trim mode"
            aria-pressed={smartToolRippleTrim}
            onClick={toggleSmartToolRippleTrim}
          >
            RT
          </button>
        </div>

        <div className="tl-divider" role="separator" />

        <div className="timeline-toolbar-section tl-group" role="group" aria-label="Transport Controls">
          <button className="tl-btn" title="Step Back (Left Arrow)" aria-label="Step back one frame" onClick={() => setPlayhead(Math.max(0, playheadTime - frameDuration))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="5" width="3" height="14" rx="1" /><polygon points="20 5 10 12 20 19" />
            </svg>
          </button>
          <button
            className={`tl-btn tl-play-btn${isPlaying ? ' active' : ''}`}
            title="Play/Pause (Space)"
            aria-label={isPlaying ? 'Pause playback' : 'Start playback'}
            aria-pressed={isPlaying}
            onClick={togglePlay}
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>
          <button className="tl-btn" title="Step Forward (Right Arrow)" aria-label="Step forward one frame" onClick={() => setPlayhead(Math.min(duration, playheadTime + frameDuration))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="4 5 14 12 4 19" /><rect x="17" y="5" width="3" height="14" rx="1" />
            </svg>
          </button>
        </div>

        <div className="tl-divider" role="separator" />

        <div className="timeline-toolbar-section tl-group" role="group" aria-label="In/Out Points">
          <button
            className={`tl-btn${inPoint !== null ? ' active' : ''}`}
            title={`Set In (I)${inPoint !== null ? ` -- ${inPoint.toFixed(2)}s` : ''}`}
            aria-label={`Set In Point${inPoint !== null ? ` (currently ${inPoint.toFixed(2)}s)` : ''}`}
            aria-pressed={inPoint !== null}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}
            onClick={() => setInPoint(playheadTime)}
          >I</button>
          <button
            className={`tl-btn${outPoint !== null ? ' active' : ''}`}
            title={`Set Out (O)${outPoint !== null ? ` -- ${outPoint.toFixed(2)}s` : ''}`}
            aria-label={`Set Out Point${outPoint !== null ? ` (currently ${outPoint.toFixed(2)}s)` : ''}`}
            aria-pressed={outPoint !== null}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}
            onClick={() => setOutPoint(playheadTime)}
          >O</button>
        </div>

        <div className="timeline-toolbar-spacer" />

        <div className="timeline-toolbar-section tl-group" role="radiogroup" aria-label="Timeline View Mode">
          {([
            { mode: 'list' as TimelineViewMode, title: 'List View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> },
            { mode: 'timeline' as TimelineViewMode, title: 'Timeline View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg> },
            { mode: 'waveform' as TimelineViewMode, title: 'Waveform View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg> },
          ]).map((view) => (
            <button
              key={view.mode}
              className={`tl-btn${timelineViewMode === view.mode ? ' active' : ''}`}
              title={view.title}
              aria-label={view.title}
              role="radio"
              aria-checked={timelineViewMode === view.mode}
              onClick={() => setTimelineViewMode(view.mode)}
            >
              {view.icon}
            </button>
          ))}
        </div>

        <div className="timeline-toolbar-section tl-group" role="group" aria-label="Zoom Controls">
          <span className="zoom-label" aria-live="polite">{Math.round(zoom)}px/s</span>
          <button className="tl-btn" onClick={() => setZoom(Math.max(10, zoom / 1.5))} title="Zoom Out" aria-label="Zoom out timeline">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <input
            type="range"
            className="range-slider zoom-slider"
            min={10}
            max={400}
            step={1}
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
            style={{ width: 72 }}
            aria-label="Timeline zoom level"
            aria-valuemin={10}
            aria-valuemax={400}
            aria-valuenow={Math.round(zoom)}
          />
          <button className="tl-btn" onClick={() => setZoom(Math.min(400, zoom * 1.5))} title="Zoom In" aria-label="Zoom in timeline">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button className="tl-btn" title="Fit Timeline" aria-label="Fit timeline to view" onClick={() => setZoom(60)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="timeline-body" role="grid" aria-label="Timeline tracks and clips">
        <TrackPatchPanel />
        <TrackHeaders />

        <div
          className="timeline-content"
          ref={contentRef}
          onScroll={handleScroll}
          style={{ position: 'relative' }}
        >
          {/* OffscreenCanvas worker background */}
          <TimelineCanvas />

          <div className="timeline-inner" style={{ width: totalWidth, position: 'relative', zIndex: 1 }}>
            <Ruler
              zoom={zoom}
              scrollLeft={scrollLeft}
              duration={duration}
              onScrub={setPlayhead}
            />

            {tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                zoom={zoom}
                totalWidth={totalWidth}
              />
            ))}

            {/* Markers */}
            {markers.map((m) => (
              <div
                key={m.id}
                className="timeline-marker"
                style={{ left: m.time * zoom, color: m.color }}
                title={m.label}
                role="img"
                aria-label={`Marker: ${m.label} at ${m.time.toFixed(2)}s`}
              />
            ))}

            {/* Playhead */}
            <Playhead
              time={playheadTime}
              zoom={zoom}
              scrollLeft={scrollLeft}
              duration={duration}
              viewportRef={contentRef}
              onScrub={setPlayhead}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
