import React, { useRef, useCallback, useEffect } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Track, Clip } from '../../store/editor.store';

// ─── Waveform ─────────────────────────────────────────────────────────────────
function Waveform({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (!data.length) return null;
  const hw = height / 2, step = width / data.length;
  const pathD = data.map((v, i) => {
    const x = i * step, amp = v * hw * 0.85;
    return `M${x.toFixed(1)},${(hw - amp).toFixed(1)} L${x.toFixed(1)},${(hw + amp).toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} preserveAspectRatio="none">
      <path d={pathD} stroke={color} strokeWidth="1.2" opacity="0.55" fill="none" />
    </svg>
  );
}

// ─── Ruler ────────────────────────────────────────────────────────────────────
function Ruler({ zoom, scrollLeft, duration, onScrub }: {
  zoom: number; scrollLeft: number; duration: number;
  onScrub: (t: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111822';
    ctx.fillRect(0, 0, W, H);

    const secWidth = zoom;
    const intervalSec = secWidth < 30 ? 10 : secWidth < 60 ? 5 : secWidth < 100 ? 2 : 1;
    const startSec = scrollLeft / zoom;
    const endSec = startSec + W / zoom;

    ctx.font = `9.5px 'DM Mono', monospace`;
    ctx.textAlign = 'center';

    for (let t = Math.floor(startSec / intervalSec) * intervalSec; t <= endSec; t += intervalSec) {
      const x = t * zoom - scrollLeft;
      const isMain = t % (intervalSec * 5) === 0 || intervalSec >= 5;
      ctx.beginPath();
      ctx.moveTo(x, isMain ? 0 : H * 0.55);
      ctx.lineTo(x, H);
      ctx.strokeStyle = isMain ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.stroke();
      if (isMain || intervalSec >= 2) {
        const m = Math.floor(t / 60), s = Math.floor(t % 60);
        ctx.fillStyle = 'rgba(90, 112, 136, 0.8)';
        ctx.fillText(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`, x, H - 5);
      }
    }
  }, [zoom, scrollLeft, duration]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const scrub = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left;
      onScrub(Math.max(0, (x + scrollLeft) / zoom));
    };
    scrub(e.nativeEvent);
    const up = () => { window.removeEventListener('mousemove', scrub); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', scrub);
    window.addEventListener('mouseup', up);
  };

  return (
    <div className="timeline-ruler" onMouseDown={handleMouseDown}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ─── Clip Component ───────────────────────────────────────────────────────────
function ClipView({ clip, zoom, trackId, trackColor }: {
  clip: Clip; zoom: number; trackId: string; trackColor: string;
}) {
  const { selectedClipIds, selectClip, moveClip, trimClip } = useEditorStore();
  const isSelected = selectedClipIds.includes(clip.id);
  const width = Math.max(2, (clip.endTime - clip.startTime) * zoom);
  const left = clip.startTime * zoom;

  const typeClass = `clip-${clip.type}`;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      selectClip(clip.id, true);
    } else {
      selectClip(clip.id);
    }

    const startX = e.clientX;
    const origStart = clip.startTime;
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) > 3) dragging = true;
      if (!dragging) return;
      const newStart = Math.max(0, origStart + dx / zoom);
      const targetTrackEl = (ev.target as HTMLElement).closest('[data-track-id]');
      const newTrackId = targetTrackEl?.getAttribute('data-track-id') ?? trackId;
      moveClip(clip.id, newTrackId, newStart);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTrimLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = clip.startTime;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      trimClip(clip.id, 'left', origStart + dx / zoom);
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTrimRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origEnd = clip.endTime;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      trimClip(clip.id, 'right', origEnd + dx / zoom);
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`clip ${typeClass}${isSelected ? ' selected' : ''}`}
      style={{ left, width: Math.max(6, width), top: 3, bottom: 3, position: 'absolute' }}
      onMouseDown={handleMouseDown}
    >
      {width > 18 && (
        <div className="clip-trim-handle left" onMouseDown={handleTrimLeft} />
      )}

      {clip.waveformData && clip.type === 'audio' && (
        <Waveform data={clip.waveformData} width={width} height={32} color={trackColor} />
      )}

      {width > 30 && (
        <div className="clip-label">{clip.name}</div>
      )}

      {width > 18 && (
        <div className="clip-trim-handle right" onMouseDown={handleTrimRight} />
      )}
    </div>
  );
}

// ─── Track Lane ───────────────────────────────────────────────────────────────
function TrackLane({ track, zoom, totalWidth }: { track: Track; zoom: number; totalWidth: number }) {
  const { clearSelection } = useEditorStore();
  return (
    <div
      className="track-lane"
      style={{ height: 'var(--track-h)', width: totalWidth }}
      data-track-id={track.id}
      onClick={() => clearSelection()}
    >
      {track.clips.map(clip => (
        <ClipView key={clip.id} clip={clip} zoom={zoom} trackId={track.id} trackColor={track.color} />
      ))}
    </div>
  );
}

// ─── Playhead Line ────────────────────────────────────────────────────────────
function PlayheadLine({ time, zoom, scrollLeft }: { time: number; zoom: number; scrollLeft: number }) {
  const left = time * zoom - scrollLeft;
  if (left < 0 || left > 10000) return null;
  return <div className="playhead" style={{ left }} />;
}

