import React, { memo } from 'react';
import { toTimecode } from '../../lib/timecode';
import { useCollabStore } from '../../store/collab.store';
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

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

const TrackHeader = memo(function TrackHeader({ track }: TrackHeaderProps) {
  const { selectedTrackId, selectTrack, toggleMute, toggleSolo, toggleLock, videoMonitorTrackId, setVideoMonitorTrack } =
    useEditorStore();
  const fps = useEditorStore((state) => state.sequenceSettings.fps || state.projectSettings.frameRate || 24);
  const onlineUsers = useCollabStore((state) => state.onlineUsers);
  const currentUserId = useCollabStore((state) => state.currentUserId);
  const isSelected = selectedTrackId === track.id;
  const isVideoTrack = track.type === 'VIDEO' || track.type === 'GRAPHIC';
  const isMonitored = videoMonitorTrackId === track.id;
  const color = TRACK_TYPE_COLOR[track.type] ?? 'var(--text-muted)';
  const collaboratorsOnTrack = onlineUsers.filter((user) => user.id !== currentUserId && user.cursorTrackId === track.id);
  const visibleCollaborators = collaboratorsOnTrack.slice(0, 2);
  const overflowCollaboratorCount = Math.max(0, collaboratorsOnTrack.length - visibleCollaborators.length);
  const leadCollaborator = visibleCollaborators[0];
  const leadPlayheadTime = leadCollaborator?.playheadTime
    ?? (typeof leadCollaborator?.cursorFrame === 'number' ? leadCollaborator.cursorFrame / fps : null);

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

      {visibleCollaborators.length > 0 && (
        <div className="track-presence" role="group" aria-label={`${track.name} collaborator presence`}>
          <div className="track-presence-badges" aria-hidden="true">
            {visibleCollaborators.map((user) => (
              <span
                key={user.id}
                className={`track-presence-badge${user.isOnline ? '' : ' offline'}`}
                style={{
                  background: user.color,
                }}
                title={`${user.name}${user.isOnline ? '' : ' (offline)'}${typeof user.playheadTime === 'number' ? ` • ${toTimecode(user.playheadTime, fps)}` : ''}`}
              >
                {getInitials(user.name)}
              </span>
            ))}
            {overflowCollaboratorCount > 0 && (
              <span className="track-presence-overflow">+{overflowCollaboratorCount}</span>
            )}
          </div>
          {typeof leadPlayheadTime === 'number' && (
            <span className="track-presence-time" title={`${leadCollaborator?.name} playhead`}>
              {toTimecode(leadPlayheadTime, fps)}
            </span>
          )}
        </div>
      )}

      <div className="track-icons" role="group" aria-label={`${track.name} controls`}>
        {isVideoTrack && (
          <button
            className={`track-icon-btn${isMonitored ? ' active' : ''}`}
            title={isMonitored ? 'Monitored video track' : 'Set monitored video track'}
            aria-label={isMonitored ? `${track.name} is the monitored video track` : `Monitor ${track.name}`}
            aria-pressed={isMonitored}
            onClick={(e) => {
              e.stopPropagation();
              setVideoMonitorTrack(track.id);
            }}
          >
            MON
          </button>
        )}
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
