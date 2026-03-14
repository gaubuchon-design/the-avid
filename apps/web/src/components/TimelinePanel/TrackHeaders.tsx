import React, { memo, useState, useRef, useCallback } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Track } from '../../store/editor.store';

const TRACK_TYPE_COLOR: Record<string, string> = {
  VIDEO: 'var(--track-video, #5b6af5)',
  AUDIO: 'var(--track-audio, #2bb672)',
  EFFECT: 'var(--track-effect, #e8943a)',
  SUBTITLE: 'var(--track-sub, #6bc5e3)',
  GRAPHIC: 'var(--track-gfx, #fb7185)',
};

const TRACK_COLORS = [
  '#5b6af5', '#2bb672', '#e8943a', '#fb7185', '#6bc5e3',
  '#f59e0b', '#a855f7', '#ef4444', '#00c896', '#64748b',
];

interface TrackHeaderProps {
  track: Track;
  trackHeight: number;
  onHeightChange: (trackId: string, height: number) => void;
}

const TrackHeader = memo(function TrackHeader({ track, trackHeight, onHeightChange }: TrackHeaderProps) {
  const { selectedTrackId, selectTrack, toggleMute, toggleSolo, toggleLock } =
    useEditorStore();
  const setTrackVolume = useEditorStore((s) => s.setTrackVolume);
  const isSelected = selectedTrackId === track.id;
  const color = TRACK_TYPE_COLOR[track.type] ?? 'var(--text-muted)';

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(track.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ y: 0, h: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Track renaming
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(track.name);
    setIsRenaming(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [track.name]);

  const commitRename = useCallback(() => {
    setIsRenaming(false);
    if (renameValue.trim() && renameValue !== track.name) {
      const store = useEditorStore.getState();
      store.updateTrack?.(track.id, { name: renameValue.trim() });
    }
  }, [renameValue, track.id, track.name]);

  // Track color
  const handleColorSelect = useCallback((c: string) => {
    setShowColorPicker(false);
    const store = useEditorStore.getState();
    store.updateTrack?.(track.id, { color: c });
  }, [track.id]);

  // Sync lock toggle
  const handleSyncLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const store = useEditorStore.getState();
    (store as any).toggleSyncLock?.(track.id);
  }, [track.id]);

  // Resize handle
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStartRef.current = { y: e.clientY, h: trackHeight };
    setIsResizing(true);

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - resizeStartRef.current.y;
      const newH = Math.max(24, Math.min(200, resizeStartRef.current.h + delta));
      onHeightChange(track.id, newH);
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [trackHeight, track.id, onHeightChange]);

  const syncLocked = (useEditorStore.getState() as any).syncLockedTrackIds?.includes(track.id);

  return (
    <div
      className={`track-header${isSelected ? ' selected' : ''}`}
      style={{ height: trackHeight, position: 'relative' }}
      onClick={() => selectTrack(track.id)}
      role="rowheader"
      aria-label={`Track ${track.name}`}
      aria-selected={isSelected}
    >
      {/* Color indicator bar */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          background: track.color || color,
          borderRadius: '2px 0 0 2px',
          cursor: 'pointer',
        }}
        onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
        title="Click to change track color"
      />

      {/* Color picker popup */}
      {showColorPicker && (
        <div style={{
          position: 'absolute', left: 8, top: '100%', zIndex: 100,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          borderRadius: 6, padding: 6, display: 'flex', gap: 4, flexWrap: 'wrap', width: 120,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}>
          {TRACK_COLORS.map(c => (
            <div
              key={c}
              style={{
                width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer',
                border: c === (track.color || color) ? '2px solid white' : '1px solid transparent',
              }}
              onClick={(e) => { e.stopPropagation(); handleColorSelect(c); }}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, marginLeft: 8, overflow: 'hidden' }}>
        {/* Track badge */}
        <div className="track-badge" style={{ background: track.color || color, fontSize: 9, padding: '1px 4px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {track.type === 'VIDEO' ? 'V' : track.type === 'AUDIO' ? 'A' : track.type.charAt(0)}
        </div>

        {/* Track name (double-click to rename) */}
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setIsRenaming(false); }}
            style={{
              background: 'var(--bg-void)', border: '1px solid var(--brand)',
              color: 'var(--text-primary)', fontSize: 10, padding: '0 4px',
              borderRadius: 2, width: 50, outline: 'none',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="track-name"
            title={`${track.name} (double-click to rename)`}
            style={{ color: track.color || color, cursor: 'text', fontSize: 10 }}
            onDoubleClick={handleDoubleClick}
          >
            {track.name}
          </span>
        )}
      </div>

      {/* Volume mini-slider for audio tracks */}
      {track.type === 'AUDIO' && trackHeight >= 48 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 2 }}>
          <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>Vol</span>
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={track.volume}
            onChange={(e) => { e.stopPropagation(); setTrackVolume(track.id, +e.target.value); }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 40, height: 10, accentColor: track.color || color }}
            aria-label={`${track.name} volume`}
          />
        </div>
      )}

      <div className="track-icons" role="group" aria-label={`${track.name} controls`}>
        <button
          className={`track-icon-btn${track.muted ? ' active' : ''}`}
          title={track.muted ? 'Unmute' : 'Mute'}
          aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
          aria-pressed={track.muted}
          onClick={(e) => { e.stopPropagation(); toggleMute(track.id); }}
        >
          M
        </button>
        <button
          className={`track-icon-btn solo${track.solo ? ' active' : ''}`}
          title={track.solo ? 'Unsolo' : 'Solo'}
          aria-label={track.solo ? `Unsolo ${track.name}` : `Solo ${track.name}`}
          aria-pressed={track.solo}
          onClick={(e) => { e.stopPropagation(); toggleSolo(track.id); }}
        >
          S
        </button>
        <button
          className={`track-icon-btn lock${track.locked ? ' active' : ''}`}
          title={track.locked ? 'Unlock' : 'Lock'}
          aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
          aria-pressed={track.locked}
          onClick={(e) => { e.stopPropagation(); toggleLock(track.id); }}
        >
          L
        </button>
        {/* Sync Lock button (Avid-style) */}
        <button
          className={`track-icon-btn${syncLocked ? ' active' : ''}`}
          title={syncLocked ? 'Remove Sync Lock' : 'Add Sync Lock'}
          aria-label={`Sync Lock ${track.name}`}
          aria-pressed={!!syncLocked}
          onClick={handleSyncLock}
          style={syncLocked ? { color: 'var(--warning-text)', fontWeight: 700, fontSize: 8 } : { fontSize: 8 }}
        >
          SL
        </button>
      </div>

      {/* Resize handle at bottom */}
      <div
        style={{
          position: 'absolute', bottom: -2, left: 0, right: 0, height: 5,
          cursor: 'row-resize', zIndex: 10,
          background: isResizing ? 'var(--brand)' : 'transparent',
        }}
        onMouseDown={handleResizeStart}
        title="Drag to resize track height"
      />
    </div>
  );
});

export const TrackHeaders = memo(function TrackHeaders() {
  const tracks = useEditorStore((s) => s.tracks);
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>({});

  const handleHeightChange = useCallback((trackId: string, height: number) => {
    setTrackHeights(prev => ({ ...prev, [trackId]: height }));
    // Update CSS custom property on the corresponding track lane
    const lane = document.querySelector(`[data-track-id="${trackId}"]`) as HTMLElement;
    if (lane) lane.style.height = `${height}px`;
  }, []);

  return (
    <div className="track-headers" role="rowgroup" aria-label="Track headers">
      <div className="ruler-spacer" />
      {tracks.map((track) => (
        <TrackHeader
          key={track.id}
          track={track}
          trackHeight={trackHeights[track.id] ?? 48}
          onHeightChange={handleHeightChange}
        />
      ))}
    </div>
  );
});
