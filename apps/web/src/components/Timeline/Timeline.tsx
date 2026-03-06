import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Track, Clip } from '../../store/editor.store';

// ─── Waveform SVG ──────────────────────────────────────────────────────────────
function Waveform({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (!data.length) return null;
  const hw = height / 2;
  const step = width / data.length;

  const pathD = data.map((v, i) => {
    const x = i * step;
    const amp = v * hw * 0.9;
    return `M${x.toFixed(1)},${(hw - amp).toFixed(1)} L${x.toFixed(1)},${(hw + amp).toFixed(1)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
      <path d={pathD} stroke={color} strokeWidth="1.2" opacity="0.6" fill="none" />
    </svg>
  );
}

// ─── Ruler ─────────────────────────────────────────────────────────────────────
function Ruler({ zoom, scrollLeft, duration }: { zoom: number; scrollLeft: number; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#161d28';
    ctx.fillRect(0, 0, W, H);

    // Grid intervals
    const secWidth = zoom; // px per second
    const intervalSec = secWidth < 40 ? 5 : secWidth < 80 ? 2 : 1;
    const startSec = scrollLeft / zoom;
    const endSec = startSec + W / zoom;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(143,160,180,0.7)';
    ctx.font = `10px 'DM Mono', monospace`;
    ctx.textAlign = 'center';

    for (let t = Math.floor(startSec / intervalSec) * intervalSec; t <= endSec; t += intervalSec) {
      const x = t * zoom - scrollLeft;
      const isMain = t % (intervalSec * 5) === 0;

      ctx.beginPath();
      ctx.moveTo(x, isMain ? 0 : H * 0.6);
      ctx.lineTo(x, H);
      ctx.strokeStyle = isMain ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)';
      ctx.stroke();

      if (isMain || intervalSec >= 2) {
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        const label = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        ctx.fillStyle = 'rgba(143,160,180,0.6)';
        ctx.fillText(label, x, H - 5);
      }
    }
  }, [zoom, scrollLeft, duration]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ─── Clip ──────────────────────────────────────────────────────────────────────
function ClipItem({ clip, zoom, scrollLeft, trackHeight }: {
  clip: Clip; zoom: number; scrollLeft: number; trackHeight: number;
}) {
  const { selectedClipIds, selectClip, trimClip, splitClip } = useEditorStore();
  const isSelected = selectedClipIds.includes(clip.id);

  const left = clip.startTime * zoom - scrollLeft;
  const width = Math.max(2, (clip.endTime - clip.startTime) * zoom);
  const clipH = trackHeight - 6;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    selectClip(clip.id, e.metaKey || e.ctrlKey || e.shiftKey);
  }, [clip.id, selectClip]);

  // Dragging trim handle
  const handleTrimDrag = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origTime = side === 'left' ? clip.startTime : clip.endTime;

    const onMove = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / zoom;
      trimClip(clip.id, side, origTime + dt);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [clip, zoom, trimClip]);

  if (left + width < -20 || left > 9999) return null; // off-screen

  return (
    <div
      className={`clip ${clip.type}${isSelected ? ' selected' : ''}`}
      style={{ left: Math.max(0, left), width, top: 3, height: clipH }}
      onClick={handleClick}
    >
      {/* Waveform for audio */}
      {clip.waveformData && (
        <Waveform
          data={clip.waveformData}
          width={width}
          height={clipH}
          color={clip.type === 'audio' ? '#2bb672' : '#5b6af5'}
        />
      )}

      {/* Clip label */}
      <div className="clip-name">{clip.name}</div>

      {/* Trim handles */}
      <div className="trim-handle left yellow" onMouseDown={(e) => handleTrimDrag('left', e)} />
      <div className="trim-handle right green"  onMouseDown={(e) => handleTrimDrag('right', e)} />
    </div>
  );
}

// ─── Track Header ──────────────────────────────────────────────────────────────
function TrackHeader({ track }: { track: Track }) {
  const { toggleMute, toggleSolo, toggleLock, selectedTrackId, selectTrack } = useEditorStore();
  const typeLabel = track.type.slice(0, 3);
  const typeClass = track.type.toLowerCase().replace('subtitle','subtitle').split('_')[0];
  const isSelected = selectedTrackId === track.id;

  return (
    <div
      className={`track-header${isSelected ? ' selected' : ''}`}
      onClick={() => selectTrack(track.id)}
    >
      <div className={`track-type-pill ${typeClass}`}>{typeLabel}</div>
      <span className="track-name">{track.name}</span>
      <div className="track-controls">
        <button
          className={`track-ctrl-btn${track.muted ? ' active-mute' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
          title="Mute"
        >M</button>
        <button
          className={`track-ctrl-btn${track.solo ? ' active-solo' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }}
          title="Solo"
        >S</button>
        <button
          className={`track-ctrl-btn${track.locked ? ' active-lock' : ''}`}
          onClick={(e) => { e.stopPropagation(); toggleLock(track.id); }}
          title="Lock"
        >🔒</button>
      </div>
    </div>
  );
}

// ─── Timeline ──────────────────────────────────────────────────────────────────
export function Timeline() {
  const {
    tracks, markers, playheadTime, setPlayhead, zoom, setZoom,
    scrollLeft, setScrollLeft, clearSelection, isPlaying,
  } = useEditorStore();

  const laneScrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const TRACK_H = 40;
  const TOTAL_DURATION = 60; // seconds visible
  const totalWidth = TOTAL_DURATION * zoom;

  // Sync horizontal scroll between ruler and lanes
  const handleScroll = useCallback(() => {
    const x = laneScrollRef.current?.scrollLeft ?? 0;
    setScrollLeft(x);
  }, [setScrollLeft]);

  // Click ruler to seek
  const handleRulerClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    setPlayhead(x / zoom);
  }, [scrollLeft, zoom, setPlayhead]);

  // Playhead auto-scroll
  useEffect(() => {
    if (!isPlaying || !laneScrollRef.current) return;
    const playX = playheadTime * zoom;
    const el = laneScrollRef.current;
    const right = el.scrollLeft + el.offsetWidth - 60;
    if (playX > right) el.scrollLeft = playX - el.offsetWidth * 0.4;
  }, [playheadTime, isPlaying, zoom]);

  const playheadX = playheadTime * zoom - scrollLeft;

  return (
    <div className="timeline-area">
      {/* Header row */}
      <div className="timeline-header">
        <div className="timeline-tracks-header">
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em' }}>TRACKS</span>
          <button
            className="panel-action-btn"
            title="Add track"
            style={{ marginLeft: 'auto' }}
          >+</button>
        </div>
        <div
          className="timeline-ruler"
          ref={rulerRef}
          onClick={handleRulerClick}
          style={{ overflow: 'hidden', position: 'relative' }}
        >
          <Ruler zoom={zoom} scrollLeft={scrollLeft} duration={TOTAL_DURATION} />

          {/* Markers on ruler */}
          {markers.map(m => {
            const mx = m.time * zoom - scrollLeft;
            if (mx < 0 || mx > 9999) return null;
            return (
              <div key={m.id} style={{
                position: 'absolute', top: 0, left: mx,
                width: 1, height: '100%',
                background: m.color, opacity: 0.8,
                zIndex: 5, pointerEvents: 'none',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: 3,
                  fontSize: 9, color: m.color, whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)', background: 'var(--bg-base)',
                  padding: '1px 3px', borderRadius: 2,
                }}>
                  {m.label}
                </div>
              </div>
            );
          })}

          {/* Playhead on ruler */}
          {playheadX >= 0 && (
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: playheadX,
              width: 1, background: 'var(--playhead)', zIndex: 10, pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute', top: 2, left: -4,
                width: 9, height: 9,
                background: 'var(--playhead)',
                clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)',
              }} />
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="timeline-body">
        {/* Track headers sidebar */}
        <div className="tracks-sidebar">
          {tracks.map(t => <TrackHeader key={t.id} track={t} />)}
        </div>

        {/* Scrollable lanes */}
        <div
          className="timeline-tracks-scroll"
          ref={laneScrollRef}
          onScroll={handleScroll}
          onClick={clearSelection}
        >
          <div style={{ width: totalWidth, position: 'relative' }}>
            {/* Playhead vertical bar */}
            {playheadX >= 0 && (
              <div className="playhead" style={{ left: playheadX }} />
            )}

            {/* Marker lines */}
            {markers.map(m => {
              const mx = m.time * zoom - scrollLeft;
              return (
                <div key={m.id} style={{
                  position: 'absolute', top: 0, bottom: 0, left: m.time * zoom,
                  width: 1, background: m.color, opacity: 0.4, zIndex: 5, pointerEvents: 'none',
                }} />
              );
            })}

            {/* Tracks + clips */}
            {tracks.map(track => (
              <div
                key={track.id}
                className={`track-lane${track.type === 'AUDIO' ? ' audio-track' : ''}`}
                style={{ height: TRACK_H }}
              >
                {track.clips.map(clip => (
                  <ClipItem
                    key={clip.id}
                    clip={clip}
                    zoom={zoom}
                    scrollLeft={scrollLeft}
                    trackHeight={TRACK_H}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="timeline-zoom">
        <button className="zoom-btn" onClick={() => setZoom(zoom * 0.7)} title="Zoom out (-)">−</button>
        <div className="zoom-level">{Math.round(zoom)}px/s</div>
        <button className="zoom-btn" onClick={() => setZoom(zoom * 1.4)} title="Zoom in (+)">+</button>
        <button className="zoom-btn" onClick={() => setZoom(60)} title="Reset zoom" style={{ fontSize: 9 }}>⌂</button>
      </div>
    </div>
  );
}
