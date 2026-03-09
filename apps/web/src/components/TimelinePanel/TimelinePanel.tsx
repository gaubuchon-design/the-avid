import React, { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import { AddTrackCommand, RemoveTrackCommand } from '../../engine/commands';
import type { Track, TrackType, TimelineViewMode, EditTool } from '../../store/editor.store';
import { editEngine } from '../../engine/EditEngine';
import { TrackHeaders } from './TrackHeaders';
import { TrackPatchPanel } from './TrackPatchPanel';
import { Ruler } from './Ruler';
import { TimelineCanvas } from './TimelineCanvas';
import { ClipView } from './ClipView';
import { Playhead } from './Playhead';

// ─── TrackLane ───────────────────────────────────────────────────────────────

function TrackLane({
  track,
  zoom,
  totalWidth,
}: {
  track: Track;
  zoom: number;
  totalWidth: number;
}) {
  const clearSelection = useEditorStore((s) => s.clearSelection);
  return (
    <div
      className="track-lane"
      style={{ height: 'var(--track-h)', width: totalWidth }}
      data-track-id={track.id}
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
}

// Keyboard shortcuts are now handled centrally by useGlobalKeyboard() in EditorPage.
// This empty hook remains as a placeholder so the component structure stays clean.
function useKeyboardShortcuts() {
  // No-op — all keyboard dispatch is in hooks/useGlobalKeyboard.ts
}

// ─── TimelinePanel ───────────────────────────────────────────────────────────

export function TimelinePanel() {
  // Track ID generator — persists across renders without causing re-renders
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
    selectedClipIds,
    splitClip,
    showIndex,
    toggleIndex,
    setInPoint,
    setOutPoint,
    inPoint,
    outPoint,
  } = useEditorStore();
  const fps = useEditorStore((s) => s.sequenceSettings.fps);
  const frameDuration = 1 / (fps || 24);

  const contentRef = useRef<HTMLDivElement>(null);
  const totalWidth = Math.max(duration * zoom + 200, 800);

  useKeyboardShortcuts();

  // Playback advancement is handled by the store's togglePlay action

  // Sync vertical scroll between headers and content
  const handleScroll = useCallback(
    (e: React.UIEvent) => {
      const target = e.target as HTMLElement;
      setScrollLeft(target.scrollLeft);
      const headers = document.querySelector('.track-headers');
      if (headers) headers.scrollTop = target.scrollTop;
    },
    [setScrollLeft],
  );

  // Ctrl+Scroll → zoom
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
  }, [tracks]);

  // Remove selected track
  const handleRemoveTrack = useCallback(() => {
    const { selectedTrackId } = useEditorStore.getState();
    if (selectedTrackId && tracks.length > 1) {
      editEngine.execute(new RemoveTrackCommand(selectedTrackId));
    }
  }, [tracks]);

  return (
    <div className="timeline-panel">
      {/* Toolbar — Figma layout: Index | View modes | Scissors | Transport | Mark | Zoom */}
      <div className="timeline-toolbar">
        {/* Index button — Figma shows icon + "Index" text */}
        <button className={`tl-btn tl-btn-labeled${showIndex ? ' active' : ''}`} title="Index" onClick={toggleIndex}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Index</span>
        </button>

        <div className="tl-divider" />

        {/* View mode toggles */}
        <div className="tl-group">
          {([
            { mode: 'list' as TimelineViewMode, title: 'List View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg> },
            { mode: 'timeline' as TimelineViewMode, title: 'Timeline View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg> },
            { mode: 'waveform' as TimelineViewMode, title: 'Waveform View', icon: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg> },
          ]).map(v => (
            <button
              key={v.mode}
              className={`tl-btn${timelineViewMode === v.mode ? ' active' : ''}`}
              title={v.title}
              aria-label={v.title}
              onClick={() => setTimelineViewMode(v.mode)}
            >
              {v.icon}
            </button>
          ))}
        </div>

        <div className="tl-divider" />

        {/* Scissors / Cut tool */}
        <button
          className="tl-btn"
          title="Split Clip (S)"
          aria-label="Split Clip (S)"
          onClick={() => {
            if (selectedClipIds.length > 0) splitClip(selectedClipIds[0], playheadTime);
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </svg>
        </button>

        {/* Add / Remove track */}
        <button className="tl-btn" title="Add Track" aria-label="Add Track" onClick={handleAddTrack}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <button className="tl-btn" title="Remove Track" aria-label="Remove Track" onClick={handleRemoveTrack}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <div className="tl-divider" />

        {/* Transport controls */}
        <div className="tl-group">
          <button className="tl-btn" title="Step Back" aria-label="Step Back" onClick={() => setPlayhead(Math.max(0, playheadTime - frameDuration))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="5" width="3" height="14" rx="1" /><polygon points="20 5 10 12 20 19" />
            </svg>
          </button>
          <button
            className={`tl-btn tl-play-btn${isPlaying ? ' active' : ''}`}
            title="Play/Pause (Space)"
            aria-label="Play/Pause (Space)"
            onClick={togglePlay}
          >
            {isPlaying ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21" />
              </svg>
            )}
          </button>
          <button className="tl-btn" title="Step Forward" aria-label="Step Forward" onClick={() => setPlayhead(Math.min(duration, playheadTime + frameDuration))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="4 5 14 12 4 19" /><rect x="17" y="5" width="3" height="14" rx="1" />
            </svg>
          </button>
        </div>

        <div className="tl-divider" />

        {/* Mark In/Out */}
        <div className="tl-group">
          <button
            className={`tl-btn${inPoint !== null ? ' active' : ''}`}
            title={`Set In (I)${inPoint !== null ? ` — ${inPoint.toFixed(2)}s` : ''}`}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}
            onClick={() => setInPoint(playheadTime)}
          >I</button>
          <button
            className={`tl-btn${outPoint !== null ? ' active' : ''}`}
            title={`Set Out (O)${outPoint !== null ? ` — ${outPoint.toFixed(2)}s` : ''}`}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10 }}
            onClick={() => setOutPoint(playheadTime)}
          >O</button>
        </div>

        <div style={{ flex: 1 }} />

        {/* Zoom controls */}
        <div className="tl-group">
          <span className="zoom-label">{Math.round(zoom)}px/s</span>
          <button className="tl-btn" onClick={() => setZoom(Math.max(10, zoom / 1.5))} title="Zoom Out" aria-label="Zoom Out">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <input type="range" className="range-slider zoom-slider" min={10} max={400} step={1} value={zoom}
            onChange={(e) => setZoom(+e.target.value)} style={{ width: 72 }} />
          <button className="tl-btn" onClick={() => setZoom(Math.min(400, zoom * 1.5))} title="Zoom In" aria-label="Zoom In">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <button className="tl-btn" title="Fit Timeline" aria-label="Fit Timeline" onClick={() => setZoom(60)}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="timeline-body">
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
              />
            ))}

            {/* Playhead */}
            <Playhead
              time={playheadTime}
              zoom={zoom}
              scrollLeft={scrollLeft}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