// ─── Main Timeline ────────────────────────────────────────────────────────────
export function Timeline() {
  const {
    tracks, markers, playheadTime, setPlayhead,
    zoom, setZoom, scrollLeft, setScrollLeft,
    duration, selectedTrackId, selectTrack,
    toggleMute, toggleSolo, toggleLock,
    matchFrame, razorAtPlayhead, addMarkerAtPlayhead,
    setInToPlayhead, setOutToPlayhead, clearInOut,
    liftSelection, extractSelection,
  } = useEditorStore();

  const contentRef = useRef<HTMLDivElement>(null);
  const totalWidth = Math.max(duration * zoom + 200, 800);

  // Sync scroll between header and content
  const handleScroll = (e: React.UIEvent) => {
    setScrollLeft((e.target as HTMLElement).scrollLeft);
    const headers = document.querySelector('.track-headers');
    if (headers) headers.scrollTop = (e.target as HTMLElement).scrollTop;
  };

  // Zoom with Ctrl+Scroll
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

  const trackTypeColor = (type: Track['type']) => {
    const map: Record<string, string> = {
      VIDEO: 'var(--track-video)', AUDIO: 'var(--track-audio)',
      EFFECT: 'var(--track-effect)', SUBTITLE: 'var(--track-sub)',
      GRAPHIC: 'var(--track-gfx)',
    };
    return map[type] ?? 'var(--text-muted)';
  };

  return (
    <div className="timeline-panel">
      {/* Toolbar */}
      <div className="timeline-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="tl-btn" title="Match Frame (F)" onClick={matchFrame}>⊣⊢</button>
          <button className="tl-btn" title="Razor at Playhead" onClick={razorAtPlayhead}>✂</button>
          <button className="tl-btn" title="Add Marker (M)" onClick={() => addMarkerAtPlayhead()}>◆</button>
        </div>
        <div className="divider" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="tl-btn" title="Set In (I)" onClick={setInToPlayhead}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>I</button>
          <button className="tl-btn" title="Set Out (O)" onClick={setOutToPlayhead}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>O</button>
          <button className="tl-btn" title="Clear In/Out" onClick={clearInOut}
            style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>⌫</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="tl-btn" title="Lift (Z)" onClick={liftSelection}>↑</button>
          <button className="tl-btn" title="Extract (X)" onClick={extractSelection}>⇥</button>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="zoom-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>
            {Math.round(zoom)}px/s
          </span>
          <button className="tl-btn" onClick={() => setZoom(Math.max(10, zoom / 1.5))} title="Zoom Out">−</button>
          <input type="range" className="range-slider zoom-slider" min={10} max={400} step={1}
            value={zoom} onChange={e => setZoom(+e.target.value)} style={{ width: 80 }} />
          <button className="tl-btn" onClick={() => setZoom(Math.min(400, zoom * 1.5))} title="Zoom In">+</button>
          <button className="tl-btn" title="Fit Timeline" onClick={() => setZoom(60)}>⊡</button>
        </div>
      </div>

      {/* Body */}
      <div className="timeline-body">
        {/* Track headers */}
        <div className="track-headers">
          <div className="ruler-spacer" />
          {tracks.map(track => (
            <div
              key={track.id}
              className={`track-header${selectedTrackId === track.id ? ' selected' : ''}`}
              style={{ height: 'var(--track-h)' }}
              onClick={() => selectTrack(track.id)}
            >
              <div className="track-color" style={{ background: trackTypeColor(track.type) }} />
              <span className="track-name" title={track.name}>{track.name}</span>
              <div className="track-icons">
                <button
                  className={`track-icon-btn${track.muted ? ' active' : ''}`}
                  title={track.muted ? 'Unmute' : 'Mute'}
                  onClick={e => { e.stopPropagation(); toggleMute(track.id); }}
                >M</button>
                <button
                  className={`track-icon-btn solo${track.solo ? ' active' : ''}`}
                  title={track.solo ? 'Unsolo' : 'Solo'}
                  onClick={e => { e.stopPropagation(); toggleSolo(track.id); }}
                >S</button>
                <button
                  className={`track-icon-btn lock${track.locked ? ' active' : ''}`}
                  title={track.locked ? 'Unlock' : 'Lock'}
                  onClick={e => { e.stopPropagation(); toggleLock(track.id); }}
                >🔒</button>
              </div>
            </div>
          ))}
        </div>

        {/* Timeline content */}
        <div className="timeline-content" ref={contentRef} onScroll={handleScroll}>
          <div className="timeline-inner" style={{ width: totalWidth }}>
            <Ruler zoom={zoom} scrollLeft={scrollLeft} duration={duration} onScrub={setPlayhead} />

            {tracks.map(track => (
              <TrackLane key={track.id} track={track} zoom={zoom} totalWidth={totalWidth} />
            ))}

            {/* Markers */}
            {markers.map(m => (
              <div key={m.id} className="timeline-marker"
                style={{ left: m.time * zoom, color: m.color }}
                title={m.label}
              />
            ))}

            {/* Playhead */}
            <PlayheadLine time={playheadTime} zoom={zoom} scrollLeft={scrollLeft} />
          </div>
        </div>
      </div>
    </div>
  );
}
