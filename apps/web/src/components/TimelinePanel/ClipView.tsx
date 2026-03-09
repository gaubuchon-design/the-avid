import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Clip } from '../../store/editor.store';
import { editEngine } from '../../engine/EditEngine';
import { snapEngine } from '../../engine/SnapEngine';
import {
  MoveClipCommand,
  TrimClipLeftCommand,
  TrimClipRightCommand,
} from '../../engine/commands';

// ─── Context Menu ──────────────────────────────────────────────────────────────

interface ClipContextMenuProps {
  x: number;
  y: number;
  clipId: string;
  onClose: () => void;
}

function ClipContextMenu({
  x, y, clipId, onClose,
}: ClipContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const state = useEditorStore.getState();

  const actions = [
    { label: 'Split at Playhead', shortcut: 'S', action: () => state.splitClip(clipId, state.playheadTime) },
    { label: 'Duplicate', shortcut: '⌘D', action: () => state.duplicateClip(clipId) },
    { label: '—', shortcut: '', action: () => {} },
    { label: 'Delete', shortcut: '⌫', action: () => { state.selectClip(clipId); state.deleteSelectedClips(); } },
    { label: 'Ripple Delete', shortcut: '⇧⌫', action: () => state.rippleDelete(clipId) },
    { label: '—', shortcut: '', action: () => {} },
    { label: 'Select All on Track', shortcut: '', action: () => {
      const track = state.tracks.find(t => t.clips.some(c => c.id === clipId));
      if (track) track.clips.forEach((c, i) => state.selectClip(c.id, i > 0));
    }},
  ];

  return (
    <div ref={menuRef} className="clip-context-menu" style={{ left: x, top: y }} role="menu" aria-label="Clip actions">
      {actions.map((a, i) => a.label === '—' ? (
        <div key={i} className="clip-context-divider" role="separator" />
      ) : (
        <button key={i} className="clip-context-item" role="menuitem"
          onClick={() => { a.action(); onClose(); }}>
          <span>{a.label}</span>
          {a.shortcut && <span className="clip-context-shortcut" aria-label={`Keyboard shortcut: ${a.shortcut}`}>{a.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Waveform SVG ────────────────────────────────────────────────────────────

interface WaveformProps {
  data: number[];
  width: number;
  height: number;
  color: string;
}

const Waveform = memo(function Waveform({
  data,
  width,
  height,
  color,
}: WaveformProps) {
  if (!data.length) return null;
  const hw = height / 2;
  const step = width / data.length;
  const pathD = data
    .map((v, i) => {
      const x = i * step;
      const amp = v * hw * 0.85;
      return `M${x.toFixed(1)},${(hw - amp).toFixed(1)} L${x.toFixed(1)},${(hw + amp).toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0 }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={pathD} stroke={color} strokeWidth="1.2" opacity="0.55" fill="none" />
    </svg>
  );
});

// ─── ClipView ────────────────────────────────────────────────────────────────

interface ClipViewProps {
  clip: Clip;
  zoom: number;
  trackId: string;
  trackColor: string;
}

export const ClipView = memo(function ClipView({ clip, zoom, trackId, trackColor }: ClipViewProps) {
  const { selectedClipIds, selectClip, tracks, markers, playheadTime } =
    useEditorStore();
  const isSelected = selectedClipIds.includes(clip.id);
  const width = Math.max(2, (clip.endTime - clip.startTime) * zoom);
  const left = clip.startTime * zoom;
  const typeClass = `clip-${clip.type}`;

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectClip(clip.id);
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, [clip.id, selectClip]);

  // ── Body drag (move) ──
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      selectClip(clip.id, true);
    } else {
      selectClip(clip.id);
    }

    const startX = e.clientX;
    const origStart = clip.startTime;
    const origTrackId = trackId;
    let dragging = false;
    let lastStart = origStart;
    let lastTrack = origTrackId;

    const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (!dragging && Math.abs(dx) > 3) dragging = true;
      if (!dragging) return;

      let newStart = Math.max(0, origStart + dx / zoom);
      // Snap
      const sr = snapEngine.snap(newStart, zoom, anchors);
      if (sr) newStart = sr.time;
      const endSnap = snapEngine.snap(
        newStart + (clip.endTime - clip.startTime),
        zoom,
        anchors,
      );
      if (endSnap)
        newStart = endSnap.time - (clip.endTime - clip.startTime);

      const targetTrackEl = (ev.target as HTMLElement).closest('[data-track-id]');
      const newTrackId = targetTrackEl?.getAttribute('data-track-id') ?? trackId;

      // Live preview via store (not via engine – commit on mouseup)
      useEditorStore.getState().moveClip(clip.id, newTrackId, newStart);
      lastStart = newStart;
      lastTrack = newTrackId;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (dragging && (lastStart !== origStart || lastTrack !== origTrackId)) {
        // Restore original position, then execute through engine for undo
        useEditorStore.getState().moveClip(clip.id, origTrackId, origStart);
        editEngine.execute(
          new MoveClipCommand(clip.id, origTrackId, origStart, lastTrack, lastStart),
        );
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Left trim ──
  const handleTrimLeft = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origStart = clip.startTime;
    let lastTime = origStart;

    const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      let newTime = origStart + dx / zoom;
      const sr = snapEngine.snap(newTime, zoom, anchors);
      if (sr) newTime = sr.time;
      useEditorStore.getState().trimClip(clip.id, 'left', newTime);
      lastTime = newTime;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (lastTime !== origStart) {
        useEditorStore.getState().trimClip(clip.id, 'left', origStart);
        editEngine.execute(new TrimClipLeftCommand(clip.id, origStart, lastTime));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Right trim ──
  const handleTrimRight = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const origEnd = clip.endTime;
    let lastTime = origEnd;

    const anchors = snapEngine.collectAnchors(tracks, playheadTime, markers, clip.id);

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      let newTime = origEnd + dx / zoom;
      const sr = snapEngine.snap(newTime, zoom, anchors);
      if (sr) newTime = sr.time;
      useEditorStore.getState().trimClip(clip.id, 'right', newTime);
      lastTime = newTime;
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (lastTime !== origEnd) {
        useEditorStore.getState().trimClip(clip.id, 'right', origEnd);
        editEngine.execute(new TrimClipRightCommand(clip.id, origEnd, lastTime));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      <div
        className={`clip ${typeClass}${isSelected ? ' selected' : ''}`}
        style={{
          left,
          width: Math.max(6, width),
          top: 3,
          bottom: 3,
          position: 'absolute',
        }}
        role="gridcell"
        aria-label={`${clip.name} (${clip.type}, ${(clip.endTime - clip.startTime).toFixed(2)}s)`}
        aria-selected={isSelected}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onContextMenu={handleContextMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectClip(clip.id, e.ctrlKey || e.metaKey);
          }
        }}
      >
        {width > 18 && (
          <div className="clip-trim-handle left" onMouseDown={handleTrimLeft} role="separator" aria-label="Trim left edge" />
        )}

        {clip.waveformData && clip.type === 'audio' && (
          <Waveform
            data={clip.waveformData}
            width={width}
            height={32}
            color={trackColor}
          />
        )}

        {width > 30 && <div className="clip-label">{clip.name}</div>}

        {width > 18 && (
          <div className="clip-trim-handle right" onMouseDown={handleTrimRight} role="separator" aria-label="Trim right edge" />
        )}
      </div>

      {ctxMenu && (
        <ClipContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          clipId={clip.id}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
});
