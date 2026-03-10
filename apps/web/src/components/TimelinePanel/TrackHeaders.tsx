import React, { memo } from 'react';
import { useEditorStore } from '../../store/editor.store';
import type { Track } from '../../store/editor.store';

const TRACK_TYPE_COLOR: Record<string, string> = {
  VIDEO: 'var(--track-video, #5b6af5)',
  AUDIO: 'var(--track-audio, #2bb672)',
  EFFECT: 'var(--track-effect, #e8943a)',
  SUBTITLE: 'var(--track-sub, #6bc5e3)',
  GRAPHIC: 'var(--track-gfx, #fb7185)',
};

interface TrackHeaderProps {
  track: Track;
}

const TrackHeader = memo(function TrackHeader({ track }: TrackHeaderProps) {
  const { selectedTrackId, selectTrack, toggleMute, toggleSolo, toggleLock } =
    useEditorStore();
  const isSelected = selectedTrackId === track.id;
  const color = TRACK_TYPE_COLOR[track.type] ?? 'var(--text-muted)';

  return (
    <div
      className={`track-header${isSelected ? ' selected' : ''}`}
      style={{ height: 'var(--track-h)' }}
      onClick={() => selectTrack(track.id)}
      role="rowheader"
      aria-label={`Track ${track.name}`}
      aria-selected={isSelected}
    >
      {/* Figma-style colored track badge */}
      <div className="track-badge" style={{ background: color }}>
        {track.name}
      </div>

      {/* Secondary track name colored text */}
      <span className="track-name" title={track.name} style={{ color }}>
        {track.name}
      </span>

      <div className="track-icons" role="group" aria-label={`${track.name} controls`}>
        <button
          className={`track-icon-btn${track.muted ? ' active' : ''}`}
          title={track.muted ? 'Unmute' : 'Mute'}
          aria-label={track.muted ? `Unmute ${track.name}` : `Mute ${track.name}`}
          aria-pressed={track.muted}
          onClick={(e) => {
            e.stopPropagation();
            toggleMute(track.id);
          }}
        >
          M
        </button>
        <button
          className={`track-icon-btn solo${track.solo ? ' active' : ''}`}
          title={track.solo ? 'Unsolo' : 'Solo'}
          aria-label={track.solo ? `Unsolo ${track.name}` : `Solo ${track.name}`}
          aria-pressed={track.solo}
          onClick={(e) => {
            e.stopPropagation();
            toggleSolo(track.id);
          }}
        >
          S
        </button>
        <button
          className={`track-icon-btn lock${track.locked ? ' active' : ''}`}
          title={track.locked ? 'Unlock' : 'Lock'}
          aria-label={track.locked ? `Unlock ${track.name}` : `Lock ${track.name}`}
          aria-pressed={track.locked}
          onClick={(e) => {
            e.stopPropagation();
            toggleLock(track.id);
          }}
        >
          L
        </button>
      </div>
    </div>
  );
});

export const TrackHeaders = memo(function TrackHeaders() {
  const tracks = useEditorStore((s) => s.tracks);

  return (
    <div className="track-headers" role="rowgroup" aria-label="Track headers">
      <div className="ruler-spacer" />
      {tracks.map((track) => (
        <TrackHeader key={track.id} track={track} />
      ))}
    </div>
  );
});
